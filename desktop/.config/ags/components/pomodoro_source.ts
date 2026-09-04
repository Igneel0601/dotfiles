import Gio from "gi://Gio"
import GLib from "gi://GLib"
import { readFile, writeFile } from "ags/file"
import {
    clampDuration,
    CYCLE_LENGTH,
    DEFAULT_SETTINGS,
    Durations,
    FLOW_BREAK_DIVISOR,
    FLOW_BREAK_MAX_MINUTES,
    FLOW_BREAK_MIN_MINUTES,
    nowSeconds,
    Phase,
    PomodoroSettings,
    PomodoroState,
    SESSION_LOG_PATH,
    SETTINGS_PATH,
    STATE_PATH,
} from "../types/pomodoro_types"

/* --- persistence ------------------------------------------------------- */

function readJson<T>(path: string, fallback: T): T {
    try {
        const parsed = JSON.parse(readFile(path))
        /* Merge over the fallback so a file written by an older version, or a
         * hand-edited one missing a key, cannot produce undefined fields. */
        return { ...fallback, ...parsed }
    } catch {
        return fallback
    }
}

function writeJson(path: string, value: unknown): void {
    try {
        writeFile(path, JSON.stringify(value, null, 2))
    } catch (error) {
        console.error(`pomodoro: could not write ${path}:`, error)
    }
}

export function loadSettings(): PomodoroSettings {
    const s = readJson<PomodoroSettings>(SETTINGS_PATH, DEFAULT_SETTINGS)
    return {
        ...s,
        lockDuringFocus: s.lockDuringFocus ?? DEFAULT_SETTINGS.lockDuringFocus,
        studyPlaylist: s.studyPlaylist ?? DEFAULT_SETTINGS.studyPlaylist,
        durations: {
            focus: clampDuration(s.durations?.focus ?? DEFAULT_SETTINGS.durations.focus),
            short: clampDuration(s.durations?.short ?? DEFAULT_SETTINGS.durations.short),
            long: clampDuration(s.durations?.long ?? DEFAULT_SETTINGS.durations.long),
        },
    }
}

export function saveSettings(settings: PomodoroSettings): void {
    writeJson(SETTINGS_PATH, settings)
}

export function defaultState(durations: Durations): PomodoroState {
    return {
        phase: "focus",
        startedAt: null,
        pausedRemaining: durations.focus * 60,
        completed: 0,
        task: "",
    }
}

export function loadState(durations: Durations): PomodoroState {
    return readJson<PomodoroState>(STATE_PATH, defaultState(durations))
}

export function saveState(state: PomodoroState): void {
    writeJson(STATE_PATH, state)
}

/* --- the engine -------------------------------------------------------- */

export function durationSeconds(phase: Phase, durations: Durations): number {
    return durations[phase] * 60
}

export function isRunning(state: PomodoroState): boolean {
    return state.startedAt !== null
}

export function isFlow(settings: PomodoroSettings): boolean {
    return settings.mode === "flow"
}

/*
 * Seconds counted up in the current flow-focus run.
 *
 * The mirror image of remainingSeconds(): the same wall-clock read, the other
 * direction. Idle (not yet started) is 0. Restart-safe for the same reason -
 * elapsed is a fact about the clock, not a counter we have to keep alive.
 */
export function flowElapsedSeconds(state: PomodoroState): number {
    return state.startedAt === null ? 0 : Math.max(0, nowSeconds() - state.startedAt)
}

/* The break a flow session earns: focus time over the divisor, then clamped. */
export function computeBreakSeconds(focusSeconds: number): number {
    const raw = Math.round(focusSeconds / FLOW_BREAK_DIVISOR)
    return Math.max(FLOW_BREAK_MIN_MINUTES * 60, Math.min(FLOW_BREAK_MAX_MINUTES * 60, raw))
}

/*
 * End a flow-focus run. Banks the elapsed and hands back a break countdown on
 * the "short" phase (which carries the break accent and styling). autoStart
 * decides whether the break begins counting or waits for a tap.
 */
export function stopFlow(
    state: PomodoroState,
    settings: PomodoroSettings,
): { next: PomodoroState; focusSeconds: number } {
    const focusSeconds = flowElapsedSeconds(state)
    return {
        focusSeconds,
        next: {
            ...state,
            phase: "short",
            startedAt: settings.autoStart ? nowSeconds() : null,
            pausedRemaining: computeBreakSeconds(focusSeconds),
        },
    }
}

/*
 * Seconds left, derived from the wall clock rather than counted down.
 *
 * This is why a missed or late tick costs nothing and why an AGS restart
 * mid-session resumes exactly where it left off: the elapsed time is a fact
 * about the clock, not about how often we remembered to subtract one.
 */
export function remainingSeconds(state: PomodoroState): number {
    if (state.startedAt === null) return Math.max(0, state.pausedRemaining)
    return Math.max(0, state.pausedRemaining - (nowSeconds() - state.startedAt))
}

export function start(state: PomodoroState): PomodoroState {
    if (isRunning(state)) return state
    return { ...state, startedAt: nowSeconds() }
}

export function pause(state: PomodoroState): PomodoroState {
    if (!isRunning(state)) return state
    return { ...state, startedAt: null, pausedRemaining: remainingSeconds(state) }
}

/*
 * Seconds actually consumed in the CURRENT running focus stretch: now minus the
 * stretch's start, capped at what was left to count down (so a completed block
 * credits its remaining, not any overshoot). Zero unless a focus is running.
 *
 * This is how partial (interrupted) study is credited: each running stretch is
 * logged once when it ends, so a block that is paused then resumed logs the two
 * stretches separately and never double-counts.
 */
export function focusSegmentSeconds(state: PomodoroState): number {
    if (state.startedAt === null || state.phase !== "focus") return 0
    const elapsed = nowSeconds() - state.startedAt
    return Math.max(0, Math.min(elapsed, state.pausedRemaining))
}

export function reset(state: PomodoroState, durations: Durations): PomodoroState {
    return {
        ...state,
        startedAt: null,
        pausedRemaining: durationSeconds(state.phase, durations),
    }
}

export function setPhase(
    state: PomodoroState,
    phase: Phase,
    durations: Durations,
): PomodoroState {
    return {
        ...state,
        phase,
        startedAt: null,
        pausedRemaining: durationSeconds(phase, durations),
    }
}

/* The task owns the session: clearing it stops and resets, because the session
 * was that task's. */
export function setTask(
    state: PomodoroState,
    task: string,
    durations: Durations,
): PomodoroState {
    if (task.trim().length === 0) {
        return reset({ ...state, task: "" }, durations)
    }
    return { ...state, task }
}

/*
 * What happens when the clock hits zero.
 *
 * Focus rolls to a break (long every CYCLE_LENGTH), a break rolls back to
 * focus. `autoStart` decides whether the next phase begins counting or waits.
 */
export function advance(
    state: PomodoroState,
    settings: PomodoroSettings,
): { next: PomodoroState; finishedPhase: Phase } {
    /*
     * Flow: the only thing that counts down is a break, and a finished break
     * returns to a fresh count-up focus that waits for the user. There is no
     * short/long cycle here - that is a countdown idea.
     */
    if (settings.mode === "flow") {
        return {
            finishedPhase: state.phase,
            next: { ...state, phase: "focus", startedAt: null, pausedRemaining: 0 },
        }
    }

    const wasFocus = state.phase === "focus"
    const reached = state.completed + (wasFocus ? 1 : 0)
    const nextPhase: Phase = wasFocus
        ? reached % CYCLE_LENGTH === 0
            ? "long"
            : "short"
        : "focus"

    /* The long break closes the sitting, so the cycle counter resets the moment
     * it is reached - the next focus starts a fresh set of CYCLE_LENGTH, not a
     * running total that drifts across sittings. */
    const completed = nextPhase === "long" ? 0 : reached

    return {
        finishedPhase: state.phase,
        next: {
            ...state,
            phase: nextPhase,
            completed,
            pausedRemaining: durationSeconds(nextPhase, settings.durations),
            startedAt: settings.autoStart ? nowSeconds() : null,
        },
    }
}

/* --- session log ------------------------------------------------------- */

/* Local wall-clock as HH:MM, for the flow-break prompt's time-of-day signal. */
export function localClockLabel(): string {
    return GLib.DateTime.new_now_local().format("%H:%M") ?? ""
}

/*
 * Focus sessions already logged today - the fatigue signal that lets the AI
 * break tell your 6th block from your 1st. Reads the same JSONL logSession
 * writes; a missing or unreadable log is simply zero.
 */
export function focusSessionsToday(): number {
    let raw: string
    try {
        raw = readFile(SESSION_LOG_PATH)
    } catch {
        return 0
    }

    const today = new Date(nowSeconds() * 1000).toISOString().slice(0, 10)
    let count = 0
    for (const line of raw.split("\n")) {
        if (line.trim().length === 0) continue
        try {
            const entry = JSON.parse(line)
            if (entry?.phase === "focus" && String(entry?.finishedAt).slice(0, 10) === today) {
                count++
            }
        } catch {
            /* Skip a corrupt line rather than losing the count. */
        }
    }
    return count
}

/* Total focus minutes logged today - the fatigue signal for the AI planner. */
export function focusMinutesToday(): number {
    let raw: string
    try {
        raw = readFile(SESSION_LOG_PATH)
    } catch {
        return 0
    }

    const today = new Date(nowSeconds() * 1000).toISOString().slice(0, 10)
    let minutes = 0
    for (const line of raw.split("\n")) {
        if (line.trim().length === 0) continue
        try {
            const entry = JSON.parse(line)
            if (entry?.phase === "focus" && String(entry?.finishedAt).slice(0, 10) === today) {
                minutes += Number(entry?.minutes) || 0
            }
        } catch {
            /* Skip a corrupt line. */
        }
    }
    return minutes
}

/* One line per completed session. Cheap, and the only way stats are possible
 * later without having thrown the history away. */
export function logSession(phase: Phase, task: string, minutes: number): void {
    const line = JSON.stringify({
        finishedAt: new Date(nowSeconds() * 1000).toISOString(),
        phase,
        task,
        minutes,
    })

    try {
        const file = Gio.File.new_for_path(SESSION_LOG_PATH)
        const dir = GLib.path_get_dirname(SESSION_LOG_PATH)
        if (!GLib.file_test(dir, GLib.FileTest.IS_DIR)) {
            Gio.File.new_for_path(dir).make_directory_with_parents(null)
        }
        const stream = file.append_to(Gio.FileCreateFlags.NONE, null)
        stream.write_all(new TextEncoder().encode(`${line}\n`), null)
        stream.close(null)
    } catch (error) {
        console.error("pomodoro: could not append session log:", error)
    }
}
