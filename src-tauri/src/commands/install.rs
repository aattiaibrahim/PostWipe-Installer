//! "Install all at once" (Ninite-style): installs downloaded apps silently, one after another,
//! with no installer windows. Apps whose installer can only run as a click-through wizard are
//! never opened automatically; they come back as `Manual` for the user to run when they choose.
//!
//! What may run, and how, never comes from the webview. The page only names files; this
//! module decides everything else:
//! - the file must be inside PostWipeDownloads and must have passed verify.rs in THIS session
//!   (the download manager's record), with its SHA-256 unchanged since then;
//! - the switches come from the catalog compiled into the app (`platforms.windows.install`,
//!   written by scripts/install-args.mjs); nothing else is ever passed;
//! - installers that need admin run in ONE elevated batch (a single UAC prompt that names
//!   PostWipe Installer): the app relaunches ITSELF elevated with `--postwipe-install-batch`,
//!   exits before any window opens, and that copy re-derives every switch from its own built-in
//!   catalog and re-checks each file's hash right before starting it. The batch's instructions
//!   travel on the command line (set by us, not a file another program could edit);
//! - per-user installers (Discord, Spotify, VS Code user setup…) run as the signed-in user, as
//!   they must: elevated, they can land in the wrong profile or refuse to install.
//!
//! Windows only for now.

use crate::catalog::loader;
use crate::catalog::model::Os;
use crate::commands::download::postwipe_downloads_dir;
use crate::downloader::DownloadManager;
use crate::shell::{contained_in, ps_quote};
use dashmap::DashMap;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

/// How long one installer may run before we stop waiting for it (it keeps running; we move on).
const STEP_TIMEOUT: Duration = Duration::from_secs(30 * 60);
/// How long the elevated batch may take to start (the UAC prompt is up in the meantime).
const ELEVATION_START_TIMEOUT: Duration = Duration::from_secs(5 * 60);
/// Windows' command-line limit is 32,767 characters; stay well under it per elevated batch.
const MAX_CMDLINE: usize = 28_000;
/// The flag that turns this exe into the headless elevated installer.
pub const BATCH_FLAG: &str = "--postwipe-install-batch";
/// ERROR_ELEVATION_REQUIRED: the exe's manifest demands admin, so CreateProcess refuses it.
#[cfg(windows)]
const ERROR_ELEVATION_REQUIRED: i32 = 740;

#[derive(Default)]
pub struct InstallSessions(DashMap<String, Arc<AtomicBool>>);

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StepState {
    Waiting,
    Running,
    Installed,
    Failed,
    Skipped,
    Opened,
    Portable,
    TimedOut,
    /// Only has its own click-through installer: downloaded, left for the user to run.
    Manual,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedStep {
    /// Exactly as the page sent it, so it can match the row.
    pub path: String,
    pub state: StepState,
    /// "silent" | "interactive" | "open" | "portable" | "none"
    pub mode: &'static str,
    pub admin: bool,
    pub detail: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    pub session_id: String,
    pub steps: Vec<PlannedStep>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StepEvent<'a> {
    session_id: &'a str,
    path: &'a str,
    state: StepState,
    detail: Option<String>,
}

#[derive(Clone)]
enum Mode {
    Silent(Vec<String>),
    Interactive,
    /// Handed to Windows' default handler (MSIX / App Installer packages).
    Open,
}

#[derive(Clone)]
struct Runnable {
    original: String,
    file: PathBuf,
    app_id: String,
    sha256: String,
    mode: Mode,
}

fn emit(app: &AppHandle, session: &str, path: &str, state: StepState, detail: Option<String>) {
    let _ = app.emit("install://step", StepEvent { session_id: session, path, state, detail });
}

fn ext(path: &Path) -> String {
    path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// How an app's downloaded file is installed, from the catalog compiled into this binary and
/// the file's type. The app and its elevated copy both call this, so they always agree.
fn mode_for(app_id: &str, file: &Path) -> Result<(Mode, bool), (StepState, &'static str)> {
    let spec = loader::load_catalog()
        .categories
        .iter()
        .flat_map(|c| &c.apps)
        .find(|a| a.id == app_id)
        .and_then(|a| a.platforms.get(&Os::Windows))
        .map(|p| p.install.clone().unwrap_or_default())
        .ok_or((StepState::Skipped, "Specials aren't installed automatically."))?;
    match ext(file).as_str() {
        "msi" => Ok((Mode::Silent(vec![]), true)),
        "exe" if spec.portable => Err((StepState::Portable, "Portable app: it runs straight from the folder.")),
        "exe" if spec.args.is_empty() => Ok((Mode::Interactive, spec.admin)),
        "exe" => Ok((Mode::Silent(spec.args), spec.admin)),
        "msix" | "msixbundle" | "appinstaller" => Ok((Mode::Open, false)),
        _ => Err((StepState::Portable, "Nothing to install: it's ready in the folder.")),
    }
}

/// Works out what to do with each file. Anything that can't be run is reported in the plan
/// with its reason, so the page can show it straight away.
fn plan(manager: &DownloadManager, root: &Path, paths: Vec<String>) -> (Vec<PlannedStep>, Vec<(Runnable, bool)>) {
    let mut planned = Vec::new();
    let mut runnable = Vec::new();
    for original in paths {
        let skip = |detail: &str, mode: &'static str, state: StepState| PlannedStep {
            path: original.clone(),
            state,
            mode,
            admin: false,
            detail: Some(detail.to_string()),
        };
        let file = match contained_in(root, &original) {
            Ok(f) => f,
            Err(e) => {
                planned.push(skip(&e, "none", StepState::Skipped));
                continue;
            }
        };
        let Some(record) = manager.verified_file(&file) else {
            planned.push(skip(
                "Only files downloaded and verified since PostWipe opened can be installed for you.",
                "none",
                StepState::Skipped,
            ));
            continue;
        };
        let (mode, admin) = match mode_for(&record.app_id, &file) {
            // Never pop a wizard during a batch: those wait for the user's click.
            Ok((Mode::Interactive | Mode::Open, _)) => {
                planned.push(skip("It only has its own installer. Run it when you're ready.", "manual", StepState::Manual));
                continue;
            }
            Ok(m) => m,
            Err((state, detail)) => {
                let kind = if state == StepState::Portable { "portable" } else { "none" };
                planned.push(skip(detail, kind, state));
                continue;
            }
        };
        planned.push(PlannedStep {
            path: original.clone(),
            state: StepState::Waiting,
            mode: match mode {
                Mode::Silent(_) => "silent",
                Mode::Interactive => "interactive",
                Mode::Open => "open",
            },
            admin,
            detail: None,
        });
        runnable.push((Runnable { original, file, app_id: record.app_id, sha256: record.sha256, mode }, admin));
    }
    (planned, runnable)
}

#[tauri::command]
pub fn install_downloads(
    app_handle: AppHandle,
    manager: State<'_, DownloadManager>,
    sessions: State<'_, InstallSessions>,
    paths: Vec<String>,
) -> Result<InstallPlan, String> {
    if !cfg!(windows) {
        return Err("Install for me is Windows-only for now.".into());
    }
    if paths.is_empty() || paths.len() > 200 {
        return Err("Nothing to install.".into());
    }
    let root = postwipe_downloads_dir(&app_handle)?;
    let (steps, runnable) = plan(&manager, &root, paths);
    let session_id = uuid::Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    sessions.0.insert(session_id.clone(), cancel.clone());

    let app = app_handle.clone();
    let id = session_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (admin, user): (Vec<_>, Vec<_>) = runnable.into_iter().partition(|(_, admin)| *admin);
        let admin: Vec<Runnable> = admin.into_iter().map(|(r, _)| r).collect();
        let user: Vec<Runnable> = user.into_iter().map(|(r, _)| r).collect();
        // Admin batch first: the one UAC prompt comes up right away, then the user can walk off.
        if !admin.is_empty() {
            run_elevated(&app, &id, &admin, &cancel);
        }
        for step in &user {
            run_as_user(&app, &id, step, &cancel);
        }
        let _ = app.emit("install://finished", &id);
        if let Some(sessions) = app.try_state::<InstallSessions>() {
            sessions.0.remove(&id);
        }
    });

    Ok(InstallPlan { session_id, steps })
}

#[tauri::command]
pub fn cancel_install(app_handle: AppHandle, sessions: State<'_, InstallSessions>, session_id: String) {
    if let Some(flag) = sessions.0.get(&session_id) {
        flag.store(true, Ordering::SeqCst);
    }
    // The elevated batch can't see our memory; it looks for this file between installers.
    if let Ok(path) = cancel_file(&app_handle, &session_id) {
        let _ = std::fs::write(path, b"cancel");
    }
}

fn work_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("install");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn cancel_file(app: &AppHandle, session: &str) -> Result<PathBuf, String> {
    // Session ids are our own UUIDs; anything else can't name a file.
    if session.is_empty() || !session.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("bad session".into());
    }
    Ok(work_dir(app)?.join(format!("{session}.cancel")))
}

fn sha256_file(path: &Path) -> Option<String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

fn exit_state(code: Option<i32>) -> (StepState, Option<String>) {
    match code {
        Some(0) => (StepState::Installed, None),
        Some(3010) | Some(1641) => (StepState::Installed, Some("Finishes after a restart.".into())),
        Some(c) => (StepState::Failed, Some(format!("The installer stopped with code {c}."))),
        None => (StepState::Failed, Some("The installer stopped unexpectedly.".into())),
    }
}

// ─── Per-user installers ────────────────────────────────────────────────────────────────

fn run_as_user(app: &AppHandle, session: &str, step: &Runnable, cancel: &AtomicBool) {
    let path = step.original.as_str();
    if cancel.load(Ordering::SeqCst) {
        return emit(app, session, path, StepState::Skipped, Some("Cancelled.".into()));
    }
    if sha256_file(&step.file).as_deref() != Some(step.sha256.as_str()) {
        return emit(app, session, path, StepState::Failed, Some("The file changed after it was verified, so it wasn't run.".into()));
    }
    emit(app, session, path, StepState::Running, None);

    let args: &[String] = match &step.mode {
        Mode::Open => {
            let opened = app.opener().open_path(step.file.to_string_lossy().to_string(), None::<&str>);
            return match opened {
                Ok(()) => emit(app, session, path, StepState::Opened, Some("Opened its installer. Finish it there.".into())),
                Err(e) => emit(app, session, path, StepState::Failed, Some(e.to_string())),
            };
        }
        Mode::Silent(args) => args,
        Mode::Interactive => &[],
    };

    let mut child = match std::process::Command::new(&step.file).args(args).spawn() {
        Ok(child) => child,
        Err(err) => {
            // The exe insists on admin: let Windows ask for it the normal way.
            #[cfg(windows)]
            if err.raw_os_error() == Some(ERROR_ELEVATION_REQUIRED) {
                let opened = app.opener().open_path(step.file.to_string_lossy().to_string(), None::<&str>);
                return match opened {
                    Ok(()) => emit(app, session, path, StepState::Opened, Some("It needed admin, so Windows asked separately.".into())),
                    Err(e) => emit(app, session, path, StepState::Failed, Some(e.to_string())),
                };
            }
            return emit(app, session, path, StepState::Failed, Some(format!("Couldn't start it: {err}")));
        }
    };

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let (state, detail) = exit_state(status.code());
                return emit(app, session, path, state, detail);
            }
            Ok(None) if started.elapsed() > STEP_TIMEOUT => {
                return emit(app, session, path, StepState::TimedOut, Some("Still running after 30 minutes; moved on.".into()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(400)),
            Err(e) => return emit(app, session, path, StepState::Failed, Some(e.to_string())),
        }
    }
}

// ─── The elevated batch ─────────────────────────────────────────────────────────────────

/// Command-line arguments for one elevated batch:
/// `--postwipe-install-batch <status file> <cancel file> <downloads folder> (<app id> <sha256> <path>)…`
fn batch_args(steps: &[Runnable], status: &Path, cancel: &Path, root: &Path) -> Vec<String> {
    let mut args = vec![
        BATCH_FLAG.to_string(),
        status.to_string_lossy().into_owned(),
        cancel.to_string_lossy().into_owned(),
        root.to_string_lossy().into_owned(),
    ];
    for step in steps {
        args.push(step.app_id.clone());
        args.push(step.sha256.clone());
        args.push(step.file.to_string_lossy().into_owned());
    }
    args
}

/// Windows command-line quoting for one argument. Our values never contain quotes (Windows
/// paths can't), but a trailing backslash before the closing quote would escape it.
fn cmdline_quote(arg: &str) -> String {
    let trimmed = arg.trim_end_matches('\\');
    let tail = &arg[trimmed.len()..];
    format!("\"{trimmed}{tail}{tail}\"")
}

/// Splits the admin steps so each batch's command line fits. Almost always one batch; each
/// extra batch means one more UAC prompt.
fn batches(steps: &[Runnable], status: &Path, cancel: &Path, root: &Path) -> Vec<Vec<Runnable>> {
    let len = |b: &[Runnable]| batch_args(b, status, cancel, root).iter().map(|a| a.len() + 3).sum::<usize>();
    let mut out: Vec<Vec<Runnable>> = Vec::new();
    let mut current: Vec<Runnable> = Vec::new();
    for step in steps {
        current.push(step.clone());
        if current.len() > 1 && len(&current) > MAX_CMDLINE {
            let last = current.pop().expect("just pushed");
            out.push(std::mem::take(&mut current));
            current.push(last);
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

fn run_elevated(app: &AppHandle, session: &str, steps: &[Runnable], cancel: &AtomicBool) {
    let fail_all = |steps: &[Runnable], state: StepState, detail: &str| {
        for step in steps {
            emit(app, session, &step.original, state, Some(detail.to_string()));
        }
    };
    let (Ok(dir), Ok(cancel_path), Ok(root), Ok(exe)) = (
        work_dir(app),
        cancel_file(app, session),
        postwipe_downloads_dir(app).and_then(|r| r.canonicalize().map_err(|e| e.to_string())),
        std::env::current_exe(),
    ) else {
        return fail_all(steps, StepState::Failed, "Couldn't prepare the install.");
    };
    let status_path = dir.join(format!("{session}.status"));

    for batch in batches(steps, &status_path, &cancel_path, &root) {
        if cancel.load(Ordering::SeqCst) {
            fail_all(&batch, StepState::Skipped, "Cancelled.");
            continue;
        }
        let _ = std::fs::remove_file(&status_path);
        let arg_line = batch_args(&batch, &status_path, &cancel_path, &root)
            .iter()
            .map(|a| cmdline_quote(a))
            .collect::<Vec<_>>()
            .join(" ");
        // Start-Process -Verb RunAs is the UAC prompt; it throws when the user says no. The
        // prompt names PostWipe Installer, since that's the program being elevated.
        let launcher = format!(
            "Start-Process -FilePath {} -Verb RunAs -ArgumentList {}",
            ps_quote(&exe.to_string_lossy()),
            ps_quote(&arg_line)
        );
        let mut cmd = std::process::Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-Command", &launcher]);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        match cmd.status() {
            Ok(status) if status.success() => {}
            _ => {
                fail_all(&batch, StepState::Skipped, "Admin permission was declined, so these weren't installed.");
                continue;
            }
        }
        follow_status(app, session, &batch, &status_path);
    }
    let _ = std::fs::remove_file(&status_path);
    let _ = std::fs::remove_file(&cancel_path);
}

/// Turns the elevated batch's status lines ("3 running", "3 exit 0", "done") into events.
fn follow_status(app: &AppHandle, session: &str, batch: &[Runnable], status_path: &Path) {
    let started = Instant::now();
    let mut seen = 0usize;
    let mut last_progress = Instant::now();
    let mut reported = vec![false; batch.len()];
    loop {
        let text = std::fs::read_to_string(status_path).unwrap_or_default();
        let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
        for line in lines.iter().skip(seen) {
            last_progress = Instant::now();
            if *line == "done" {
                for (i, done) in reported.iter().enumerate() {
                    if !done {
                        emit(app, session, &batch[i].original, StepState::Failed, Some("It didn't report back.".into()));
                    }
                }
                return;
            }
            let mut parts = line.splitn(3, ' ');
            let (Some(Ok(i)), Some(word)) = (parts.next().map(str::parse::<usize>), parts.next()) else { continue };
            let Some(step) = batch.get(i) else { continue };
            let rest = parts.next().unwrap_or("").trim();
            let (state, detail) = match word {
                "running" => (StepState::Running, None),
                "exit" => exit_state(rest.parse().ok()),
                "timeout" => (StepState::TimedOut, Some("Still running after 30 minutes; moved on.".into())),
                "changed" => (StepState::Failed, Some("The file changed after it was verified, so it wasn't run.".into())),
                "skipped" => (StepState::Skipped, Some("Cancelled.".into())),
                _ => (StepState::Failed, Some(if rest.is_empty() { "It couldn't be started.".into() } else { rest.to_string() })),
            };
            if state != StepState::Running {
                reported[i] = true;
            }
            emit(app, session, &step.original, state, detail);
        }
        seen = lines.len();
        // Before the first line the UAC prompt may still be up; after it, each installer
        // reports within STEP_TIMEOUT, so a longer silence means the batch died.
        let limit = if seen == 0 { ELEVATION_START_TIMEOUT } else { STEP_TIMEOUT + Duration::from_secs(120) };
        if last_progress.elapsed() > limit || started.elapsed() > STEP_TIMEOUT * (batch.len() as u32 + 1) {
            for (i, done) in reported.iter().enumerate() {
                if !done {
                    emit(app, session, &batch[i].original, StepState::Failed, Some("The admin installer stopped responding.".into()));
                }
            }
            return;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

/// Entry point for the elevated copy. `run()` calls this before building any window: if the
/// process was started with BATCH_FLAG it runs the batch and returns the exit code.
///
/// Everything on the command line is re-checked here as if hostile: each file must sit inside
/// the downloads folder, its hash must match, and the switches come from THIS binary's catalog
/// (by app id and file type), never from the command line.
pub fn maybe_run_elevated_batch() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) != Some(BATCH_FLAG) {
        return None;
    }
    if args.len() < 4 || !(args.len() - 4).is_multiple_of(3) {
        return Some(2);
    }
    let status = PathBuf::from(&args[1]);
    let cancel = PathBuf::from(&args[2]);
    let root = PathBuf::from(&args[3]);
    let log = |line: String| {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&status) {
            let _ = writeln!(f, "{line}");
        }
    };
    // The downloads folder must really be the user's PostWipeDownloads folder, not any folder
    // someone put on the command line.
    let root_ok = root.file_name().map(|n| n == "PostWipeDownloads").unwrap_or(false) && root.is_dir();
    for (i, triple) in args[4..].chunks(3).enumerate() {
        let (app_id, sha, path) = (&triple[0], &triple[1], &triple[2]);
        if cancel.exists() {
            log(format!("{i} skipped"));
            continue;
        }
        if !root_ok {
            log(format!("{i} error Not the PostWipe downloads folder."));
            continue;
        }
        let file = match contained_in(&root, path) {
            Ok(f) => f,
            Err(e) => {
                log(format!("{i} error {e}"));
                continue;
            }
        };
        let (mode, _admin) = match mode_for(app_id, &file) {
            Ok((Mode::Interactive | Mode::Open, _)) => {
                log(format!("{i} error It only has its own installer."));
                continue;
            }
            Ok(m) => m,
            Err((_, detail)) => {
                log(format!("{i} error {detail}"));
                continue;
            }
        };
        if sha256_file(&file).as_deref() != Some(sha.as_str()) {
            log(format!("{i} changed"));
            continue;
        }
        log(format!("{i} running"));
        let mut cmd = if ext(&file) == "msi" {
            let mut c = std::process::Command::new("msiexec.exe");
            c.arg("/i").arg(&file).args(["/qn", "/norestart"]);
            c
        } else {
            let mut c = std::process::Command::new(&file);
            if let Mode::Silent(a) = &mode {
                c.args(a);
            }
            c
        };
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                log(format!("{i} error Couldn't start it: {e}"));
                continue;
            }
        };
        let started = Instant::now();
        let line = loop {
            match child.try_wait() {
                Ok(Some(st)) => break format!("{i} exit {}", st.code().map(|c| c.to_string()).unwrap_or_default()),
                Ok(None) if started.elapsed() > STEP_TIMEOUT => break format!("{i} timeout"),
                Ok(None) => std::thread::sleep(Duration::from_millis(400)),
                Err(e) => break format!("{i} error {e}"),
            }
        };
        log(line);
    }
    log("done".into());
    Some(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(path: &str) -> Runnable {
        Runnable { original: path.into(), file: PathBuf::from(path), app_id: "steam".into(), sha256: "ab".repeat(32), mode: Mode::Interactive }
    }

    #[test]
    fn cmdline_quote_protects_trailing_backslashes() {
        assert_eq!(cmdline_quote(r"C:\a b\x.exe"), r#""C:\a b\x.exe""#);
        assert_eq!(cmdline_quote(r"C:\dir\"), r#""C:\dir\\""#);
    }

    #[test]
    fn batches_split_only_when_the_command_line_would_overflow() {
        let (status, cancel, root) = (Path::new(r"C:\s.status"), Path::new(r"C:\s.cancel"), Path::new(r"C:\d"));
        let few: Vec<_> = (0..5).map(|i| step(&format!(r"C:\d\app{i}.exe"))).collect();
        assert_eq!(batches(&few, status, cancel, root).len(), 1);
        let many: Vec<_> = (0..200)
            .map(|i| step(&format!(r"C:\Users\someone\Downloads\PostWipeDownloads\a-long-installer-name-{i}.exe")))
            .collect();
        let split = batches(&many, status, cancel, root);
        assert!(split.len() > 1);
        assert_eq!(split.iter().map(Vec::len).sum::<usize>(), 200);
    }

    #[test]
    fn modes_come_from_the_catalog_by_app_and_file_type() {
        let dir = std::env::temp_dir();
        assert!(matches!(mode_for("steam", &dir.join("SteamSetup.exe")), Ok((Mode::Silent(a), true)) if a == ["/S"]));
        assert!(matches!(mode_for("spotify", &dir.join("SpotifySetup.exe")), Ok((Mode::Silent(_), false))));
        assert!(matches!(mode_for("battle-net", &dir.join("Battle.net-Setup.exe")), Ok((Mode::Interactive, false))));
        assert!(matches!(mode_for("epic-games", &dir.join("x.msi")), Ok((Mode::Silent(a), true)) if a.is_empty()));
        assert!(matches!(mode_for("codex", &dir.join("codex.exe")), Err((StepState::Portable, _))));
        assert!(matches!(mode_for("not-an-app", &dir.join("x.exe")), Err((StepState::Skipped, _))));
    }

    #[test]
    fn every_catalog_install_plan_is_sane() {
        let catalog = loader::load_catalog();
        for app in catalog.categories.iter().flat_map(|c| &c.apps) {
            let Some(spec) = app.platforms.get(&Os::Windows).and_then(|p| p.install.as_ref()) else { continue };
            assert!(!(spec.portable && !spec.args.is_empty()), "{}: portable apps take no switches", app.id);
            for arg in &spec.args {
                // Switches are joined with spaces into one ArgumentList string.
                assert!(!arg.contains(' ') && !arg.contains('"') && !arg.contains('\''), "{}: odd switch {arg}", app.id);
            }
        }
    }
}
