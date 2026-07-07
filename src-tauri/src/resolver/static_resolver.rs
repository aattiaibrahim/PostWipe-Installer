use super::ResolveError;
use crate::catalog::model::ResolverSpec;

pub fn resolve(spec: &ResolverSpec) -> Result<String, ResolveError> {
    match spec {
        ResolverSpec::Static { url } => Ok(url.clone()),
        _ => Err(ResolveError::Unsupported("static")),
    }
}
