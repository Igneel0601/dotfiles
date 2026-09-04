import app from "ags/gtk4/app"
import { createComputed, createState } from "ags"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createPoll } from "ags/time"
import FlipDigit from "../../components/flip_digit"
import { flowBreak, readApiKey } from "../../components/ai_source"
import { lockFor, unlock } from "../../components/focus_lock"
import { openPlaylist, stopPlayback } from "../../components/mpv"
import { notifyFinished, speakFinished } from "../../components/pomodoro_alert"
import {
    advance,
    flowElapsedSeconds,
    focusSegmentSeconds,
    focusSessionsToday,
    isFlow,
    isRunning,
    loadSettings,
    loadState,
    localClockLabel,
    logSession,
    pause,
    remainingSeconds,
    reset,
    saveSettings,
    saveState,
    setTask,
    start,
    stopFlow,
} from "../../components/pomodoro_source"
import { ACTIVE_PROVIDER, PROVIDERS } from "../../types/ai_types"
import {
    clampDuration,
    CYCLE_LENGTH,
    Durations,
    FLOW_BREAK_MAX_MINUTES,
    FLOW_BREAK_MIN_MINUTES,
    FLOW_MIN_SESSION_SECONDS,
    FOCUS_LOCK_FLOW_BACKSTOP_SECONDS,
    FOCUS_LOCK_REARM_MS,
    Mood,
    MOOD_PRESETS,
    MOODS,
    nowSeconds,
    PANEL_HEIGHT_PX,
    PANEL_LEFT_PX,
    PANEL_SHADOW_ROOM_PX,
    PANEL_TOP_PX,
    panelWidth,
    Phase,
    PomodoroSettings,
    PomodoroState,
    PRESETS,
    TICK_MS,
    TimerMode,
} from "../../types/pomodoro_types"

/* Retains the focus-lock re-arm poll for the widget's lifetime so GJS does not
 * finalize it (which would silently stop the flow-lock re-arming). */
const keepAlive: unknown[] = []

export default function Pomodoro(gdkmonitor: Gdk.Monitor) {
    const { TOP, LEFT, RIGHT, BOTTOM } = Astal.WindowAnchor

    /* Width from the LIVE monitor, not a baked-in constant, so the panel meets
     * the right-anchored info column on any screen. get_geometry() is logical
     * (scale already applied), which is the coordinate space these margins use. */
    const panelWidthPx = panelWidth(gdkmonitor.get_geometry().width)

    const [settings, setSettingsRaw] = createState<PomodoroSettings>(loadSettings())
    const [state, setStateRaw] = createState<PomodoroState>(loadState(settings.get().durations))
    const [fullscreen, setFullscreen] = createState(false)

    /* The flow break's one-line rationale. `loading` covers the ~1-2s the AI
     * takes; `text` is its reason (empty when the deterministic fallback stands,
     * so the line only ever shows something the AI actually said). */
    const [breakNote, setBreakNote] = createState<{ loading: boolean; text: string }>({
        loading: false,
        text: "",
    })

    /* Lights-out: a full blackout that leaves only the clock. It implies
     * fullscreen (offing "everything" only makes sense edge-to-edge), and a
     * click anywhere or Escape brings the controls back. */
    const [lightsOut, setLightsOut] = createState(false)

    function toggleLightsOut() {
        const next = !lightsOut.get()
        setLightsOut(next)
        if (next && !fullscreen.get()) setFullscreen(true)
    }

    /* Everything but the clock is chrome, and chrome hides in lights-out. */
    const chrome = createComputed(() => !lightsOut())

    function update(next: PomodoroState) {
        setStateRaw(next)
        saveState(next)
    }

    function updateSettings(next: PomodoroSettings) {
        setSettingsRaw(next)
        saveSettings(next)
    }

    /* Study playlist: open the entry's playlist in mpv (video, resumes position)
     * and remember it in settings so it's pre-filled next time. */
    let playlistEntry: Gtk.Entry | null = null
    function openPlaylistNow() {
        const target = playlistEntry?.text.trim() ?? ""
        if (target.length === 0) return
        if (target !== settings.get().studyPlaylist) {
            updateSettings({ ...settings.get(), studyPlaylist: target })
        }
        openPlaylist(target)
    }

    /* Credit the current running focus stretch to the session log, so partial
     * (interrupted) study counts - not just completed blocks. No-op unless a
     * focus is actively running; each stretch is logged once when it ends, so
     * pausing then completing never double-counts. */
    function logFocusSegment(s: PomodoroState) {
        const minutes = Math.round(focusSegmentSeconds(s) / 60)
        if (minutes >= 1) logSession("focus", s.task, minutes)
    }

    /*
     * Study lockdown. Locked exactly while a focus session is actively running -
     * pomodoro focus OR flow focus - and unlocked on every exit (pause, reset,
     * advance into a break, flow stop, and app quit). Declarative and
     * edge-triggered off state/settings, so no lock/unlock calls are sprinkled
     * through the individual handlers.
     *
     * A pomodoro focus locks for its exact remaining seconds, so the tool's own
     * backstop unlocks cleanly at the phase end even if AGS dies. Flow focus has
     * no fixed end, so it locks for a short backstop that the poll below re-arms
     * while it runs. All of this no-ops unless `lockDuringFocus` is on.
     */
    let focusLocked = false
    function shouldFocusLock(): boolean {
        const s = state.get()
        return settings.get().lockDuringFocus && isRunning(s) && s.phase === "focus"
    }
    function syncFocusLock() {
        const locking = shouldFocusLock()
        if (locking && !focusLocked) {
            focusLocked = true
            lockFor(
                isFlow(settings.get())
                    ? FOCUS_LOCK_FLOW_BACKSTOP_SECONDS
                    : remainingSeconds(state.get()),
            )
        } else if (!locking && focusLocked) {
            focusLocked = false
            unlock()
        }
    }
    state.subscribe(syncFocusLock)
    settings.subscribe(syncFocusLock)
    /* Cover a restart mid-focus (persisted running state) and a toggle flip. */
    syncFocusLock()

    /* Re-arm the flow lock so its short backstop always trails just ahead: if
     * AGS dies mid-flow the tool auto-unlocks within one window rather than
     * stranding the machine. No-op for pomodoro and while unlocked. */
    keepAlive.push(
        createPoll(0, FOCUS_LOCK_REARM_MS, (n) => {
            if (focusLocked && isFlow(settings.get()) && shouldFocusLock()) {
                lockFor(FOCUS_LOCK_FLOW_BACKSTOP_SECONDS)
            }
            return n
        }),
    )

    /* Never strand the lock on quit (a boot-unlock service is the final net). */
    try {
        app.connect("shutdown", () => {
            if (focusLocked) unlock()
        })
    } catch (error) {
        console.error("focus-lock: could not hook app shutdown:", error)
    }

    /* The number on the clock: elapsed while a flow session counts up, remaining
     * otherwise. Both are derived from wall time, so this never drifts. */
    function displayFor(s: PomodoroState, cfg: PomodoroSettings): number {
        return isFlow(cfg) && s.phase === "focus" ? flowElapsedSeconds(s) : remainingSeconds(s)
    }

    /* Repaint only - the value is derived from the clock, not counted here. */
    const display = createPoll(displayFor(state.get(), settings.get()), TICK_MS, () => {
        const current = state.get()
        const config = settings.get()

        /* Flow focus counts up and never ends on its own; only Stop ends it. */
        if (isFlow(config) && current.phase === "focus") {
            return flowElapsedSeconds(current)
        }

        const left = remainingSeconds(current)

        if (isRunning(current) && left <= 0) {
            const { next, finishedPhase } = advance(current, config)
            /* Log the ACTUAL focus time of the finishing stretch (partial study
             * counts). Only focus is a study session - breaks are ignored by the
             * heatmap and skipped here; flow logs its own at Stop. */
            if (!isFlow(config) && finishedPhase === "focus") {
                logFocusSegment(current)
            }

            /* Both are fire-and-forget: the next phase must not wait on a
             * notification, and piper takes ~1.2s to synthesise. */
            notifyFinished(finishedPhase, current.task)
            if (config.voice) speakFinished(finishedPhase)

            update(next)
            return displayFor(next, config)
        }

        return left
    })

    /*
     * Clock digits. Under an hour the display is MM:SS, where the minutes may
     * run past 60 (a 90-min preset shows nothing odd here on its own). Once the
     * time reaches a full hour it becomes H:MM:SS and the hour flipper appears;
     * the hour is a single glyph, which covers everything up to 9h59 - past any
     * real session.
     */
    const clock = createComputed(() => {
        const total = display()
        const hrs = Math.floor(total / 3600)
        const mins = hrs > 0 ? Math.floor((total % 3600) / 60) : Math.floor(total / 60)
        const secs = total % 60
        return {
            showHours: hrs > 0,
            h: String(hrs),
            mm: String(mins).padStart(2, "0"),
            ss: String(secs).padStart(2, "0"),
        }
    })
    const showHours = clock((c) => c.showHours)
    const hourGlyph = clock((c) => c.h)
    const mTens = clock((c) => c.mm[0])
    const mOnes = clock((c) => c.mm[1])
    const sTens = clock((c) => c.ss[0])
    const sOnes = clock((c) => c.ss[1])

    const running = createComputed(() => isRunning(state()))
    const task = createComputed(() => state().task)

    /* Flow focus running reads "Stop" (it ends the session and sets a break);
     * everything else is the plain Start/Pause of a countdown. */
    const playLabel = createComputed(() => {
        const s = state()
        if (isFlow(settings()) && s.phase === "focus" && isRunning(s)) return "Stop"
        return isRunning(s) ? "Pause" : "Start"
    })

    function toggle() {
        const current = state.get()
        const config = settings.get()

        /* Flow focus: Start begins the count-up, Stop ends it into a break. */
        if (isFlow(config) && current.phase === "focus") {
            if (isRunning(current)) {
                const { next, focusSeconds } = stopFlow(current, config)
                /* Too short to count as a session - just stop, no break earned. */
                if (focusSeconds < FLOW_MIN_SESSION_SECONDS) {
                    return update({ ...current, startedAt: null, pausedRemaining: 0 })
                }
                logSession("focus", current.task, Math.round(focusSeconds / 60))
                /* Show the divisor break instantly, then let the AI refine it -
                 * the break never waits on the network. */
                update(next)
                void proposeBreak(current.task, focusSeconds)
                return
            }
            if (current.task.trim().length === 0) return
            setBreakNote({ loading: false, text: "" })
            return update(start(current))
        }

        /* Countdown: pomodoro phases, and flow breaks. Pausing a running focus
         * credits the time studied so far before it freezes. */
        if (isRunning(current)) {
            logFocusSegment(current)
            return update(pause(current))
        }
        /* No task, no start: the session has nothing to belong to. */
        if (current.phase === "focus" && current.task.trim().length === 0) return
        update(start(current))
    }

    /* Paused mid-session: frozen (not running) with time already spent - the
     * clock sits below the phase's full length. A fresh idle phase (clock at
     * full, or a flow-focus count-up at 0) is not "paused" and shows no reset. */
    const paused = createComputed(() => {
        const s = state()
        if (isRunning(s)) return false
        const full = settings().durations[s.phase] * 60
        return s.pausedRemaining > 0 && s.pausedRemaining < full
    })

    /* Two flavours of reset, both gated behind the same confirm popover. Either
     * way the task is kept (so Start picks up the same one) and any time already
     * studied was credited on the pause this reset follows, so the clock is wiped
     * but the study time still counts.
     *
     * - segment: just this phase, back to its own start. The cycle (how many
     *   blocks toward the long break) is untouched - you were mid-block, you redo
     *   the block.
     * - whole session: the entire sitting. Back to focus block 1 with the cycle
     *   counter zeroed, as if you just sat down. */
    let resetPop: Gtk.Popover | null = null
    function resetSegment() {
        logFocusSegment(state.get())
        update(reset(state.get(), settings.get().durations))
    }
    function resetWholeSession() {
        logFocusSegment(state.get())
        const d = settings.get().durations
        update({
            ...state.get(),
            phase: "focus",
            startedAt: null,
            pausedRemaining: d.focus * 60,
            completed: 0,
        })
    }

    /* Switch mode from settings. Reset to a clean idle focus so the clock is not
     * left showing a countdown value while counting up, or vice versa. */
    function setMode(mode: TimerMode) {
        updateSettings({ ...settings.get(), mode })
        const current = state.get()
        update({
            ...current,
            phase: "focus",
            startedAt: null,
            pausedRemaining: mode === "flow" ? 0 : settings.get().durations.focus * 60,
        })
    }

    /*
     * Ask the AI to size the break from real signals (focus length, task, time
     * of day, sessions today). The divisor break is already on screen, so this
     * only refines it. Any failure - no key, offline, bad JSON - is swallowed:
     * the fallback simply stands, and the reason line stays empty.
     */
    async function proposeBreak(task: string, focusSeconds: number) {
        setBreakNote({ loading: true, text: "" })
        try {
            const provider = PROVIDERS[ACTIVE_PROVIDER]
            const key = await readApiKey(provider)
            if (!key) return setBreakNote({ loading: false, text: "" })

            const result = await flowBreak({
                provider,
                key,
                focusMinutes: Math.max(1, Math.round(focusSeconds / 60)),
                task,
                clockLabel: localClockLabel(),
                sessionsToday: focusSessionsToday(),
                minMinutes: FLOW_BREAK_MIN_MINUTES,
                maxMinutes: FLOW_BREAK_MAX_MINUTES,
            })

            /* The user may have moved on in the ~2s it took; only apply if we are
             * still sitting in this flow break. */
            const s = state.get()
            if (!isFlow(settings.get()) || s.phase !== "short") return

            update({
                ...s,
                pausedRemaining: result.minutes * 60,
                startedAt: settings.get().autoStart ? nowSeconds() : null,
            })
            setBreakNote({ loading: false, text: result.reason })
        } catch (error) {
            console.error("pomodoro: flow break AI failed, keeping divisor break:", error)
            setBreakNote({ loading: false, text: "" })
        }
    }

    /* Set a phase duration to an exact clamped value (typed entry, +/- buttons,
     * presets all route through here). */
    function setDurationValue(phase: Phase, minutes: number) {
        const config = settings.get()
        const durations: Durations = {
            ...config.durations,
            [phase]: clampDuration(minutes),
        }
        updateSettings({ ...config, durations })

        /* A running timer keeps its countdown; the change lands on the next
         * session. An idle timer on this phase re-arms immediately. */
        const current = state.get()
        if (!isRunning(current) && current.phase === phase) {
            update({ ...current, pausedRemaining: durations[phase] * 60 })
        }
    }

    function setDuration(phase: Phase, delta: number) {
        setDurationValue(phase, settings.get().durations[phase] + delta)
    }

    function applyPreset(durations: Durations) {
        updateSettings({ ...settings.get(), durations })
        const current = state.get()
        if (!isRunning(current)) {
            update({ ...current, pausedRemaining: durations[current.phase] * 60 })
        }
    }

    /* --- mood -> preset --------------------------------------------------
     * Tap how you feel; the focus/break lengths jump to a preset that matches
     * that energy (MOOD_PRESETS). A lookup, not the AI - instant and offline. */
    const [planMood, setPlanMood] = createState<Mood | "">("")

    /* One-line confirmation of what the last mood set, e.g.
     * "tired -> 20m focus / 8m break / 15m long". Empty until a chip is tapped. */
    const [planResult, setPlanResult] = createState<string>("")

    function pickMood(mood: Mood) {
        const preset = MOOD_PRESETS[mood]
        applyPreset(preset)
        setPlanMood(mood)
        const rest =
            preset.long === preset.short
                ? `${preset.short}m break`
                : `${preset.short}m break / ${preset.long}m long`
        setPlanResult(`${mood} -> ${preset.focus}m focus / ${rest}`)
    }

    function planChip(label: string, active: () => boolean, onPick: () => void) {
        return (
            <button
                class={createComputed(() => `chip ${active() ? "chip-active" : ""}`)}
                label={label}
                onClicked={onPick}
                $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
            />
        )
    }

    const PHASE_NAME: Record<Phase, string> = {
        focus: "Focus",
        short: "Short break",
        long: "Long break",
    }

    /* Jump straight to a phase: lands you on it idle, clock at that phase's full
     * length, task and tally untouched. Only while the clock is stopped - mid
     * session the pills go insensitive and stay pure indicator, so a stray tap
     * can never wipe a running block. */
    function setPhase(target: Phase) {
        const current = state.get()
        if (isRunning(current) || current.phase === target) return
        update({
            ...current,
            phase: target,
            startedAt: null,
            pausedRemaining: settings.get().durations[target] * 60,
        })
    }

    function pill(target: Phase, label: string) {
        return (
            <button
                class={createComputed(() => `pill ${state().phase === target ? "active" : ""}`)}
                label={label}
                /* The letter is compact but not self-explaining; the tooltip
                 * carries the actual name and, while running, why it is dead. */
                tooltipText={running((r) => (r ? `${PHASE_NAME[target]} - pause to switch` : PHASE_NAME[target]))}
                sensitive={running((r) => !r)}
                onClicked={() => setPhase(target)}
                $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
            />
        )
    }

    function dot(i: number) {
        return (
            <box class={createComputed(() => `dot ${i < state().completed % CYCLE_LENGTH ? "filled" : ""}`)} />
        )
    }

    function stepper(label: string, phase: Phase) {
        return (
            <box class="setting-row" spacing={0}>
                <label class="setting-label" label={label} hexpand={true} xalign={0} />
                <box class="stepper">
                    <button class="step" onClicked={() => setDuration(phase, -1)}>
                        <image iconName="list-remove-symbolic" />
                    </button>
                    {/* Type a value directly, or use +/-. Commits on Enter and on
                       focus-out; the field snaps back to the clamped value, so a
                       300 becomes 240 and junk reverts. Kept in sync with the
                       buttons/presets via the settings subscription. */}
                    <entry
                        class="step-val"
                        xalign={0.5}
                        maxWidthChars={4}
                        $={(self: Gtk.Entry) => {
                            self.set_text(String(settings.get().durations[phase]))
                            settings.subscribe(() => {
                                const v = String(settings.get().durations[phase])
                                if (self.text !== v) self.set_text(v)
                            })
                            const commit = () => {
                                const n = parseInt(self.text.trim(), 10)
                                if (Number.isFinite(n)) setDurationValue(phase, n)
                                self.set_text(String(settings.get().durations[phase]))
                            }
                            self.connect("activate", commit)
                            const focus = new Gtk.EventControllerFocus()
                            focus.connect("leave", commit)
                            self.add_controller(focus)
                        }}
                    />
                    <button class="step" onClicked={() => setDuration(phase, 1)}>
                        <image iconName="list-add-symbolic" />
                    </button>
                </box>
            </box>
        )
    }

    function switchRow(label: string, get: (s: PomodoroSettings) => boolean, set: (v: boolean) => void) {
        return (
            <box class="setting-row" spacing={0}>
                <label class="setting-label" label={label} hexpand={true} xalign={0} />
                <switch
                    active={settings(get)}
                    valign={Gtk.Align.CENTER}
                    $={(self: Gtk.Switch) => {
                        self.connect("notify::active", () => {
                            if (self.active !== get(settings.get())) set(self.active)
                        })
                    }}
                />
            </box>
        )
    }

    return (
        <window
            name="pomodoro"
            /* Own namespace so the Hyprland blur rule can target this panel
             * without matching the other AGS widgets. */
            namespace="pomodoro"
            class="PomodoroWidget"
            gdkmonitor={gdkmonitor}
            /* Fullscreen is the same window re-anchored to all four edges and
             * lifted above the other layers - no second window, so no state to
             * keep in sync. */
            anchor={fullscreen((f) => (f ? TOP | LEFT | RIGHT | BOTTOM : TOP | LEFT))}
            layer={fullscreen((f) => (f ? Astal.Layer.OVERLAY : Astal.Layer.BOTTOM))}
            /* Fullscreen must cover the bar too. On overlay it already sits above
             * waybar's top layer; IGNORE makes it disregard waybar's exclusive
             * zone so it extends edge-to-edge instead of starting below the bar. */
            exclusivity={fullscreen((f) => (f ? Astal.Exclusivity.IGNORE : Astal.Exclusivity.NORMAL))}
            keymode={Astal.Keymode.ON_DEMAND}
            visible={true}
            application={app}
            /* Escape leaves fullscreen. Astal.Window has no key signal of its
             * own, so this goes through a key controller. */
            $={(self: Astal.Window) => {
                /* True while the caret is in one of the text fields (task,
                 * playlist, api key) - Space belongs to the text there, and the
                 * keyboard grab must not be handed back mid-word. */
                const typing = () => {
                    const f = self.get_focus()
                    return f instanceof Gtk.Text || f instanceof Gtk.Entry
                }

                const keys = new Gtk.EventControllerKey()
                keys.connect("key-pressed", (_c, keyval: number) => {
                    /* Space starts/stops in lights-out, the way it does in a
                     * video player - a click would drop you out of lights-out,
                     * so it is the only way to start/stop and stay there.
                     *
                     * Rides on the on-demand keyboard focus the panel already
                     * holds: you got into lights-out by clicking its button, and
                     * that click is what gave it the keys. No grab is taken -
                     * an exclusive layer-shell grab pulls in input aimed at
                     * every other monitor, so clicking away simply hands the
                     * keys back and Space stops working until you click here
                     * again. Text fields are excluded outright. */
                    if (keyval === Gdk.KEY_space || keyval === Gdk.KEY_KP_Space) {
                        if (!lightsOut.get() || typing()) return false
                        toggle()
                        return true
                    }
                    if (keyval === Gdk.KEY_Escape) {
                        /* Peel back one layer at a time: lights-out, then fullscreen. */
                        if (lightsOut.get()) {
                            setLightsOut(false)
                            return true
                        }
                        if (fullscreen.get()) {
                            setFullscreen(false)
                            return true
                        }
                    }
                    return false
                })
                self.add_controller(keys)

                /* In lights-out only the (non-interactive) clock shows, so any
                 * click bubbles here and restores the controls. Buttons handle
                 * their own clicks first, so this never fires over them. */
                const click = new Gtk.GestureClick()
                click.connect("pressed", () => {
                    if (lightsOut.get()) setLightsOut(false)
                })
                self.add_controller(click)
            }}
        >
                <box
                    class={createComputed(() => {
                        let c = `panel mode-${state().phase}`
                        if (fullscreen()) c += " fullscreen"
                        if (lightsOut()) c += " lights-out"
                        return c
                    })}
                    orientation={Gtk.Orientation.VERTICAL}
                    widthRequest={fullscreen((f) => (f ? -1 : panelWidthPx))}
                    heightRequest={fullscreen((f) => (f ? -1 : PANEL_HEIGHT_PX))}
                    hexpand={fullscreen()}
                    vexpand={fullscreen()}
                    marginTop={fullscreen((f) => (f ? 0 : PANEL_TOP_PX))}
                    marginStart={fullscreen((f) => (f ? 0 : PANEL_LEFT_PX))}
                    marginEnd={fullscreen((f) => (f ? 0 : PANEL_SHADOW_ROOM_PX))}
                    marginBottom={fullscreen((f) => (f ? 0 : PANEL_SHADOW_ROOM_PX))}
                >
                    <overlay hexpand={true} vexpand={true}>
                        {/* centre stack */}
                        <box
                            class="stack"
                            orientation={Gtk.Orientation.VERTICAL}
                            valign={Gtk.Align.CENTER}
                            halign={Gtk.Align.CENTER}
                            vexpand={true}
                            hexpand={true}
                        >
                            <label
                                class={createComputed(() => `task-title ${state().task.trim() ? "set" : "empty"}`)}
                                label={task((t) => t.trim() || "what do you want to focus on?")}
                                ellipsize={3}
                                maxWidthChars={40}
                                visible={chrome}
                            />

                            {/* Tally is a pomodoro concept; flow has no 4-cycle.
                                Hidden via opacity, not `visible`, so the row keeps
                                its height and the clock below does not jump when
                                switching modes. (The phase pills are overlay
                                children, so hiding those shifts nothing.) */}
                            <box
                                class={settings((s) => `dots ${s.mode === "flow" ? "ghost" : ""}`)}
                                halign={Gtk.Align.CENTER}
                                spacing={9}
                                visible={chrome}
                            >
                                {dot(0)}{dot(1)}{dot(2)}{dot(3)}
                            </box>

                            <box class="clock" halign={Gtk.Align.CENTER} spacing={14}>
                                {/* Hour flipper + its colon, shown only past 1h. */}
                                <box class="hour-group" visible={showHours} spacing={14} valign={Gtk.Align.CENTER}>
                                    <FlipDigit digit={hourGlyph} />
                                    <box class="colon" orientation={Gtk.Orientation.VERTICAL} spacing={22} valign={Gtk.Align.CENTER}>
                                        <box class="colon-dot" />
                                        <box class="colon-dot" />
                                    </box>
                                </box>
                                <FlipDigit digit={mTens} />
                                <FlipDigit digit={mOnes} />
                                <box class="colon" orientation={Gtk.Orientation.VERTICAL} spacing={22} valign={Gtk.Align.CENTER}>
                                    <box class="colon-dot" />
                                    <box class="colon-dot" />
                                </box>
                                <FlipDigit digit={sTens} />
                                <FlipDigit digit={sOnes} />
                            </box>

                            {/* Flow break: the AI's one-line reason (or a
                                "thinking" note while it lands). Hidden entirely
                                otherwise, and when the fallback stands alone. */}
                            <label
                                class="break-note"
                                label={createComputed(() =>
                                    breakNote().loading ? "Sizing your break..." : breakNote().text,
                                )}
                                visible={createComputed(() => {
                                    const n = breakNote()
                                    return (
                                        !lightsOut() &&
                                        isFlow(settings()) &&
                                        state().phase === "short" &&
                                        (n.loading || n.text.length > 0)
                                    )
                                })}
                                wrap={true}
                                justify={Gtk.Justification.CENTER}
                                maxWidthChars={36}
                                halign={Gtk.Align.CENTER}
                            />

                            <box class="play-row" halign={Gtk.Align.CENTER} spacing={12} visible={chrome}>
                                <button
                                    class="play"
                                    label={playLabel}
                                    sensitive={createComputed(() => isRunning(state()) || state().task.trim().length > 0)}
                                    onClicked={toggle}
                                    $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                                />

                                {/* Reset - only while paused, and only after a
                                    confirm. Zeroes the phase, keeps the task,
                                    logs nothing. */}
                                <menubutton
                                    class="reset-btn"
                                    tooltipText="Reset session"
                                    visible={paused}
                                    valign={Gtk.Align.CENTER}
                                    $={(self: Gtk.MenuButton) => self.set_cursor_from_name("pointer")}
                                >
                                    <image iconName="view-refresh-symbolic" />
                                    <popover
                                        class="confirm"
                                        $={(self: Gtk.Popover) => {
                                            resetPop = self
                                        }}
                                    >
                                        <box orientation={Gtk.Orientation.VERTICAL} spacing={12}>
                                            <label class="dock-title" label="RESET" xalign={0} />
                                            <label
                                                class="dock-hint"
                                                label="Reset just this block, or clear the whole sitting back to block 1. Your task stays and time already studied is still logged."
                                                wrap={true}
                                                xalign={0}
                                                maxWidthChars={32}
                                            />
                                            <box orientation={Gtk.Orientation.VERTICAL} spacing={8}>
                                                <button
                                                    class="confirm-reset"
                                                    label="This block"
                                                    onClicked={() => {
                                                        resetSegment()
                                                        resetPop?.popdown()
                                                    }}
                                                    $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                                                />
                                                <button
                                                    class="confirm-reset confirm-reset-hard"
                                                    label="Whole session"
                                                    onClicked={() => {
                                                        resetWholeSession()
                                                        resetPop?.popdown()
                                                    }}
                                                    $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                                                />
                                                <button
                                                    class="confirm-cancel"
                                                    label="Cancel"
                                                    onClicked={() => resetPop?.popdown()}
                                                    $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                                                />
                                            </box>
                                        </box>
                                    </popover>
                                </menubutton>
                            </box>
                        </box>

                        {/* phase switcher, top-left.
                            Letters rather than bare circles: three plain dots
                            here would read as a second tally row against the
                            four in the centre. The active one takes the phase
                            accent, so it ties to the same colour system. */}
                        <box
                            $type="overlay"
                            class="phases"
                            halign={Gtk.Align.START}
                            valign={Gtk.Align.START}
                            spacing={6}
                            visible={createComputed(() => settings().mode !== "flow" && !lightsOut())}
                        >
                            {pill("focus", "F")}
                            {pill("short", "S")}
                            {pill("long", "L")}
                        </box>

                        {/* task + playlist cluster, bottom-left */}
                        <box $type="overlay" class="dock-cluster" halign={Gtk.Align.START} valign={Gtk.Align.END} spacing={12} visible={chrome}>
                        <menubutton
                            class="icon-btn"
                            tooltipText={running((r) => (r ? "Focus task - pause to edit" : "Focus task"))}
                            sensitive={running((r) => !r)}
                            $={(self: Gtk.MenuButton) => self.set_cursor_from_name("pointer")}
                        >
                            <image iconName="checkbox-checked-symbolic" />
                            <popover class="dock">
                                <box orientation={Gtk.Orientation.VERTICAL} spacing={12}>
                                    <label class="dock-title" label="FOCUS TASK" xalign={0} />
                                    <entry
                                        class="task-entry"
                                        placeholderText="what do you want to focus on?"
                                        editable={running((r) => !r)}
                                        $={(self: Gtk.Entry) => {
                                            self.set_text(state.get().task)
                                            self.connect("changed", () => {
                                                if (self.text !== state.get().task) {
                                                    update(setTask(state.get(), self.text, settings.get().durations))
                                                }
                                            })
                                        }}
                                    />
                                    <label
                                        class="dock-hint"
                                        label="Locked while the timer runs - pause to edit."
                                        visible={running()}
                                        wrap={true}
                                        xalign={0}
                                    />
                                </box>
                            </popover>
                        </menubutton>

                        {/* Study playlist - stays live during focus so you can
                            start/stop the lecture mid-session. */}
                        <menubutton
                            class="icon-btn"
                            tooltipText="Study playlist (mpv)"
                            $={(self: Gtk.MenuButton) => self.set_cursor_from_name("pointer")}
                        >
                            <image iconName="applications-multimedia-symbolic" />
                            <popover class="settings">
                                <box orientation={Gtk.Orientation.VERTICAL} spacing={12}>
                                    <label class="dock-title" label="STUDY PLAYLIST" xalign={0} />
                                    <box spacing={4}>
                                        <entry
                                            class="task-entry"
                                            hexpand={true}
                                            placeholderText="YouTube playlist URL or folder"
                                            $={(self: Gtk.Entry) => {
                                                playlistEntry = self
                                                self.set_text(settings.get().studyPlaylist)
                                                self.connect("activate", openPlaylistNow)
                                            }}
                                        />
                                        <button
                                            class="mpv-btn mpv-play"
                                            valign={Gtk.Align.CENTER}
                                            tooltipText="Open playlist in mpv"
                                            onClicked={openPlaylistNow}
                                            $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                                        >
                                            <image iconName="media-playback-start-symbolic" />
                                        </button>
                                        <button
                                            class="mpv-btn"
                                            valign={Gtk.Align.CENTER}
                                            tooltipText="Stop mpv"
                                            onClicked={() => stopPlayback()}
                                            $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                                        >
                                            <image iconName="media-playback-stop-symbolic" />
                                        </button>
                                    </box>
                                    <label
                                        class="dock-hint"
                                        label="Opens in mpv (video, resumes where you left off). Works during focus - the lockdown allows YouTube."
                                        wrap={true}
                                        xalign={0}
                                        maxWidthChars={30}
                                    />
                                </box>
                            </popover>
                        </menubutton>
                        </box>

                        {/* mood + lights-out + fullscreen + settings, bottom-right */}
                        <box $type="overlay" class="corner" halign={Gtk.Align.END} valign={Gtk.Align.END} spacing={12} visible={chrome}>
                            <menubutton
                                class="icon-btn"
                                tooltipText={running((r) =>
                                    r ? "Set mood - pause to change the session" : "Set mood - matches the timer to your energy",
                                )}
                                sensitive={running((r) => !r)}
                                $={(self: Gtk.MenuButton) => self.set_cursor_from_name("pointer")}
                            >
                                <image iconName="starred-symbolic" />
                                <popover class="settings">
                                    <box orientation={Gtk.Orientation.VERTICAL} spacing={13}>
                                        <label class="dock-title" label="HOW YOU FEEL" xalign={0} />
                                        <label
                                            class="dock-hint"
                                            label="Pick your energy - it sets the focus and break lengths to match."
                                            wrap={true}
                                            xalign={0}
                                        />

                                        <box spacing={6}>
                                            {MOODS.map((m) =>
                                                planChip(m, () => planMood() === m, () => pickMood(m)),
                                            )}
                                        </box>

                                        <label
                                            class="plan-result"
                                            label={planResult}
                                            visible={planResult((r) => r.length > 0)}
                                            wrap={true}
                                            xalign={0}
                                            maxWidthChars={34}
                                        />
                                    </box>
                                </popover>
                            </menubutton>

                            <button
                                class="icon-btn"
                                tooltipText="Lights out - only the timer"
                                onClicked={toggleLightsOut}
                                $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                            >
                                <image iconName="weather-clear-night-symbolic" />
                            </button>

                            <button
                                class="icon-btn"
                                tooltipText="Fullscreen"
                                onClicked={() => setFullscreen(!fullscreen.get())}
                                $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                            >
                                <image iconName={fullscreen((f) => (f ? "view-restore-symbolic" : "view-fullscreen-symbolic"))} />
                            </button>

                            <menubutton
                                class="icon-btn"
                                tooltipText={running((r) => (r ? "Settings - pause to change" : "Settings"))}
                                sensitive={running((r) => !r)}
                                $={(self: Gtk.MenuButton) => self.set_cursor_from_name("pointer")}
                            >
                                <image iconName="emblem-system-symbolic" />
                                {/* Capped in a scroller: the widgeted window is
                                    short, and a popover taller than the space
                                    above the button gets flipped below - off the
                                    small layer surface - and clipped to nothing.
                                    Capping keeps it fitting above, so it shows in
                                    both widgeted and fullscreen. */}
                                <popover class="settings settings-scrolled">
                                    <scrolledwindow
                                        class="settings-scroll"
                                        hscrollbarPolicy={Gtk.PolicyType.NEVER}
                                        vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
                                        propagateNaturalHeight={true}
                                        maxContentHeight={440}
                                    >
                                    <box class="settings-body" orientation={Gtk.Orientation.VERTICAL} spacing={15}>
                                        <label class="dock-title" label="TIMER SETTINGS" xalign={0} />

                                        {switchRow("Flow mode (count up)", (s) => s.mode === "flow", (v) =>
                                            setMode(v ? "flow" : "pomodoro"))}
                                        <label
                                            class="dock-hint"
                                            label="Flow counts up with no target - stop when you're done and it sets a break from how long you focused."
                                            wrap={true}
                                            xalign={0}
                                            visible={settings((s) => s.mode === "flow")}
                                        />

                                        {/* Durations and presets are the countdown's; irrelevant in flow. */}
                                        <box
                                            orientation={Gtk.Orientation.VERTICAL}
                                            spacing={10}
                                            visible={settings((s) => s.mode !== "flow")}
                                        >
                                            {stepper("Focus", "focus")}
                                            {stepper("Short break", "short")}
                                            {stepper("Long break", "long")}
                                        </box>

                                        <box
                                            orientation={Gtk.Orientation.VERTICAL}
                                            spacing={8}
                                            visible={settings((s) => s.mode !== "flow")}
                                        >
                                            <label class="dock-subtitle" label="PRESETS" xalign={0} />
                                            <box spacing={6}>
                                                {PRESETS.map((preset) => (
                                                    <button
                                                        class="chip"
                                                        label={preset.label}
                                                        onClicked={() => applyPreset(preset.durations)}
                                                        $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                                                    />
                                                ))}
                                            </box>
                                        </box>

                                        <box class="divider" />

                                        {switchRow("Voice alert", (s) => s.voice, (v) =>
                                            updateSettings({ ...settings.get(), voice: v }))}
                                        {switchRow("Auto-start next", (s) => s.autoStart, (v) =>
                                            updateSettings({ ...settings.get(), autoStart: v }))}
                                        {switchRow("Lock apps during focus", (s) => s.lockDuringFocus, (v) =>
                                            updateSettings({ ...settings.get(), lockDuringFocus: v }))}
                                        <label
                                            class="dock-hint"
                                            label="Lock firewalls to study sites + kills distractions while a focus runs; unlocks on breaks, pause, and quit."
                                            wrap={true}
                                            xalign={0}
                                            visible={settings((s) => s.lockDuringFocus)}
                                        />

                                        <label
                                            class="dock-hint"
                                            label="Editing a duration applies to the next session - a running timer keeps its current countdown."
                                            wrap={true}
                                            xalign={0}
                                        />
                                    </box>
                                    </scrolledwindow>
                                </popover>
                            </menubutton>
                        </box>
                    </overlay>
                </box>
        </window>
    )
}
