/*
 * Study dashboard: geometry, exam target, heatmap tokens and data shapes.
 * Design: "Study Dashboard.dc.html" in the Claude Design project.
 *
 * A single glass card below the pomodoro: a GATE exam countdown on the left, a
 * GitHub-style study heatmap (fed from the pomodoro session log) on the right.
 */

import GLib from "gi://GLib"
import {
    PANEL_HEIGHT_PX,
    PANEL_LEFT_PX,
    PANEL_TOP_PX,
} from "./pomodoro_types"

/* --- exam countdown ---------------------------------------------------- */

export const EXAM_LABEL = "GATE 2027"

/* Tentative - confirm against the official GATE 2027 notification. Month is 1-based. */
export const EXAM_DATE = { year: 2027, month: 2, day: 7 }

/* When serious prep began. The heatmap is a runway: it starts here and runs to
 * the exam, so it shows the prep period rather than empty pre-July history. */
export const STUDY_START = { year: 2026, month: 8, day: 24 }

/* End of the learning phase (M1..M6 content). A nearer, more actionable target
 * than the far exam - the scroll-in "days left" view counts to this, while the
 * heatmap runway still runs to the exam. Month is 1-based. */
export const LEARNING_END = { year: 2026, month: 11, day: 8 }
export const LEARNING_LABEL = "LEARNING PHASE"

/* --- phase schedule ---------------------------------------------------- *
 * The GATE plan's phases (from ~/.personal/study/gate/gate_plan.md). The
 * current phase is NOT computed from today's date - the calendar and reality
 * drift apart - it advances only when you mark a phase done. The drift shown is
 * today vs the current phase's planned end, so a phase you overran reads
 * "N days behind" until you complete it. Dates are 1-based month. */
export type YMD = { year: number; month: number; day: number }
export type PhaseDef = { id: string; label: string; start: YMD; end: YMD }

export const GATE_PHASES: PhaseDef[] = [
    { id: "M1", label: "Engg-Math + Digital Logic", start: { year: 2026, month: 8, day: 24 }, end: { year: 2026, month: 9, day: 6 } },
    { id: "M2", label: "Discrete Math + COA", start: { year: 2026, month: 9, day: 7 }, end: { year: 2026, month: 9, day: 20 } },
    { id: "M3", label: "OS + Compiler Design", start: { year: 2026, month: 9, day: 21 }, end: { year: 2026, month: 10, day: 4 } },
    { id: "M4", label: "Computer Networks + TOC", start: { year: 2026, month: 10, day: 5 }, end: { year: 2026, month: 10, day: 20 } },
    { id: "M5", label: "DBMS + Programming/DS", start: { year: 2026, month: 10, day: 21 }, end: { year: 2026, month: 11, day: 1 } },
    { id: "M6", label: "Gap-fill + Algorithms polish", start: { year: 2026, month: 11, day: 2 }, end: { year: 2026, month: 11, day: 8 } },
    { id: "PYQ", label: "PYQ sweep + revision", start: { year: 2026, month: 11, day: 9 }, end: { year: 2026, month: 12, day: 6 } },
    { id: "Mocks", label: "Mock intensive", start: { year: 2026, month: 12, day: 7 }, end: { year: 2027, month: 1, day: 24 } },
    { id: "Buffer", label: "Buffer + final revision", start: { year: 2027, month: 1, day: 25 }, end: { year: 2027, month: 2, day: 7 } },
]

/* Persisted progress: how many phases are marked done (= index of the current
 * one). A single small JSON file next to the session log. */
export const STUDY_PROGRESS_PATH = `${GLib.get_user_data_dir()}/ags/study-progress.json`

export type PhaseStatus = {
    allDone: boolean
    id: string
    label: string
    /* e.g. "6 days behind", "15 days left", "starts in 3 days". */
    driftLabel: string
    tone: "behind" | "ontrack" | "ahead" | "done"
    /* 1-based position in the schedule and the total, for "1/8". */
    index: number
    total: number
}

/* --- heatmap ----------------------------------------------------------- */

/* The heatmap shows a rolling window of this many weeks (big, readable cells)
 * rather than the whole July->exam runway at once. The window is anchored at
 * the study start and slides forward as today advances, so it ends at the exam
 * week as Feb nears. Sized so the columns fill the heatmap's width without
 * pushing the card past its fixed width. */
export const HEATMAP_WEEKS = 25

/* How many weeks past today the window reaches, so a little upcoming runway is
 * visible to fill in. */
export const HEATMAP_BUFFER_WEEKS = 4

/* Focus-minute thresholds for the 5-step ramp. A day's total focus minutes
 * below the first is level 1, and so on; 0 is level 0, >= the last is level 4.
 * Matches the design: <30, <90, <180, >=180. */
export const HEATMAP_THRESHOLDS = [30, 90, 180]

/* --- geometry ---------------------------------------------------------- *
 * Rebuilt from the pomodoro panel it sits under, not the design's frame
 * numbers - same left edge and width as the panel, one gap below it, exactly as
 * the panel itself is rebuilt from the info/battery/sticky cards. */

const WIDGET_GAP_PX = 12

export const STUDY_LEFT_PX = PANEL_LEFT_PX
/* Width is derived from the live monitor in the component (panelWidth), matching
 * the pomodoro panel above - no static width constant here anymore. */
export const STUDY_TOP_PX = PANEL_TOP_PX + PANEL_HEIGHT_PX + WIDGET_GAP_PX
export const STUDY_HEIGHT_PX = 269

/* Right-side shadow room matches the panel so the two windows line up; the
 * bottom sits at the screen edge, so it needs almost none. */
export const STUDY_SHADOW_ROOM_PX = 50
export const STUDY_SHADOW_ROOM_BOTTOM_PX = 8

/* Repaint cadence - a minute is plenty for a day-scale view. */
export const STUDY_TICK_MS = 60_000

/* --- data shapes ------------------------------------------------------- */

export type DayCell = {
    level: number
    minutes: number
    future: boolean
    tooltip: string
}

export type Week = {
    /* Month label shown above the column, or "" when it repeats the previous. */
    month: string
    days: DayCell[]
}

export type StudyData = {
    daysLeft: number
    /* Days to the learning-phase end (LEARNING_END), for the scroll-in view. */
    learningDaysLeft: number
    weeks: Week[]
    weekdayLabels: string[]
    /* The visible window's month span, e.g. "JUL - DEC" (slides toward FEB). */
    rangeLabel: string
    todayMinutes: number
    weekMinutes: number
    streak: number
}
