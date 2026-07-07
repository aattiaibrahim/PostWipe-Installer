use super::ResolveError;
use crate::catalog::model::ResolverSpec;
use scraper::{Html, Selector};

pub async fn resolve(spec: &ResolverSpec) -> Result<String, ResolveError> {
    let (page_url, selector, attr, base_url, url_regex) = match spec {
        ResolverSpec::Html {
            page_url,
            selector,
            attr,
            base_url,
            url_regex,
        } => (page_url, selector, attr, base_url, url_regex),
        _ => return Err(ResolveError::Unsupported("html")),
    };

    let body = reqwest::get(page_url)
        .await
        .map_err(|e| ResolveError::Network(e.to_string()))?
        .error_for_status()
        .map_err(|e| ResolveError::Network(e.to_string()))?
        .text()
        .await
        .map_err(|e| ResolveError::Network(e.to_string()))?;

    let document = Html::parse_document(&body);
    let parsed_selector =
        Selector::parse(selector).map_err(|e| ResolveError::Parse(format!("invalid selector '{selector}': {e:?}")))?;

    let element = document
        .select(&parsed_selector)
        .next()
        .ok_or_else(|| ResolveError::NotFound(format!("no element matched selector '{selector}' on {page_url}")))?;

    let mut value = element
        .value()
        .attr(attr)
        .ok_or_else(|| ResolveError::NotFound(format!("matched element has no '{attr}' attribute")))?
        .to_string();

    if let Some(pattern) = url_regex {
        let re = regex::Regex::new(pattern).map_err(|e| ResolveError::Parse(e.to_string()))?;
        value = re
            .find(&value)
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| ResolveError::NotFound(format!("url_regex '{pattern}' did not match '{value}'")))?;
    }

    match base_url {
        Some(base) => {
            let base = url::Url::parse(base).map_err(|e| ResolveError::Parse(e.to_string()))?;
            let joined = base.join(&value).map_err(|e| ResolveError::Parse(e.to_string()))?;
            Ok(joined.to_string())
        }
        None => Ok(value),
    }
}
