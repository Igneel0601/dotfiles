import app from "ags/gtk4/app"
import Gio from "gi://Gio"
import { createState } from "ags"
import { With } from "gnim"
import { createPoll, timeout, Timer } from "ags/time"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import {
    buildPhaseStatus,
    buildStudyData,
    formatMinutes,
    loadPhaseProgress,
    savePhaseProgress,
} from "../../components/study_source"
import { nowSeconds, panelWidth, SESSION_LOG_PATH } from "../../types/pomodoro_types"
import {
    GATE_PHASES,
    LEARNING_END,
    LEARNING_LABEL,
    STUDY_LEFT_PX,
    STUDY_SHADOW_ROOM_BOTTOM_PX,
    STUDY_SHADOW_ROOM_PX,
    STUDY_TOP_PX,
} from "../../types/study_types"

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/* Number clipper (see the cd-number-clip callback): the mono digits seat low
 * with dead ascent above, and GTK4 clamps negative margins to 0, so a
 * ScrolledWindow forced shorter than its child clips it and a Gtk.Fixed offset
 * pulls the digits up. Same trick as FlipDigit. */
const CD_NUMBER_CLIP_H = 112
const CD_NUMBER_OFFSET_Y = -35

const ACCENT = "#e78ba0"
const STRONG = "#eef0f4"

/* Heatmap column pitch = cell min-width (16) + gap (4). Month labels are placed
 * at multiples of this so they sit above their week column. */
const HM_COL_PITCH = 20

/* Retains the file monitor and rollover poll for the widget's lifetime so GJS
 * does not finalize them (which would silently stop live updates). */
const keepAlive: unknown[] = []

/* One stat as Pango markup: a coloured value plus a muted trailing word. GTK
 * markup takes span attributes, not CSS classes. */
function stat(value: string, unit: string, color: string): string {
    return `<span foreground="${color}" weight="bold">${value}</span> ${unit}`
}

export default function Study(gdkmonitor: Gdk.Monitor) {
    const { TOP, LEFT, BOTTOM } = Astal.WindowAnchor

    /* Same live-monitor width as the pomodoro panel above it, so the two stay
     * the same width and the pair meets the right column on any screen. */
    const studyWidthPx = panelWidth(gdkmonitor.get_geometry().width)

    /*
     * Live data. `refresh` rebuilds it from the session log. Two triggers:
     *  - a Gio.FileMonitor on the log, so a finished focus session lights its
     *    cell the moment it is written (debounced against duplicate events);
     *  - a 60s tick for the midnight rollover (the "today" cell and days-left).
     */
    const [data, setData] = createState(buildStudyData())
    const refresh = () => setData(buildStudyData())

    /*
     * Phase tracker. `completedPhases` (persisted) is how many phases are marked
     * done; the current phase and its drift are derived from it. Advancing is
     * manual - mark done to move on - because the plan calendar and reality
     * drift apart. The drift also depends on today, so it is recomputed on the
     * day-rollover tick below.
     */
    let completedPhases = loadPhaseProgress()
    const [phase, setPhase] = createState(buildPhaseStatus(completedPhases))
    const refreshPhase = () => setPhase(buildPhaseStatus(completedPhases))
    let phasePop: Gtk.Popover | null = null
    function markPhaseDone() {
        if (phase.get().allDone) return
        completedPhases += 1
        savePhaseProgress(completedPhases)
        refreshPhase()
    }

    /* The left column has two views, swapped by scrolling over it: the phase
     * hero (default) and the learning-phase days-left countdown. Scroll up ->
     * days, down -> phase. */
    const [leftView, setLeftView] = createState<"phase" | "days">("phase")

    try {
        const monitor = Gio.File.new_for_path(SESSION_LOG_PATH).monitor(
            Gio.FileMonitorFlags.NONE,
            null,
        )
        let pending: Timer | null = null
        monitor.connect("changed", () => {
            pending?.cancel()
            pending = timeout(250, refresh)
        })
        keepAlive.push(monitor)
    } catch (error) {
        console.error("study: could not watch the session log:", error)
    }

    let lastDay = new Date(nowSeconds() * 1000).getDate()
    keepAlive.push(
        createPoll(lastDay, 60_000, () => {
            const day = new Date(nowSeconds() * 1000).getDate()
            if (day !== lastDay) {
                lastDay = day
                refresh()
                refreshPhase()
            }
            return day
        }),
    )

    return (
        <window
            name="study"
            /* Own namespace so the Hyprland blur rule targets just this card. */
            namespace="study"
            class="StudyWidget"
            gdkmonitor={gdkmonitor}
            /* Anchored TOP and BOTTOM so layer-shell stretches the surface to
             * fill from the card's top down to the screen bottom - the bar's
             * exclusive zone is honoured automatically, so a manual height (which
             * can't see the bar) is never needed. Same pattern as the sticky. */
            anchor={TOP | LEFT | BOTTOM}
            /* BOTTOM layer, like the pomodoro at rest, so a fullscreen timer
             * covers it. */
            layer={Astal.Layer.BOTTOM}
            /* The vertical offset is a WINDOW margin (not on the box): it sets
             * the surface's top edge below the pomodoro, so the surface never
             * overlaps it. The bottom anchor then fills the rest downward. */
            marginTop={STUDY_TOP_PX}
            application={app}
            visible={true}
        >
            <box
                class="study-card"
                widthRequest={studyWidthPx}
                vexpand={true}
                marginStart={STUDY_LEFT_PX}
                marginEnd={STUDY_SHADOW_ROOM_PX}
                marginBottom={STUDY_SHADOW_ROOM_BOTTOM_PX}
            >
                {/* --- left: phase hero <-> days-left, swapped by scroll --- */}
                <box
                    class="countdown"
                    orientation={Gtk.Orientation.VERTICAL}
                    valign={Gtk.Align.CENTER}
                    /* Fixed width so switching views never resizes this column (and
                     * so never shrinks the heatmap, which fills the remaining
                     * space). The two views differ in natural width; pinning the
                     * column keeps the split constant. */
                    widthRequest={290}
                    hexpand={false}
                    $={(self: Gtk.Box) => {
                        const scroll = new Gtk.EventControllerScroll({
                            flags: Gtk.EventControllerScrollFlags.BOTH_AXES,
                        })
                        /* Capture phase: intercept the wheel before the inner
                         * ScrolledWindow (the number clipper) can scroll its own
                         * content, so the digit never slides. Any scroll direction
                         * advances to the next view and loops; a cooldown makes one
                         * flick = one step rather than a flicker. */
                        scroll.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
                        let cooling = false
                        scroll.connect("scroll", () => {
                            if (cooling) return true
                            cooling = true
                            timeout(220, () => {
                                cooling = false
                            })
                            setLeftView(leftView.get() === "phase" ? "days" : "phase")
                            return true
                        })
                        self.add_controller(scroll)
                    }}
                >
                    {/* Phase hero view (default). */}
                    <box class="phase-view" orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} spacing={9} visible={leftView((v) => v === "phase")}>
                    <box class="ph-heading-row" spacing={8} valign={Gtk.Align.CENTER}>
                        <label class="cd-heading" label="CURRENT PHASE" xalign={0} hexpand={true} />
                        <label class="ph-count" label={phase((s) => `${s.index}/${s.total}`)} xalign={1} />
                    </box>

                    {/* Hero: the phase id, big. Topic + drift stack to its right. */}
                    <box class="ph-hero-row" spacing={14} valign={Gtk.Align.CENTER}>
                        <label class="ph-hero" label={phase((s) => (s.allDone ? "✓" : s.id))} valign={Gtk.Align.CENTER} />
                        <box orientation={Gtk.Orientation.VERTICAL} spacing={3} valign={Gtk.Align.CENTER}>
                            <label
                                class={phase((s) => `ph-drift ${s.tone}`)}
                                label={phase((s) => (s.allDone ? "on track" : s.driftLabel))}
                                xalign={0}
                            />
                            <label
                                class="ph-topic"
                                label={phase((s) => s.label)}
                                xalign={0}
                                wrap={true}
                                maxWidthChars={20}
                            />
                        </box>
                    </box>

                    {/* Mark done -> advance to the next phase, behind a confirm. */}
                    <menubutton
                        class="ph-done"
                        halign={Gtk.Align.START}
                        tooltipText={phase((s) => (s.allDone ? "All phases complete" : `Mark ${s.id} done → next phase`))}
                        sensitive={phase((s) => !s.allDone)}
                        visible={phase((s) => !s.allDone)}
                        $={(self: Gtk.MenuButton) => self.set_cursor_from_name("pointer")}
                    >
                        <box spacing={7} valign={Gtk.Align.CENTER}>
                            <image iconName="object-select-symbolic" />
                            <label label={phase((s) => `Mark ${s.id} done`)} />
                        </box>
                        <popover
                            class="confirm"
                            $={(self: Gtk.Popover) => {
                                phasePop = self
                            }}
                        >
                            <box class="confirm-box" orientation={Gtk.Orientation.VERTICAL} spacing={11}>
                                <label class="confirm-title" label={phase((s) => `MARK ${s.id} DONE?`)} xalign={0} />
                                <label
                                    class="confirm-text"
                                    label={phase((s) =>
                                        s.index < s.total
                                            ? `Advances to ${GATE_PHASES[s.index]!.id} · ${GATE_PHASES[s.index]!.label}.`
                                            : "This is the last phase.",
                                    )}
                                    wrap={true}
                                    xalign={0}
                                    maxWidthChars={28}
                                />
                                <box spacing={8} halign={Gtk.Align.END}>
                                    <button
                                        class="confirm-cancel"
                                        label="Cancel"
                                        onClicked={() => phasePop?.popdown()}
                                        $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                                    />
                                    <button
                                        class="confirm-ok"
                                        label="Mark done"
                                        onClicked={() => {
                                            markPhaseDone()
                                            phasePop?.popdown()
                                        }}
                                        $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                                    />
                                </box>
                            </box>
                        </popover>
                    </menubutton>
                    </box>

                    {/* Days-left view: counts to the learning-phase end, scrolled
                        in over the phase hero. */}
                    <box class="days-view" orientation={Gtk.Orientation.VERTICAL} valign={Gtk.Align.CENTER} spacing={10} visible={leftView((v) => v === "days")}>
                        <label class="cd-heading" label={`DAYS TO ${LEARNING_LABEL}`} xalign={0} />
                        <box class="cd-number-row" spacing={9} valign={Gtk.Align.END}>
                            <box
                                class="cd-number-clip"
                                valign={Gtk.Align.END}
                                $={(self: Gtk.Box) => {
                                    const sw = new Gtk.ScrolledWindow()
                                    sw.set_policy(Gtk.PolicyType.EXTERNAL, Gtk.PolicyType.EXTERNAL)
                                    sw.set_propagate_natural_width(true)
                                    sw.set_propagate_natural_height(false)
                                    sw.set_size_request(-1, CD_NUMBER_CLIP_H)
                                    sw.set_overflow(Gtk.Overflow.HIDDEN)

                                    const label = new Gtk.Label({ label: String(data.get().learningDaysLeft) })
                                    label.add_css_class("cd-number")
                                    data.subscribe(() => label.set_text(String(data.get().learningDaysLeft)))

                                    const fixed = new Gtk.Fixed()
                                    fixed.put(label, 0, CD_NUMBER_OFFSET_Y)
                                    sw.set_child(fixed)
                                    self.append(sw)
                                }}
                            />
                            <label class="cd-days" label={"DAYS\nLEFT"} valign={Gtk.Align.END} xalign={0} />
                        </box>
                        <box class="cd-target" spacing={9}>
                            <box class="cd-target-dot" valign={Gtk.Align.CENTER} />
                            <label class="cd-target-label" label={`Ends - ${MONTHS[LEARNING_END.month - 1]} ${LEARNING_END.day}, ${LEARNING_END.year}`} />
                        </box>
                    </box>
                </box>

                <box class="study-divider" />

                {/* --- right: study heatmap ------------------------------- */}
                <box class="heatmap" orientation={Gtk.Orientation.VERTICAL} hexpand={true}>
                    <box class="hm-header">
                        <label class="hm-title" label="STUDY ACTIVITY" xalign={0} hexpand={true} />
                        <label class="hm-range" label={data((d) => d.rangeLabel)} xalign={1} />
                    </box>

                    {/* The grid re-renders whenever data changes (session logged
                        or day rolled over), so cells fill live. The With Fragment
                        is wrapped in this holder box so it keeps the middle slot -
                        a bare Fragment here appends at the end and the footer
                        floats up next to the header. */}
                    <box class="hm-grid-holder" vexpand={true} valign={Gtk.Align.CENTER}>
                    <With value={data}>
                        {(d) => (
                            <box class="hm-grid" spacing={11} valign={Gtk.Align.CENTER} halign={Gtk.Align.START}>
                                {/* weekday labels (Sun..Sat); a spacer up top keeps
                                    them aligned with the cell rows below the months. */}
                                <box class="hm-weekdays" orientation={Gtk.Orientation.VERTICAL} spacing={4} valign={Gtk.Align.START}>
                                    <box class="hm-months-spacer" heightRequest={16} />
                                    {d.weekdayLabels.map((wd) => (
                                        <label class="hm-weekday" label={wd} xalign={1} />
                                    ))}
                                </box>

                                <box class="hm-columns" orientation={Gtk.Orientation.VERTICAL} spacing={6} valign={Gtk.Align.START} halign={Gtk.Align.START}>
                                    {/* month labels, absolutely placed above their
                                        column via Gtk.Fixed - a plain box can't let a
                                        "Jul" wider than the column overflow without
                                        shoving the next column. */}
                                    <box
                                        class="hm-months"
                                        heightRequest={14}
                                        halign={Gtk.Align.START}
                                        $={(self: Gtk.Box) => {
                                            const fixed = new Gtk.Fixed()
                                            d.weeks.forEach((wk, i) => {
                                                if (wk.month) {
                                                    const lbl = new Gtk.Label({ label: wk.month })
                                                    lbl.add_css_class("hm-month")
                                                    fixed.put(lbl, i * HM_COL_PITCH, 0)
                                                }
                                            })
                                            self.append(fixed)
                                        }}
                                    />

                                    {/* one vertical column of 7 cells per week */}
                                    <box class="hm-cells" spacing={4} halign={Gtk.Align.START}>
                                        {d.weeks.map((wk) => (
                                            <box class="hm-week" orientation={Gtk.Orientation.VERTICAL} spacing={4}>
                                                {wk.days.map((day) => (
                                                    <box
                                                        class={`hm-cell l${day.level}${day.future ? " future" : ""}`}
                                                        tooltipText={day.tooltip}
                                                    />
                                                ))}
                                            </box>
                                        ))}
                                    </box>
                                </box>
                            </box>
                        )}
                    </With>
                    </box>

                    <box class="hm-footer">
                        <box class="hm-stats" spacing={18} hexpand={true}>
                            <label class="hm-stat" useMarkup={true} label={data((d) => stat(formatMinutes(d.todayMinutes), "today", ACCENT))} />
                            <label class="hm-stat" useMarkup={true} label={data((d) => stat(formatMinutes(d.weekMinutes), "this week", STRONG))} />
                            <label class="hm-stat" useMarkup={true} label={data((d) => stat(String(d.streak), "day streak", STRONG))} />
                        </box>
                        <box class="hm-legend" spacing={7} valign={Gtk.Align.CENTER}>
                            <label class="hm-legend-cap" label="less" />
                            <box class="hm-legend-cells" spacing={4}>
                                {[0, 1, 2, 3, 4].map((l) => (
                                    <box class={`hm-cell hm-legend-cell l${l}`} />
                                ))}
                            </box>
                            <label class="hm-legend-cap" label="more" />
                        </box>
                    </box>
                </box>
            </box>
        </window>
    )
}
