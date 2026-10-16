//! Account commands for the UI. The HTTP work lives in `crate::accounts`; this layer owns the
//! one long-lived secret — the session token — and keeps it on disk so a relaunch stays
//! signed in.
//!
//! The token file sits in the app config dir next to the theme and vault key, readable only
//! by the signed-in OS user. It is NOT invalidated on app update (unlike the vault key): the
//! account is the user's, not tied to a build, and re-entering a password plus a 2FA code after
//! every auto-update would be exactly the friction that makes people abandon an account.

use crate::accounts::{AccountApi, AccountUser, Profile, SaveOutcome, SignInOutcome, TwoFactorSetup, DEFAULT_BASE_URL};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

pub struct AccountState(pub AccountApi);

fn token_file(app_handle: &AppHandle) -> Option<PathBuf> {
    let dir = app_handle.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("account-session"))
}

/// Built at startup, seeded with any saved session.
pub fn init(app_handle: &AppHandle) -> AccountState {
    let token = token_file(app_handle)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty());
    // Debug builds can point at `wrangler dev` without touching the real accounts.
    let base = if cfg!(debug_assertions) {
        std::env::var("POSTWIPE_ACCOUNTS_URL").unwrap_or_else(|_| DEFAULT_BASE_URL.to_string())
    } else {
        DEFAULT_BASE_URL.to_string()
    };
    AccountState(AccountApi::new(base, token))
}

/// Mirror the in-memory token to disk after anything that can issue or revoke one.
fn persist(app_handle: &AppHandle, state: &AccountState) {
    let Some(path) = token_file(app_handle) else { return };
    match state.0.token() {
        Some(token) => {
            let _ = std::fs::write(path, token);
        }
        None => {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[tauri::command]
pub async fn account_status(app_handle: AppHandle, state: State<'_, AccountState>) -> Result<Option<AccountUser>, String> {
    let user = state.0.current_user().await;
    // An expired or revoked session clears the token inside current_user; drop the file too.
    persist(&app_handle, &state);
    user
}

#[tauri::command]
pub async fn account_sign_up(
    app_handle: AppHandle,
    state: State<'_, AccountState>,
    email: String,
    password: String,
) -> Result<AccountUser, String> {
    let user = state.0.sign_up(email.trim(), &password).await;
    persist(&app_handle, &state);
    user
}

#[tauri::command]
pub async fn account_sign_in(
    app_handle: AppHandle,
    state: State<'_, AccountState>,
    email: String,
    password: String,
) -> Result<SignInOutcome, String> {
    let outcome = state.0.sign_in(email.trim(), &password).await;
    persist(&app_handle, &state);
    outcome
}

/// Second step of a 2FA sign-in, or confirming 2FA setup. Returns the signed-in user.
#[tauri::command]
pub async fn account_verify_code(
    app_handle: AppHandle,
    state: State<'_, AccountState>,
    code: String,
    backup: bool,
) -> Result<Option<AccountUser>, String> {
    let verified = if backup { state.0.verify_backup_code(&code).await } else { state.0.verify_totp(&code).await };
    persist(&app_handle, &state);
    verified?;
    state.0.current_user().await
}

#[tauri::command]
pub async fn account_enable_two_factor(state: State<'_, AccountState>, password: String) -> Result<TwoFactorSetup, String> {
    state.0.enable_two_factor(&password).await
}

#[tauri::command]
pub async fn account_disable_two_factor(state: State<'_, AccountState>, password: String) -> Result<(), String> {
    state.0.disable_two_factor(&password).await
}

#[tauri::command]
pub async fn account_generate_backup_codes(state: State<'_, AccountState>, password: String) -> Result<Vec<String>, String> {
    state.0.generate_backup_codes(&password).await
}

/// Saves backup codes as a text file in Downloads and shows it in Explorer/Finder.
///
/// The webview can only hand over codes, never a path or file name: the file always lands in
/// Downloads under a fixed name, and every code must look like a backup code, so this command
/// can't be turned into "write arbitrary text anywhere".
#[tauri::command]
pub fn account_save_backup_codes(app_handle: AppHandle, email: String, codes: Vec<String>) -> Result<String, String> {
    let valid_code = |c: &String| (4..=32).contains(&c.len()) && c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '-');
    if codes.is_empty() || codes.len() > 20 || !codes.iter().all(valid_code) {
        return Err("Those don't look like backup codes.".into());
    }
    let email: String = email.chars().filter(|c| !c.is_control()).take(254).collect();

    let dir = app_handle.path().download_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Never overwrite an earlier file: after regenerating, both copies should be obvious.
    let mut path = dir.join("PostWipe backup codes.txt");
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("PostWipe backup codes ({n}).txt"));
        n += 1;
    }

    let mut text = String::from("PostWipe Installer — two-factor backup codes\r\n");
    if !email.is_empty() {
        text.push_str(&format!("Account: {email}\r\n"));
    }
    text.push_str("Each code signs you in once. Move these into your password manager, then delete this file.\r\n\r\n");
    for code in &codes {
        text.push_str(code);
        text.push_str("\r\n");
    }
    // create_new: never follow a file (or link) that appeared at this path after the check.
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e| e.to_string())?;
    file.write_all(text.as_bytes()).map_err(|e| e.to_string())?;

    use tauri_plugin_opener::OpenerExt;
    let _ = app_handle.opener().reveal_item_in_dir(&path);
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn account_sign_out(app_handle: AppHandle, state: State<'_, AccountState>) -> Result<(), String> {
    let result = state.0.sign_out().await;
    persist(&app_handle, &state);
    result
}

#[tauri::command]
pub async fn account_delete(app_handle: AppHandle, state: State<'_, AccountState>, password: String) -> Result<(), String> {
    let result = state.0.delete_account(&password).await;
    persist(&app_handle, &state);
    result
}

#[tauri::command]
pub async fn profile_get(state: State<'_, AccountState>) -> Result<Profile, String> {
    state.0.get_profile().await
}

#[tauri::command]
pub async fn profile_save(state: State<'_, AccountState>, profile: Profile) -> Result<SaveOutcome, String> {
    state.0.save_profile(&profile).await
}
