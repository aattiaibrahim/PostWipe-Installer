use super::ResolveError;
use crate::catalog::model::ResolverSpec;
use serde::Deserialize;

#[derive(Deserialize)]
struct Release {
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    browser_download_url: String,
}

/// Matches a filename against a simple `*`-wildcard pattern (no full glob/regex needed
/// for the asset-name patterns these catalog entries use).
fn glob_match(pattern: &str, text: &str) -> bool {
    let parts: Vec<&str> = pattern.split('*').collect();
    if parts.len() == 1 {
        return pattern == text;
    }

    let mut pos = 0;
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        if i == 0 {
            if !text[pos..].starts_with(part) {
                return false;
            }
            pos += part.len();
        } else if i == parts.len() - 1 {
            return text[pos..].ends_with(part);
        } else {
            match text[pos..].find(part) {
                Some(idx) => pos += idx + part.len(),
                None => return false,
            }
        }
    }
    true
}

pub async fn resolve(spec: &ResolverSpec) -> Result<String, ResolveError> {
    let (repo, asset_pattern) = match spec {
        ResolverSpec::GithubRelease { repo, asset_pattern } => (repo, asset_pattern),
        _ => return Err(ResolveError::Unsupported("github_release")),
    };

    let api_url = format!("https://api.github.com/repos/{repo}/releases/latest");
    let response = reqwest::Client::new()
        .get(&api_url)
        .header("User-Agent", "postwipe-installer")
        .send()
        .await
        .map_err(|e| ResolveError::Network(e.to_string()))?
        .error_for_status()
        .map_err(|e| ResolveError::Network(e.to_string()))?;

    let release: Release = response.json().await.map_err(|e| ResolveError::Network(e.to_string()))?;

    release
        .assets
        .into_iter()
        .find(|asset| glob_match(asset_pattern, &asset.name))
        .map(|asset| asset.browser_download_url)
        .ok_or_else(|| ResolveError::NotFound(format!("no release asset matching '{asset_pattern}' in {repo}")))
}

#[cfg(test)]
mod tests {
    use super::glob_match;

    #[test]
    fn matches_wildcard_patterns() {
        assert!(glob_match("ZenTimings*.zip", "ZenTimings-1.2.3.zip"));
        assert!(glob_match("npp.*.Installer.x64.exe", "npp.8.5.4.Installer.x64.exe"));
        assert!(glob_match("PowerToysUserSetup-*-x64.exe", "PowerToysUserSetup-0.87.0-x64.exe"));
        assert!(glob_match("nvidiaProfileInspector.zip", "nvidiaProfileInspector.zip"));
        assert!(!glob_match("nvidiaProfileInspector.zip", "other.zip"));
        assert!(!glob_match("ZenTimings*.zip", "ZenTimings-1.2.3.exe"));
    }
}
