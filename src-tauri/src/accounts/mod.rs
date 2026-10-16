//! Client for the PostWipe accounts Worker (`accounts-api/`: Better Auth on Cloudflare D1).
//!
//! Why the app talks to it from RUST instead of from the webview:
//!   * Better Auth keeps one step in a cookie — the "password accepted, now enter your 2FA
//!     code" challenge. A webview won't hold a cookie for a cross-origin API (the same wall
//!     Clerk hits in Tauri). reqwest's cookie jar holds it for the few seconds it's needed.
//!   * The session token never touches the page's JavaScript or its localStorage (which the
//!     packaged WebView doesn't reliably keep anyway — see the theme bug).
//!
//! This module has no Tauri dependency so it can be exercised directly against
//! `wrangler dev`; `commands::account` adds token persistence and exposes it to the UI.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::Duration;

pub const DEFAULT_BASE_URL: &str = "https://postwipe-accounts.andrewattiaibrahim.workers.dev";

const TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AccountUser {
    pub id: String,
    pub email: String,
    pub name: String,
    #[serde(default)]
    pub two_factor_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TwoFactorSetup {
    /// `otpauth://` URI — rendered as a QR code for the authenticator app.
    #[serde(rename = "totpURI")]
    pub totp_uri: String,
    pub backup_codes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub favorites: Vec<String>,
    pub sets: Value,
    pub settings: Value,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum SaveOutcome {
    Saved { profile: Profile },
    /// Another device saved first. Carries the newer copy so the UI can merge and retry.
    Conflict { profile: Profile },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInOutcome {
    /// True when the password was right but the account has 2FA: the UI must now ask for an
    /// authenticator (or backup) code before a session exists.
    pub needs_two_factor: bool,
    pub user: Option<AccountUser>,
}

pub struct AccountApi {
    base: String,
    http: reqwest::Client,
    token: Mutex<Option<String>>,
}

impl AccountApi {
    pub fn new(base: impl Into<String>, token: Option<String>) -> Self {
        let http = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .cookie_store(true)
            .user_agent(concat!("PostWipe-Installer/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("reqwest client with static config should always build");
        Self { base: base.into().trim_end_matches('/').to_string(), http, token: Mutex::new(token) }
    }

    /// The Worker's URL. Community stats live on the same Worker, so they share it.
    pub fn base(&self) -> &str {
        &self.base
    }

    pub fn token(&self) -> Option<String> {
        self.token.lock().unwrap().clone()
    }

    fn set_token(&self, token: Option<String>) {
        *self.token.lock().unwrap() = token;
    }

    async fn call(&self, method: reqwest::Method, path: &str, body: Option<Value>) -> Result<(u16, Value), String> {
        let mut req = self
            .http
            .request(method, format!("{}{}", self.base, path))
            // Better Auth rejects cookie-bearing requests from untrusted origins. The Worker's
            // own URL is always trusted, and it's the honest answer: there's no browser page.
            .header("Origin", &self.base);
        if let Some(token) = self.token() {
            req = req.bearer_auth(token);
        }
        if let Some(body) = body {
            req = req.json(&body);
        }
        let res = req.send().await.map_err(|e| {
            if e.is_timeout() || e.is_connect() {
                "Couldn't reach the account server. Check your connection and try again.".to_string()
            } else {
                format!("Account request failed: {e}")
            }
        })?;
        if let Some(issued) = res.headers().get("set-auth-token").and_then(|v| v.to_str().ok()) {
            self.set_token(Some(issued.to_string()));
        }
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        let value = serde_json::from_str(&text).unwrap_or(Value::Null);
        Ok((status, value))
    }

    /// Turns a Better Auth / Worker error body into a sentence for the user.
    fn error(status: u16, body: &Value) -> String {
        let message = body
            .get("message")
            .or_else(|| body.get("error"))
            .and_then(Value::as_str)
            .map(str::to_string);
        match (status, message) {
            (429, _) => "Too many attempts. Wait a minute and try again.".to_string(),
            // A 404 on a fixed API path means the service itself isn't there (not deployed,
            // or the Worker URL changed) — "error (404)" told the user nothing useful.
            (404, _) | (500..=599, None) => {
                "The account service isn't available right now. Try again later.".to_string()
            }
            (_, Some(m)) if !m.is_empty() => m,
            (401, None) => "Your session has ended. Sign in again.".to_string(),
            (s, None) => format!("The account server returned an error ({s})."),
            (s, Some(_)) => format!("The account server returned an error ({s})."),
        }
    }

    async fn post(&self, path: &str, body: Value) -> Result<Value, String> {
        let (status, value) = self.call(reqwest::Method::POST, path, Some(body)).await?;
        if (200..300).contains(&status) {
            Ok(value)
        } else {
            Err(Self::error(status, &value))
        }
    }

    /// No name is collected (privacy: an account is just an email and a password). Better
    /// Auth's user table requires the column, so it's always sent empty.
    pub async fn sign_up(&self, email: &str, password: &str) -> Result<AccountUser, String> {
        let value = self.post("/api/auth/sign-up/email", json!({ "email": email, "password": password, "name": "" })).await?;
        serde_json::from_value(value["user"].clone()).map_err(|e| format!("Unexpected sign-up response: {e}"))
    }

    pub async fn sign_in(&self, email: &str, password: &str) -> Result<SignInOutcome, String> {
        self.set_token(None);
        let value = self.post("/api/auth/sign-in/email", json!({ "email": email, "password": password })).await?;
        if value.get("twoFactorRedirect").and_then(Value::as_bool) == Some(true) {
            return Ok(SignInOutcome { needs_two_factor: true, user: None });
        }
        let user = serde_json::from_value(value["user"].clone()).ok();
        Ok(SignInOutcome { needs_two_factor: false, user })
    }

    /// Completes a 2FA sign-in, OR confirms 2FA setup when already signed in — Better Auth
    /// uses the same endpoint for both.
    pub async fn verify_totp(&self, code: &str) -> Result<(), String> {
        self.post("/api/auth/two-factor/verify-totp", json!({ "code": code.trim() })).await.map(|_| ())
    }

    pub async fn verify_backup_code(&self, code: &str) -> Result<(), String> {
        self.post("/api/auth/two-factor/verify-backup-code", json!({ "code": code.trim() })).await.map(|_| ())
    }

    pub async fn enable_two_factor(&self, password: &str) -> Result<TwoFactorSetup, String> {
        let value = self.post("/api/auth/two-factor/enable", json!({ "password": password })).await?;
        serde_json::from_value(value).map_err(|e| format!("Unexpected 2FA setup response: {e}"))
    }

    pub async fn disable_two_factor(&self, password: &str) -> Result<(), String> {
        self.post("/api/auth/two-factor/disable", json!({ "password": password })).await.map(|_| ())
    }

    /// A fresh set of backup codes; the old ones stop working. Better Auth keeps codes
    /// encrypted and deliberately has no client endpoint to read them back, so "get my codes
    /// again" means replacing them — behind the password, like enabling 2FA.
    pub async fn generate_backup_codes(&self, password: &str) -> Result<Vec<String>, String> {
        let value = self.post("/api/auth/two-factor/generate-backup-codes", json!({ "password": password })).await?;
        serde_json::from_value(value["backupCodes"].clone()).map_err(|e| format!("Unexpected backup code response: {e}"))
    }

    /// The signed-in user, or `None` when there's no valid session (never signed in, signed
    /// out, or the session expired server-side).
    pub async fn current_user(&self) -> Result<Option<AccountUser>, String> {
        if self.token().is_none() {
            return Ok(None);
        }
        let (status, value) = self.call(reqwest::Method::GET, "/api/auth/get-session", None).await?;
        if status == 401 || value.is_null() {
            self.set_token(None);
            return Ok(None);
        }
        if !(200..300).contains(&status) {
            return Err(Self::error(status, &value));
        }
        Ok(serde_json::from_value(value["user"].clone()).ok())
    }

    pub async fn sign_out(&self) -> Result<(), String> {
        // Best-effort on the server; locally the session is gone either way.
        let _ = self.call(reqwest::Method::POST, "/api/auth/sign-out", Some(json!({}))).await;
        self.set_token(None);
        Ok(())
    }

    pub async fn delete_account(&self, password: &str) -> Result<(), String> {
        self.post("/api/auth/delete-user", json!({ "password": password })).await?;
        self.set_token(None);
        Ok(())
    }

    pub async fn get_profile(&self) -> Result<Profile, String> {
        let (status, value) = self.call(reqwest::Method::GET, "/api/profile", None).await?;
        if !(200..300).contains(&status) {
            return Err(Self::error(status, &value));
        }
        serde_json::from_value(value).map_err(|e| format!("Unexpected profile response: {e}"))
    }

    pub async fn save_profile(&self, profile: &Profile) -> Result<SaveOutcome, String> {
        let body = json!({
            "favorites": profile.favorites,
            "sets": profile.sets,
            "settings": profile.settings,
            "baseUpdatedAt": profile.updated_at,
        });
        let (status, value) = self.call(reqwest::Method::PUT, "/api/profile", Some(body)).await?;
        match status {
            200..=299 => Ok(SaveOutcome::Saved {
                profile: serde_json::from_value(value).map_err(|e| format!("Unexpected profile response: {e}"))?,
            }),
            409 => Ok(SaveOutcome::Conflict {
                profile: serde_json::from_value(value["profile"].clone())
                    .map_err(|e| format!("Unexpected conflict response: {e}"))?,
            }),
            _ => Err(Self::error(status, &value)),
        }
    }
}

/// Run against a local Worker: `cd accounts-api && npx wrangler dev`, then
/// `cargo test --lib -- --ignored accounts_client`. Proves the Rust client (bearer token,
/// cookie-held 2FA challenge, conflict handling) works against the real Better Auth server,
/// not just that the JS test script does.
#[cfg(test)]
mod tests {
    use super::*;

    fn local() -> String {
        std::env::var("POSTWIPE_ACCOUNTS_URL").unwrap_or_else(|_| "http://127.0.0.1:8787".to_string())
    }

    fn totp_now(uri: &str) -> String {
        totp_rs::TOTP::from_url_unchecked(uri).expect("valid otpauth URI").generate_current().to_string()
    }

    #[tokio::test]
    #[ignore = "needs `wrangler dev` running in accounts-api/"]
    async fn accounts_client_full_flow_against_local_worker() {
        let email = format!("rust-{}@example.test", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
        let password = "correct horse battery staple";

        let api = AccountApi::new(local(), None);
        let user = api.sign_up(&email, password).await.expect("sign-up");
        assert_eq!(user.email, email);
        assert!(api.token().is_some(), "sign-up should leave a session token");

        let mut profile = api.get_profile().await.expect("empty profile");
        profile.favorites = vec!["obsidian".into()];
        profile.settings = json!({ "theme": "nord" });
        let saved = match api.save_profile(&profile).await.expect("save") {
            SaveOutcome::Saved { profile } => profile,
            SaveOutcome::Conflict { .. } => panic!("first save must not conflict"),
        };
        assert!(matches!(api.save_profile(&profile).await.expect("stale save"), SaveOutcome::Conflict { .. }));

        let setup = api.enable_two_factor(password).await.expect("enable 2FA");
        api.verify_totp(&totp_now(&setup.totp_uri)).await.expect("confirm 2FA");
        assert!(api.current_user().await.unwrap().unwrap().two_factor_enabled);

        // A fresh "install": no token, empty cookie jar.
        let device = AccountApi::new(local(), None);
        assert!(device.sign_in(&email, password).await.expect("password").needs_two_factor);
        assert!(device.token().is_none(), "no session before the second factor");
        device.verify_backup_code(&setup.backup_codes[0]).await.expect("backup code");
        assert!(device.token().is_some());
        assert_eq!(device.get_profile().await.unwrap().updated_at, saved.updated_at);

        device.delete_account(password).await.expect("delete");
        assert!(device.token().is_none());
        assert!(api.current_user().await.unwrap().is_none(), "the old session dies with the account");
    }
}
