pub struct ScriptSpec {
    pub id: &'static str,
    pub filename: &'static str,
    /// Human-readable name for the Start menu entry when the script is pinned.
    pub menu_label: &'static str,
    pub content: &'static str,
}

// .bat, not .ps1: double-clicking a .ps1 opens Notepad by default on Windows instead of
// running it, which made generated scripts look broken. Batch files run on double-click
// and each template self-elevates via UAC.
const SCRIPTS: &[ScriptSpec] = &[
    ScriptSpec {
        id: "restart-audio-service",
        filename: "RestartAudioService.bat",
        menu_label: "Restart Audio Service",
        content: include_str!("templates/restart_audio.bat"),
    },
    ScriptSpec {
        id: "kill-valorant-process",
        filename: "KillValorantProcess.bat",
        menu_label: "Kill Valorant Process",
        content: include_str!("templates/kill_valorant.bat"),
    },
];

pub fn find(script_id: &str) -> Option<&'static ScriptSpec> {
    SCRIPTS.iter().find(|s| s.id == script_id)
}
