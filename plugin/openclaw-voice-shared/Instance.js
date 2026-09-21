// Shared by both QML components; functions are also exercised by Node contract tests.
function basename(name) {
    if (name === undefined) name = "default";
    if (typeof name !== "string" || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) return "";
    return name === "default" ? "openclaw-voice" : "openclaw-voice-" + name;
}

function controlPath(name, explicitPath, home) {
    if (!basename(name)) return "";
    if (name === undefined || name === "default") return home + "/.local/bin/openclaw-voice";
    return typeof explicitPath === "string" && explicitPath.startsWith("/") && !/[\x00-\x1f\x7f]/.test(explicitPath) ? explicitPath : "";
}
