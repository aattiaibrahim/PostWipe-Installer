use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Catalog {
    pub version: u32,
    pub categories: Vec<Category>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub apps: Vec<AppEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub bio: Option<String>,
    pub icon: String,
    #[serde(default)]
    pub domain: Option<String>,
    pub kind: AppKind,
    #[serde(default)]
    pub notes: Option<String>,
    pub platforms: HashMap<Os, PlatformEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Windows,
    Macos,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppKind {
    Download,
    Script,
    /// Catalog entry with no working resolver yet — a category preview shown before its
    /// real content (files provided by the user, plus hosting) is in place.
    Placeholder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformEntry {
    #[serde(default)]
    pub resolver: Option<ResolverSpec>,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub script_id: Option<String>,
    #[serde(default)]
    pub stale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ResolverSpec {
    Static {
        url: String,
    },
    GithubRelease {
        repo: String,
        asset_pattern: String,
    },
    Html {
        page_url: String,
        selector: String,
        attr: String,
        #[serde(default)]
        base_url: Option<String>,
        #[serde(default)]
        url_regex: Option<String>,
    },
    /// Like `Html`, but regexes the raw page body instead of matching a CSS selector —
    /// for URLs that live outside element attributes (e.g. inside an HTML comment).
    HtmlRegex {
        page_url: String,
        url_regex: String,
    },
    /// Like `Html`, but for pages whose download link only exists after client-side JS
    /// runs (e.g. Windscribe, TeamSpeak, PyCharm). Resolved via a hidden Tauri webview
    /// instead of a plain HTTP fetch — see `resolver::webview_resolver`.
    Webview {
        page_url: String,
        selector: String,
        attr: String,
        #[serde(default)]
        base_url: Option<String>,
        #[serde(default)]
        url_regex: Option<String>,
        #[serde(default = "default_wait_ms")]
        wait_ms: u64,
    },
}

fn default_wait_ms() -> u64 {
    4000
}
