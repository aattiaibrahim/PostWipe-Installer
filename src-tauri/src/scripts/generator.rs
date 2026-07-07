pub struct ScriptSpec {
    pub id: &'static str,
    pub filename: &'static str,
    pub content: &'static str,
}

const SCRIPTS: &[ScriptSpec] = &[
    ScriptSpec {
        id: "restart-audio-service",
        filename: "RestartAudioService.ps1",
        content: include_str!("templates/restart_audio.ps1"),
    },
    ScriptSpec {
        id: "kill-valorant-process",
        filename: "KillValorantProcess.ps1",
        content: include_str!("templates/kill_valorant.ps1"),
    },
];

pub fn find(script_id: &str) -> Option<&'static ScriptSpec> {
    SCRIPTS.iter().find(|s| s.id == script_id)
}
