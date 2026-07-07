use super::model::Catalog;
use std::sync::OnceLock;

const CATALOG_JSON: &str = include_str!("../../../catalog/catalog.json");

static CATALOG: OnceLock<Catalog> = OnceLock::new();

pub fn load_catalog() -> &'static Catalog {
    CATALOG.get_or_init(|| {
        serde_json::from_str(CATALOG_JSON)
            .expect("catalog/catalog.json failed to parse against the expected schema")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_json_parses_and_is_nonempty() {
        let catalog = load_catalog();
        assert!(!catalog.categories.is_empty());
        let total_apps: usize = catalog.categories.iter().map(|c| c.apps.len()).sum();
        assert!(total_apps > 20, "expected the migrated app list, got {total_apps}");
    }
}
