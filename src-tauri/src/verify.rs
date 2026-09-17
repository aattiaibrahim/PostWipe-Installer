//! Proves a finished download is the file its publisher released, before the user runs it.
//!
//! Two independent checks, because the catalog's sources differ:
//!   * **SHA-256** — GitHub publishes a digest for every release asset, and the Specials vault
//!     keeps a manifest of its own. When a digest exists it must match exactly.
//!   * **Code signature** — vendor sites (Steam, Discord, NVIDIA…) publish no hashes and change
//!     versions constantly, but their installers are signed. Windows checks Authenticode,
//!     macOS checks codesign/pkgutil. A broken signature always blocks; when the catalog names
//!     the expected signer, a file signed by anyone else blocks too.
//!
//! Unsigned files without a published hash are allowed (plenty of good open-source tools ship
//! that way) and say so, rather than pretending to be verified.

use std::path::Path;

/// What the user is told, or why the file was deleted.
pub enum Outcome {
    Passed(String),
    Blocked(String),
}

enum Signature {
    /// `signer` is what the user is shown; `names` are every name on the certificate that a
    /// catalog `signer` may match (organization and common name).
    Valid { signer: String, names: Vec<String> },
    /// Signed, but the OS doesn't trust the certificate chain (self-signed, unknown root).
    Untrusted { signer: String },
    Unsigned,
    /// The signature doesn't match the file: it was modified after signing.
    Broken(String),
    /// Not a signable file type on this OS (zip, 7z, …), or the check itself couldn't run.
    NotChecked,
}

pub async fn check(
    path: &Path,
    actual_sha256: &str,
    expected_sha256: Option<&str>,
    expected_signer: Option<&str>,
    hash_source: &str,
) -> Outcome {
    let hash_ok = match expected_sha256 {
        Some(expected) if !expected.eq_ignore_ascii_case(actual_sha256) => {
            return Outcome::Blocked(format!(
                "Blocked: this file doesn't match the SHA-256 {hash_source} published for it, so it may have been \
                 tampered with or corrupted in transit. It was deleted."
            ));
        }
        Some(_) => true,
        None => false,
    };

    let owned = path.to_path_buf();
    let signature = tauri::async_runtime::spawn_blocking(move || signature_of(&owned))
        .await
        .unwrap_or(Signature::NotChecked);

    if let Signature::Broken(reason) = &signature {
        return Outcome::Blocked(format!(
            "Blocked: the installer's digital signature is invalid ({reason}), which means it was changed after the \
             publisher signed it. It was deleted."
        ));
    }

    if let Some(expected) = expected_signer {
        match &signature {
            Signature::Valid { names, .. } if names.iter().any(|n| signer_matches(expected, n)) => {}
            Signature::Valid { signer, .. } | Signature::Untrusted { signer } => {
                return Outcome::Blocked(format!(
                    "Blocked: this installer should be signed by {expected}, but it's signed by {}. It was deleted.", signer.trim_end_matches('.')
                ));
            }
            Signature::Unsigned => {
                return Outcome::Blocked(format!(
                    "Blocked: this installer should be signed by {expected}, but it isn't signed at all. It was deleted."
                ));
            }
            // Can't run the check (e.g. PowerShell unavailable): don't block on our own failure.
            _ => {}
        }
    }

    let hash_note = if hash_ok { Some(format!("SHA-256 matches {hash_source}")) } else { None };
    let sig_note = match &signature {
        Signature::Valid { signer, .. } => Some(format!("signed by {signer}")),
        Signature::Untrusted { signer } => Some(format!("signed by {signer} (certificate not trusted by the OS)")),
        Signature::Unsigned if !hash_ok => Some("not signed, and the publisher lists no checksum".to_string()),
        _ => None,
    };
    let summary = match (hash_note, sig_note) {
        (Some(h), Some(s)) => format!("Verified: {h} · {s}"),
        (Some(h), None) => format!("Verified: {h}"),
        (None, Some(s)) if matches!(signature, Signature::Valid { .. }) => format!("Verified: {s}"),
        (None, Some(s)) => format!("Unverified: {s}"),
        (None, None) => "Unverified: no checksum or signature to check for this file type".to_string(),
    };
    Outcome::Passed(summary)
}

/// The same name, ignoring case, punctuation and legal suffixes ("Valve Corp." = "Valve
/// Corporation"). Deliberately NOT a substring match: "Open Source Developer" must not stand in
/// for "Open Source Developer, Scott Rae", or every open-source certificate would pass.
fn signer_matches(expected: &str, actual: &str) -> bool {
    let norm = |s: &str| {
        s.to_lowercase()
            .replace([',', '.', '"'], " ")
            .split_whitespace()
            .filter(|w| !matches!(*w, "inc" | "corp" | "corporation" | "llc" | "ltd" | "limited" | "gmbh" | "co" | "sa" | "ab" | "bv" | "oy"))
            .collect::<Vec<_>>()
            .join(" ")
    };
    let (e, a) = (norm(expected), norm(actual));
    !e.is_empty() && e == a
}

fn extension(path: &Path) -> String {
    path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

#[cfg(windows)]
fn signature_of(path: &Path) -> Signature {
    if !matches!(extension(path).as_str(), "exe" | "msi" | "msix" | "msixbundle" | "appx" | "appxbundle") {
        return Signature::NotChecked;
    }
    let script = format!(
        "$s = Get-AuthenticodeSignature -LiteralPath {}; $c = $s.SignerCertificate; \
         $o = if ($c) {{ $c.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) }} else {{ '' }}; \
         $org = if ($c -and $c.Subject -match '(?:^|,\\s*)O=(\"[^\"]+\"|[^,]+)') {{ $Matches[1].Trim('\"') }} else {{ '' }}; \
         Write-Output (\"{{0}}`t{{1}}`t{{2}}\" -f $s.Status, $org, $o)",
        crate::shell::ps_quote(&path.to_string_lossy())
    );
    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &script]);
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let Ok(out) = cmd.output() else { return Signature::NotChecked };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut parts = text.trim().splitn(3, '\t');
    let status = parts.next().unwrap_or_default();
    let org = parts.next().unwrap_or_default().trim();
    let cn = parts.next().unwrap_or_default().trim();
    // Certum's individual open-source certificates all say O=Open Source Developer; the
    // person's name in CN is the meaningful one there.
    let signer = if org.is_empty() || org == "Open Source Developer" { cn } else { org }.to_string();
    let names = [org, cn].iter().filter(|n| !n.is_empty()).map(|n| n.to_string()).collect();
    match status {
        "Valid" => Signature::Valid { signer, names },
        "NotSigned" => Signature::Unsigned,
        "HashMismatch" => Signature::Broken("the file's contents don't match its signature".into()),
        "NotTrusted" => Signature::Untrusted { signer },
        _ => Signature::NotChecked,
    }
}

#[cfg(target_os = "macos")]
fn signature_of(path: &Path) -> Signature {
    let run = |program: &str, args: &[&str]| std::process::Command::new(program).args(args).output().ok();
    let p = path.to_string_lossy().to_string();
    match extension(path).as_str() {
        "dmg" | "app" => {
            let Some(verify) = run("codesign", &["--verify", "--verbose=2", &p]) else { return Signature::NotChecked };
            let err = String::from_utf8_lossy(&verify.stderr).to_string();
            if !verify.status.success() {
                if err.contains("not signed at all") {
                    return Signature::Unsigned;
                }
                return Signature::Broken(err.lines().last().unwrap_or("codesign rejected it").trim().to_string());
            }
            let details = run("codesign", &["-dvv", &p]).map(|o| String::from_utf8_lossy(&o.stderr).to_string()).unwrap_or_default();
            let signer = details
                .lines()
                .find_map(|l| l.strip_prefix("Authority="))
                .map(clean_apple_authority)
                .unwrap_or_default();
            Signature::Valid { names: vec![signer.clone()], signer }
        }
        "pkg" => {
            let Some(out) = run("pkgutil", &["--check-signature", &p]) else { return Signature::NotChecked };
            let text = String::from_utf8_lossy(&out.stdout).to_string();
            if text.contains("Status: no signature") {
                return Signature::Unsigned;
            }
            if !out.status.success() || text.contains("Status: signature invalid") {
                return Signature::Broken("pkgutil reports the signature is invalid".into());
            }
            let signer = text
                .lines()
                .map(str::trim)
                .find_map(|l| l.strip_prefix("1. "))
                .map(clean_apple_authority)
                .unwrap_or_default();
            Signature::Valid { names: vec![signer.clone()], signer }
        }
        _ => Signature::NotChecked,
    }
}

/// "Developer ID Application: Valve Corporation (MXGJJ98X76)" -> "Valve Corporation"
#[cfg(any(target_os = "macos", test))]
fn clean_apple_authority(raw: &str) -> String {
    let s = raw.trim();
    let s = s.split_once(": ").map(|(_, rest)| rest).unwrap_or(s);
    match s.rfind(" (") {
        Some(i) if s.ends_with(')') => s[..i].to_string(),
        _ => s.to_string(),
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
fn signature_of(_path: &Path) -> Signature {
    Signature::NotChecked
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signer_names_match_across_legal_suffixes() {
        assert!(signer_matches("Valve Corp.", "Valve Corporation"));
        assert!(signer_matches("Discord Inc.", "Discord, Inc."));
        assert!(!signer_matches("Valve Corp.", "Evil Software LLC"));
        assert!(!signer_matches("Inc.", "Anything Inc."));
        assert!(!signer_matches("Open Source Developer, Scott Rae", "Open Source Developer"));
        assert!(!signer_matches("Valve Corp.", "Valve Fan Club LLC"));
        assert!(signer_matches("Blizzard Entertainment, Inc.", "Blizzard Entertainment Inc"));
    }

    #[test]
    fn apple_authority_is_reduced_to_the_company() {
        assert_eq!(clean_apple_authority("Developer ID Application: Valve Corporation (MXGJJ98X76)"), "Valve Corporation");
        assert_eq!(clean_apple_authority("Developer ID Installer: Docker Inc (9BNSXJN65R)"), "Docker Inc");
    }

    #[tokio::test]
    async fn a_wrong_hash_blocks_and_a_right_one_passes() {
        let dir = std::env::temp_dir().join("postwipe-verify-test");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("tool.zip");
        std::fs::write(&file, b"hello").unwrap();
        let good = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        assert!(matches!(check(&file, good, Some(good), None, "GitHub").await, Outcome::Passed(s) if s.contains("SHA-256 matches GitHub")));
        let bad = "0000000000000000000000000000000000000000000000000000000000000000";
        assert!(matches!(check(&file, good, Some(bad), None, "GitHub").await, Outcome::Blocked(_)));
    }

    /// End to end on real installers: download through the app's own downloader, verify against
    /// the catalog's pinned signer, and prove a wrong pin blocks.
    /// `cargo test --lib -- --ignored --nocapture live_pinned_signers`
    #[cfg(windows)]
    #[tokio::test]
    #[ignore = "downloads real installers — run manually"]
    async fn live_pinned_signers() {
        use crate::catalog::model::{Os, ResolverSpec};
        let catalog = crate::catalog::loader::load_catalog();
        let dir = std::env::temp_dir().join("postwipe-live-verify");
        std::fs::create_dir_all(&dir).unwrap();
        for id in ["steam", "battle-net", "handbrake"] {
            let app = catalog.categories.iter().flat_map(|c| &c.apps).find(|a| a.id == id).unwrap();
            let platform = app.platforms.get(&Os::Windows).unwrap();
            let spec = platform.resolver.clone().unwrap();
            let resolved = match &spec {
                ResolverSpec::GithubRelease { .. } => crate::resolver::github_release_resolver::resolve_with_digest(&spec).await.unwrap(),
                ResolverSpec::Static { .. } => crate::resolver::Resolved { url: crate::resolver::static_resolver::resolve(&spec).unwrap(), sha256: None },
                ResolverSpec::Html { .. } => crate::resolver::Resolved { url: crate::resolver::html_resolver::resolve(&spec).await.unwrap(), sha256: None },
                ResolverSpec::HtmlRegex { .. } => crate::resolver::Resolved { url: crate::resolver::html_regex_resolver::resolve(&spec).await.unwrap(), sha256: None },
                ResolverSpec::Webview { .. } => continue,
            };
            let dest = dir.join(platform.filename.clone().unwrap());
            let token = tokio_util::sync::CancellationToken::new();
            let actual = crate::downloader::job::run(&resolved.url, &dest, &token, |_, _| {}).await.unwrap();
            let pinned = platform.signer.as_deref();
            match check(&dest, &actual, resolved.sha256.as_deref(), pinned, "GitHub").await {
                Outcome::Passed(s) => println!("{id}: {s}"),
                Outcome::Blocked(r) => panic!("{id} should pass: {r}"),
            }
            match check(&dest, &actual, None, Some("Definitely Not The Publisher Ltd"), "GitHub").await {
                Outcome::Blocked(r) => println!("{id} with a wrong pin: {r}"),
                Outcome::Passed(s) => panic!("{id} with a wrong pin must block, got: {s}"),
            }
            let _ = std::fs::remove_file(&dest);
        }
    }

    /// PowerShell and the Windows Authenticode check, on a real embedded signature: node.exe
    /// (signed by the OpenJS Foundation), which CI and dev machines both have.
    #[cfg(windows)]
    #[test]
    fn windows_reads_a_real_signature_and_catches_tampering() {
        let Some(node) = std::process::Command::new("where")
            .arg("node")
            .output()
            .ok()
            .and_then(|o| String::from_utf8_lossy(&o.stdout).lines().next().map(|l| std::path::PathBuf::from(l.trim())))
        else {
            return;
        };
        let copy = std::env::temp_dir().join("postwipe-verify-signed.exe");
        std::fs::copy(&node, &copy).unwrap();
        match signature_of(&copy) {
            Signature::Valid { signer, names } => assert!(names.iter().any(|n| signer_matches("OpenJS Foundation", n)), "signer was {signer}"),
            // GitHub's runners put an unsigned or re-packaged node.exe first on PATH; the official
            // installer's copy (dev machines) is signed. Nothing to prove without a signed file.
            _ => {
                eprintln!("skipped: {} isn't an Authenticode-signed node.exe", node.display());
                let _ = std::fs::remove_file(copy);
                return;
            }
        }
        // Flip one byte: the Authenticode hash no longer matches, and the file must be refused.
        let mut bytes = std::fs::read(&copy).unwrap();
        let mid = bytes.len() / 2;
        bytes[mid] ^= 0xFF;
        std::fs::write(&copy, &bytes).unwrap();
        assert!(matches!(signature_of(&copy), Signature::Broken(_)), "a modified installer must be reported as broken");
        let _ = std::fs::remove_file(copy);
    }
}
