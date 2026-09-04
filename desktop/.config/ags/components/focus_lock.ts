import GLib from "gi://GLib"

/*
 * Study-lockdown bridge.
 *
 * Shells out to the ~/.local/SCRIPTS/focus-lock wrapper, which sudo -n's the
 * canonical /usr/local/bin/focus-lock (firewalls to YouTube/Google + Claude,
 * kills distracting apps, auto-unlocks after <seconds> as a backstop). The
 * firewall/app-killing lives entirely in that tool - this only invokes it.
 *
 * Fire-and-forget and fully guarded: a spawn failure (missing wrapper, sudo
 * denied, whatever) is swallowed so it can never crash or block the widget.
 */
const CMD = `${GLib.get_home_dir()}/.local/SCRIPTS/focus-lock`

export function lockFor(seconds: number): void {
    const s = Math.max(1, Math.round(seconds))
    try {
        GLib.spawn_command_line_async(`${CMD} on ${s}`)
    } catch (error) {
        console.error("focus-lock: lock failed:", error)
    }
}

export function unlock(): void {
    try {
        GLib.spawn_command_line_async(`${CMD} off`)
    } catch (error) {
        console.error("focus-lock: unlock failed:", error)
    }
}
