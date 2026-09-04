import GLib from "gi://GLib"

/*
 * Study-playlist launcher. Opens a playlist (a YouTube playlist URL, or a local
 * folder/file) in mpv as a normal video window - lectures you watch, not
 * background audio. `--save-position-on-quit` resumes where you left off, which
 * is what you want for a lecture series.
 *
 * Uses spawn_async with an argv array (not a command string) so a URL with
 * query params or a path with spaces is passed as ONE argument and never
 * word-split. Guarded: a spawn failure is swallowed, never crashes the widget.
 */
export function openPlaylist(target: string): void {
    const t = target.trim()
    if (t.length === 0) return
    try {
        GLib.spawn_async(
            null,
            ["mpv", "--save-position-on-quit", "--force-window=immediate", t],
            null,
            GLib.SpawnFlags.SEARCH_PATH,
            null,
        )
    } catch (error) {
        console.error("mpv: could not open playlist:", error)
    }
}

/* Stop playback. Kills mpv by exact name - fine here since the widget is the
 * only thing launching it. */
export function stopPlayback(): void {
    try {
        GLib.spawn_async(null, ["pkill", "-x", "mpv"], null, GLib.SpawnFlags.SEARCH_PATH, null)
    } catch (error) {
        console.error("mpv: could not stop playback:", error)
    }
}
