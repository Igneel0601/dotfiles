import GLib from "gi://GLib"

/*
 * Pomodoro widget: tokens and state shape.
 * Design: "Pomodoro Widget.dc.html" in the Claude Design project.
 */

export type Phase = "focus" | "short" | "long"

export const PHASE_LABEL: Record<Phase, string> = {
    focus: "FOCUS",
    short: "SHORT BREAK",
    long: "LONG BREAK",
}

/* The design's per-phase accents. Mirrored in style.scss as .mode-* classes,
 * since GTK CSS has no variables we can set from TS. */
export const PHASE_ACCENT: Record<Phase, string> = {
    focus: "#e78ba0",
    short: "#74c7d6",
    long: "#c3a8e0",
}

export type Durations = { focus: number; short: number; long: number }

export const DEFAULT_DURATIONS: Durations = { focus: 25, short: 5, long: 15 }

export const PRESETS: Array<{ label: string; durations: Durations }> = [
    { label: "Pomodoro 25·5·15", durations: { focus: 25, short: 5, long: 15 } },
    { label: "52·17", durations: { focus: 52, short: 17, long: 17 } },
    { label: "Animedoro", durations: { focus: 40, short: 20, long: 20 } },
]

export const DURATION_MIN = 1
/* Up to 4 hours: long single-sitting countdowns are a real use here, and the
 * clock already rolls to H:MM:SS past an hour. */
export const DURATION_MAX = 240

/* Mood chips (single-select). Each maps to a preset: tap how you feel and the
 * focus/break lengths are set to match your energy. No AI - it is a lookup, so
 * it is instant and works offline. */
export const MOODS = ["tired", "fresh", "anxious", "wired"] as const
export type Mood = (typeof MOODS)[number]

/*
 * Mood -> durations. The shape flexes with energy, which is the whole point:
 * - tired   short pulls, a real long rest             (depleted, ease in)
 * - fresh   long deep blocks, few breaks              (ride the capacity)
 * - anxious very short blocks for quick wins          (shrink the mountain)
 * - wired   medium blocks, tight breaks for momentum  (channel the buzz)
 * long == short means "no distinct long break" (as 52.17 does); a longer long
 * is a bigger periodic rest.
 */
export const MOOD_PRESETS: Record<Mood, Durations> = {
    tired: { focus: 20, short: 8, long: 15 },
    fresh: { focus: 50, short: 10, long: 20 },
    anxious: { focus: 15, short: 5, long: 15 },
    wired: { focus: 30, short: 5, long: 15 },
}

/* Long break after this many focus sessions; also the number of tally dots. */
export const CYCLE_LENGTH = 4

/*
 * Persisted state.
 *
 * `startedAt` is a wall-clock epoch, not a countdown. Remaining time is derived
 * from it on every tick, which is what makes the timer immune to both GJS timer
 * drift (a missed tick is never "lost", the clock is the truth) and to AGS
 * restarts, which happen constantly and would otherwise reset a live session.
 * `pausedRemaining` holds the frozen value while paused.
 */
export type PomodoroState = {
    phase: Phase
    /* Epoch seconds when the current run began; null when paused or idle. */
    startedAt: number | null
    /* Seconds left, frozen. Used when startedAt is null. */
    pausedRemaining: number
    completed: number
    task: string
}

/*
 * Timer mode.
 * - "pomodoro": fixed countdown phases (focus/short/long), the classic tomato.
 * - "flow": the focus phase counts UP with no target; you stop when you are
 *   done, and the break is derived from how long you actually focused. This is
 *   the Flowtime technique - the length is personal and the tool follows you
 *   rather than a bell cutting you off. See components/pomodoro_source.ts.
 */
export type TimerMode = "pomodoro" | "flow"

export type PomodoroSettings = {
    durations: Durations
    voice: boolean
    autoStart: boolean
    mode: TimerMode
    /* Fire the study-lockdown (focus-lock) while a focus session runs. */
    lockDuringFocus: boolean
    /* Last study playlist (YouTube URL or path) opened in mpv, remembered. */
    studyPlaylist: string
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
    durations: DEFAULT_DURATIONS,
    voice: false,
    autoStart: false,
    mode: "pomodoro",
    /* Default off - opt in from Settings so a fresh run never surprise-firewalls
     * the machine. */
    lockDuringFocus: false,
    studyPlaylist: "",
}

/*
 * Study-lockdown timing.
 *
 * A pomodoro focus locks for its exact remaining seconds, so if AGS dies the
 * tool's own backstop unlocks cleanly at the phase end. Flow focus has no fixed
 * end, so it locks for a SHORT backstop and re-arms on an interval - a crash
 * then auto-unlocks within one re-arm window rather than stranding the lock.
 */
export const FOCUS_LOCK_FLOW_BACKSTOP_SECONDS = 120
export const FOCUS_LOCK_REARM_MS = 60_000

/*
 * Flow-mode break: the focus time scaled down, then clamped.
 *
 * A break has diminishing returns - a 20-minute walk resets you about as well
 * as an hour does - so the length climbs with the session but tops out. The
 * clamp is the honest part: past a couple of hours a longer "break" is just
 * delay, and a 40-second one is not a break, so both ends are bounded. The
 * divisor of 5 matches the classic 25->5 pomodoro ratio.
 */
export const FLOW_BREAK_DIVISOR = 5
export const FLOW_BREAK_MIN_MINUTES = 3
export const FLOW_BREAK_MAX_MINUTES = 30

/* A flow run shorter than this is treated as a misfire - no break earned. */
export const FLOW_MIN_SESSION_SECONDS = 60

export const STATE_PATH = `${GLib.get_user_data_dir()}/ags/pomodoro-state.json`
export const SETTINGS_PATH = `${GLib.get_user_data_dir()}/ags/pomodoro-settings.json`
export const SESSION_LOG_PATH = `${GLib.get_user_data_dir()}/ags/pomodoro-log.jsonl`

/* Repaint rate. The clock is derived from wall time, so this only controls how
 * promptly the digits update - it is not the timekeeper. */
export const TICK_MS = 250

/*
 * Geometry.
 *
 * The design puts the panel at top:48 left:18 with width 966 on a 1440x900
 * frame. Those are the frame's numbers, not this desktop's: the info, battery
 * and sticky cards all sit 8px off their edges with a 12px gap between them, so
 * the design's values would leave the panel 3px low, 10px in, and out of step
 * with everything beside it. These rebuild the design's intent from the
 * siblings, exactly as types/sticky_types.ts does.
 *
 * A layer-shell window anchored TOP measures its margin from below the bar's
 * exclusive zone, so these are relative to the bar, not the screen.
 */

/* The 0.5rem margin that info and battery put on box.card. */
const CARD_MARGIN_PX = 8

/* The gap the eye reads between the info and battery cards. */
const WIDGET_GAP_PX = 12

/* The monitor these measurements were taken on: eDP-1, 2880x1800 @ 2.0 => 1440
 * logical wide. Everything below is rebuilt from the RIGHT edge so it holds on a
 * wider (or narrower) monitor too, instead of freezing at this one's numbers. */
const REFERENCE_MONITOR_WIDTH_PX = 1440

/* Left edge of the info card was measured at 996 on the reference monitor via
 * `hyprctl layers`. But the info/battery/sticky column is anchored to the RIGHT
 * edge, so its absolute x is NOT portable - the stable quantity is its inset
 * from that edge, which holds on any monitor width. Revisit if gauges resize. */
const INFO_CARD_LEFT_PX = 996
const RIGHT_COLUMN_INSET_PX = REFERENCE_MONITOR_WIDTH_PX - INFO_CARD_LEFT_PX

export const PANEL_TOP_PX = CARD_MARGIN_PX
export const PANEL_LEFT_PX = CARD_MARGIN_PX

/* Panel runs from the left margin to one gap short of the info card. Derived
 * from the LIVE monitor width so it stretches to meet the right column on any
 * screen - a hardcoded width froze at 976 and left a dead gap on wider monitors.
 * Clamped so a very narrow monitor still gets a usable panel. */
export function panelWidth(monitorWidthPx: number): number {
    return Math.max(320, monitorWidthPx - RIGHT_COLUMN_INSET_PX - WIDGET_GAP_PX - PANEL_LEFT_PX)
}

/* Reference-monitor width, for the fullscreen fallback and static defaults. */
export const PANEL_WIDTH_PX = panelWidth(REFERENCE_MONITOR_WIDTH_PX)
export const PANEL_HEIGHT_PX = 566

/* Shadow room is asymmetric on purpose: the shadow falls down and right
 * (0 20px 60px), and there is little room above the panel anyway. */
export const PANEL_SHADOW_ROOM_PX = 50

/* Flip clock, from the design. */
export const DIGIT_W_PX = 150
export const DIGIT_H_PX = 214
export const DIGIT_HALF_PX = 107

/* Flip duration. Must match the keyframes in style.scss - the code hides the
 * leaves when it believes the animation has landed. */
export const FLIP_MS = 420

export function clampDuration(minutes: number): number {
    return Math.max(DURATION_MIN, Math.min(DURATION_MAX, Math.round(minutes)))
}

export function nowSeconds(): number {
    return Math.floor(GLib.get_real_time() / 1_000_000)
}
