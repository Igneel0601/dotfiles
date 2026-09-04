import { execAsync } from "ags/process"
import GLib from "gi://GLib"
import { Phase } from "../types/pomodoro_types"

/*
 * Session-end alert: a dunst notification, and optionally a spoken line.
 *
 * dunst is the running notification daemon here (swaync is not installed,
 * despite the stale layerrules in ~/.config/hypr/windowrules.conf), so this
 * goes through plain notify-send.
 */

const PIPER = `${GLib.get_home_dir()}/.local/bin/piper`
const VOICE = `${GLib.get_home_dir()}/.claude/piper/en_US-amy-medium.onnx`

function phraseFor(finished: Phase): { title: string; body: string; spoken: string } {
    if (finished === "focus") {
        return {
            title: "Focus session done",
            body: "Time for a break.",
            spoken: "Nice work. Take a break.",
        }
    }
    return {
        title: "Break over",
        body: "Back to it.",
        spoken: "Break over. Time to focus.",
    }
}

export function notifyFinished(finished: Phase, task: string): void {
    const { title, body } = phraseFor(finished)
    const detail = task.trim().length > 0 ? `${body}\n${task.trim()}` : body

    /* Fire-and-forget: a notification must never hold up the next phase. */
    execAsync([
        "notify-send",
        "--app-name=pomodoro",
        "--icon=alarm-symbolic",
        title,
        detail,
    ]).catch((error) => console.error("pomodoro: notify-send failed:", error))
}

/*
 * Speak the line, asynchronously.
 *
 * Piper takes ~1.2s to synthesise. GJS is single-threaded and AGS runs the bar,
 * gauges and note in this same process, so doing this synchronously would
 * freeze the whole shell for over a second at every session end.
 */
export function speakFinished(finished: Phase): void {
    const { spoken } = phraseFor(finished)

    if (!GLib.file_test(PIPER, GLib.FileTest.IS_EXECUTABLE)) {
        console.error(`pomodoro: no piper at ${PIPER}, skipping voice`)
        return
    }
    if (!GLib.file_test(VOICE, GLib.FileTest.EXISTS)) {
        console.error(`pomodoro: no voice model at ${VOICE}, skipping voice`)
        return
    }

    /* piper writes a wav to stdout with --output-raw; pipe it straight into the
     * player rather than through a temp file. */
    const script = `${GLib.shell_quote(PIPER)} -m ${GLib.shell_quote(VOICE)} --output-raw \
| pw-play --rate 22050 --format s16 --channels 1 --raw -`

    execAsync(["sh", "-c", `printf %s ${GLib.shell_quote(spoken)} | ${script}`])
        .catch((error) => console.error("pomodoro: voice failed:", error))
}
