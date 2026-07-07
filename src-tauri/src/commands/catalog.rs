use crate::catalog::{loader, model::Catalog};

#[tauri::command]
pub fn list_categories() -> Catalog {
    loader::load_catalog().clone()
}
