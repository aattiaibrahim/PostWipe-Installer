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
    /// Longer user-facing copy for the expanded details panel. `notes` (below) is
    /// internal maintenance info and must never be rendered in the UI.
    #[serde(default)]
    pub description: Option<String>,
    pub icon: String,
    #[serde(default)]
    pub domain: Option<String>,
    /// Full URL for the "Visit" link when the bare `domain` isn't specific enough
    /// (e.g. GitHub-hosted apps should link to their repo, not github.com).
    #[serde(default)]
    pub website: Option<String>,
    /// CPU-vendor compatibility for the Overclocking filter; absent = works everywhere.
    #[serde(default)]
    pub vendor: Option<Vendor>,
    /// Optional sub-heading inside a category (used by Essential Bookmarks to group links
    /// under "OSINT", "AI", … without adding real sub-categories).
    #[serde(default)]
    pub group: Option<String>,
    pub kind: AppKind,
    #[serde(default)]
    pub notes: Option<String>,
    /// Optional how-to shown in the expanded row (e.g. OBS replay-buffer setup).
    #[serde(default)]
    pub guide: Option<Guide>,
    pub platforms: HashMap<Os, PlatformEntry>,
}

/// A short walkthrough rendered under an app's description, with an optional copyable
/// snippet (PowerShell/batch) the user can paste into a terminal.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Guide {
    pub title: String,
    pub steps: Vec<String>,
    #[serde(default)]
    pub snippet: Option<GuideSnippet>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuideSnippet {
    pub label: String,
    pub code: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Windows,
    Macos,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Vendor {
    Intel,
    Amd,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AppKind {
    Download,
    Script,
    /// A bookmark — opens in the user's default browser instead of downloading. Carries no
    /// platforms (shown on every OS); the URL lives in `website`.
    Link,
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
