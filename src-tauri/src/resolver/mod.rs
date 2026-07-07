pub mod github_release_resolver;
pub mod html_resolver;
pub mod static_resolver;

use crate::catalog::model::ResolverSpec;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ResolveError {
    #[error("resolver type '{0}' is not implemented yet")]
    Unsupported(&'static str),
    #[error("network error while resolving URL: {0}")]
    Network(String),
    #[error("could not parse resolver output: {0}")]
    Parse(String),
    #[error("{0}")]
    NotFound(String),
}

pub async fn resolve(spec: &ResolverSpec) -> Result<String, ResolveError> {
    match spec {
        ResolverSpec::Static { .. } => static_resolver::resolve(spec),
        ResolverSpec::GithubRelease { .. } => github_release_resolver::resolve(spec).await,
        ResolverSpec::Html { .. } => html_resolver::resolve(spec).await,
    }
}

#[cfg(test)]
mod live_tests {
    use super::*;

    #[tokio::test]
    async fn github_release_resolves_7zip() {
        let spec = ResolverSpec::GithubRelease {
            repo: "ip7z/7zip".to_string(),
            asset_pattern: "7z*-x64.exe".to_string(),
        };
        let url = resolve(&spec).await.expect("should resolve a real 7-Zip release asset");
        assert!(url.contains("7z"), "unexpected url: {url}");
        assert!(url.ends_with("-x64.exe"), "unexpected url: {url}");
    }

    #[tokio::test]
    async fn html_resolves_winrar() {
        let spec = ResolverSpec::Html {
            page_url: "https://www.win-rar.com/download.html".to_string(),
            selector: "a[href*='winrar-x64-'][href$='.exe']".to_string(),
            attr: "href".to_string(),
            base_url: Some("https://www.win-rar.com/".to_string()),
            url_regex: None,
        };
        let url = resolve(&spec).await.expect("should resolve a real WinRAR download link");
        assert!(url.contains("winrar-x64-"), "unexpected url: {url}");
        assert!(url.ends_with(".exe"), "unexpected url: {url}");
    }
}
