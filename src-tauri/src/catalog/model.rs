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
}
