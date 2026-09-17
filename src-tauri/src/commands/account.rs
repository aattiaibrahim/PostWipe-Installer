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
