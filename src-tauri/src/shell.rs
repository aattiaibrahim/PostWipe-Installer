//! Safety helpers shared by every command that shells out or touches paths the webview names.
//!
//! The rule these enforce: a value that came from the webview, a downloaded archive, or the
//! Specials bucket is DATA. It must never be able to become PowerShell code, and a path it
//! names must stay inside the folder the command is meant to work in.

use std::path::{Path, PathBuf};

/// A PowerShell single-quoted string literal.
///
/// Inside single quotes PowerShell expands nothing; the only way out is a closing quote. It
/// treats the typographic quotes U+2018, U+2019, U+201A and U+201B as single quotes too, so
/// doubling only the ASCII `'` (the old helper) let a name like `x’; Remove-Item …` break out.
/// Every one of them is doubled, which PowerShell reads back as a literal quote character.
pub fn ps_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('\'');
    for ch in s.chars() {
        if matches!(ch, '\'' | '\u{2018}' | '\u{2019}' | '\u{201A}' | '\u{201B}') {
            out.push(ch);
        }
        out.push(ch);
    }
    out.push('\'');
    out
}

/// Resolves `path` and confirms it sits inside `root` (both canonicalized, so `..`, symlinks
/// and junctions can't walk out). Returns the canonical path.
pub fn contained_in(root: &Path, path: &str) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let file = PathBuf::from(path).canonicalize().map_err(|_| format!("{path} not found — download it again."))?;
    if !file.starts_with(&root) {
        return Err("That file isn't in the PostWipe downloads folder.".into());
    }
    Ok(file)
}

/// A plain file name for something written into a downloads folder: no directories, no
/// drive or UNC prefix, no `..`, and no characters Windows rejects.
pub fn safe_file_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim().trim_end_matches(['.', ' ']);
    let bad = trimmed.is_empty()
        || trimmed == "."
        || trimmed == ".."
        || trimmed.len() > 200
        || trimmed.chars().any(|c| c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'));
    if bad {
        return Err(format!("Refusing an unsafe file name: {name}"));
    }
    Ok(trimmed.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_every_single_quote_variant() {
        assert_eq!(ps_quote("plain"), "'plain'");
        assert_eq!(ps_quote("it's"), "'it''s'");
        // A scheme name crafted to close the literal with a typographic quote stays inside it.
        assert_eq!(ps_quote("x\u{2019}; calc; \u{2018}"), "'x\u{2019}\u{2019}; calc; \u{2018}\u{2018}'");
    }

    #[test]
    fn rejects_path_like_file_names() {
        for bad in ["", "..", "../evil.exe", "..\\evil.exe", "C:\\Windows\\x.dll", "a/b.zip", "\\\\server\\share", "x\u{0}.zip", "con:.zip"] {
            assert!(safe_file_name(bad).is_err(), "{bad:?} should be rejected");
        }
        assert_eq!(safe_file_name("Night Diamond v3.0.zip").unwrap(), "Night Diamond v3.0.zip");
        assert_eq!(safe_file_name("Posy's Cursor Mono Black.zip").unwrap(), "Posy's Cursor Mono Black.zip");
    }

    #[test]
    fn containment_blocks_escapes() {
        let root = std::env::temp_dir().join("postwipe-shell-test");
        std::fs::create_dir_all(root.join("inner")).unwrap();
        std::fs::write(root.join("inner").join("a.zip"), b"x").unwrap();
        assert!(contained_in(&root, &root.join("inner").join("a.zip").to_string_lossy()).is_ok());
        let outside = root.join("inner").join("..").join("..").join("postwipe-shell-outside.txt");
        std::fs::write(&outside, b"x").unwrap();
        assert!(contained_in(&root, &outside.to_string_lossy()).is_err());
        let _ = std::fs::remove_file(outside);
    }
}
