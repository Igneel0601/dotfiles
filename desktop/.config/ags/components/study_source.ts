/*
 * Study dashboard data: derived from the pomodoro session log.
 *
 * `logSession` (pomodoro_source.ts) appends one JSONL line per finished focus
 * session - `{finishedAt, phase, task, minutes}`. That is the whole data source
 * here: no new state, no new file. The heatmap, the streak and the today/week
 * totals are all just that log, bucketed by local day.
 */

import GLib from "gi://GLib"
import { readFile } from "ags/file"
import { nowSeconds, SESSION_LOG_PATH } from "../types/pomodoro_types"
import {
    DayCell,
    EXAM_DATE,
    GATE_PHASES,
    HEATMAP_BUFFER_WEEKS,
    LEARNING_END,
    HEATMAP_THRESHOLDS,
    HEATMAP_WEEKS,
    PhaseStatus,
    STUDY_PROGRESS_PATH,
    STUDY_START,
    StudyData,
    Week,
} from "../types/study_types"

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function pad2(n: number): string {
    return String(n).padStart(2, "0")
}

/* Local calendar day (not UTC): a 1am study session belongs to the night it
 * felt like, not the UTC date. `finishedAt` is a UTC ISO string, but the Date
 * getters below read it back in local time. */
function localDayKey(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/* Map of local-day -> total focus minutes. Break sessions are ignored - only
 * focus counts as study. A missing or unreadable log is simply empty. */
function focusMinutesByDay(): Map<string, number> {
    const map = new Map<string, number>()

    let raw: string
    try {
        raw = readFile(SESSION_LOG_PATH)
    } catch {
        return map
    }

    for (const line of raw.split("\n")) {
        if (line.trim().length === 0) continue
        try {
            const entry = JSON.parse(line)
            if (entry?.phase !== "focus") continue
            const finished = new Date(entry.finishedAt)
            if (Number.isNaN(finished.getTime())) continue
            const key = localDayKey(finished)
            const minutes = Number(entry.minutes) || 0
            map.set(key, (map.get(key) ?? 0) + minutes)
        } catch {
            /* Skip a corrupt line rather than losing the rest. */
        }
    }
    return map
}

function levelFor(minutes: number): number {
    if (minutes <= 0) return 0
    for (let i = 0; i < HEATMAP_THRESHOLDS.length; i++) {
        if (minutes < HEATMAP_THRESHOLDS[i]!) return i + 1
    }
    return HEATMAP_THRESHOLDS.length + 1
}

function formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h && m) return `${h}h ${m}m`
    if (h) return `${h}h`
    return `${m}m`
}

export function buildStudyData(): StudyData {
    const byDay = focusMinutesByDay()

    const now = new Date(nowSeconds() * 1000)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    /*
     * A rolling runway window of HEATMAP_WEEKS weeks (big cells), GitHub-style
     * Sun..Sat rows. It is anchored at the study start and slides forward as
     * today advances: the end follows today (+buffer), but never before the full
     * first window from the study start, and never past the exam week - so as
     * Feb nears the window has slid to end at the exam. Days after today are
     * "future": drawn dim, to be filled in as they are studied.
     */
    const addDays = (d: Date, n: number) => {
        const r = new Date(d)
        r.setDate(d.getDate() + n)
        return r
    }
    const sundayOf = (d: Date) => addDays(d, -d.getDay())
    const saturdayOf = (d: Date) => addDays(d, 6 - d.getDay())

    const spanDays = HEATMAP_WEEKS * 7 - 1
    const studyStartSun = sundayOf(new Date(STUDY_START.year, STUDY_START.month - 1, STUDY_START.day))
    const examSat = saturdayOf(new Date(EXAM_DATE.year, EXAM_DATE.month - 1, EXAM_DATE.day))
    const minEnd = addDays(studyStartSun, spanDays)
    const targetEnd = addDays(saturdayOf(today), HEATMAP_BUFFER_WEEKS * 7)

    const gridEndMs = Math.min(
        examSat.getTime(),
        Math.max(minEnd.getTime(), targetEnd.getTime()),
    )
    const gridEnd = new Date(gridEndMs)
    const start = addDays(gridEnd, -spanDays) // lands on a Sunday

    const totalCells = HEATMAP_WEEKS * 7
    const totalWeeks = HEATMAP_WEEKS

    const flat: Array<{ date: Date; minutes: number; future: boolean }> = []
    for (let i = 0; i < totalCells; i++) {
        const date = new Date(start)
        date.setDate(start.getDate() + i)
        const future = date.getTime() > today.getTime()
        const minutes = future ? 0 : byDay.get(localDayKey(date)) ?? 0
        flat.push({ date, minutes, future })
    }

    const weeks: Week[] = []
    for (let w = 0; w < totalWeeks; w++) {
        const column = flat.slice(w * 7, w * 7 + 7)

        /* Label a month above the week that contains its 1st (GitHub's rule).
         * This avoids a stray label on a lead-in partial week - e.g. the grid
         * starting Jun 28 would otherwise print "Jun" next to "Jul". */
        const firstOfMonth = column.find((c) => c.date.getDate() === 1)
        const month = firstOfMonth ? MONTHS[firstOfMonth.date.getMonth()]! : ""

        const days: DayCell[] = column.map((c) => {
            const dateStr = `${MONTHS[c.date.getMonth()]} ${c.date.getDate()}`
            return {
                level: c.future ? 0 : levelFor(c.minutes),
                minutes: c.minutes,
                future: c.future,
                tooltip: c.future
                    ? `${dateStr} - upcoming`
                    : `${dateStr} - ${c.minutes === 0 ? "no focus" : formatMinutes(c.minutes)}`,
            }
        })

        weeks.push({ month, days })
    }

    /* Stats. Streak = consecutive most-recent past days with any focus; today
     * not yet started does not break it, so we skip a zero on the very last
     * day before counting. */
    const past = flat.filter((f) => !f.future)
    const todayMinutes = byDay.get(localDayKey(today)) ?? 0

    const weekMinutes = past.slice(-7).reduce((sum, d) => sum + d.minutes, 0)

    let streak = 0
    let i = past.length - 1
    if (i >= 0 && past[i]!.minutes === 0) i-- // today not started yet
    for (; i >= 0; i--) {
        if (past[i]!.minutes > 0) streak++
        else break
    }

    const exam = new Date(EXAM_DATE.year, EXAM_DATE.month - 1, EXAM_DATE.day)
    const daysLeft = Math.max(
        0,
        Math.ceil((exam.getTime() - today.getTime()) / 86_400_000),
    )

    const learnEnd = new Date(LEARNING_END.year, LEARNING_END.month - 1, LEARNING_END.day)
    const learningDaysLeft = Math.max(
        0,
        Math.ceil((learnEnd.getTime() - today.getTime()) / 86_400_000),
    )

    /* Use the first week's Saturday, not its Sunday, so a few lead-in days from
     * the previous month don't label the range "JUN" when it reads as July. */
    const rangeLabel = `${MONTHS[addDays(start, 6).getMonth()]} - ${MONTHS[gridEnd.getMonth()]}`.toUpperCase()

    return {
        daysLeft,
        learningDaysLeft,
        weeks,
        rangeLabel,
        /* Sun..Sat rows; label Mon/Wed/Fri like GitHub. */
        weekdayLabels: ["", "M", "", "W", "", "F", ""],
        todayMinutes,
        weekMinutes,
        streak,
    }
}

/* --- phase progress ---------------------------------------------------- */

/* How many phases are marked done (= index of the current phase). Clamped to
 * the schedule length; a missing/corrupt file means "nothing done yet". */
export function loadPhaseProgress(): number {
    try {
        const parsed = JSON.parse(readFile(STUDY_PROGRESS_PATH))
        const done = Number(parsed?.completed)
        if (!Number.isFinite(done) || done < 0) return 0
        return Math.min(done, GATE_PHASES.length)
    } catch {
        return 0
    }
}

export function savePhaseProgress(completed: number): void {
    const value = Math.max(0, Math.min(completed, GATE_PHASES.length))
    try {
        const bytes = new TextEncoder().encode(JSON.stringify({ completed: value }))
        GLib.file_set_contents(STUDY_PROGRESS_PATH, bytes)
    } catch (error) {
        console.error("study: could not save phase progress:", error)
    }
}

const DAY_MS = 86_400_000

/*
 * The current phase and how far it drifts from plan. `completed` is the number
 * of phases already marked done, so GATE_PHASES[completed] is the one you are
 * on. Drift is measured against that phase's planned end:
 *   past its end   -> "N days behind" (you overran; still on it)
 *   inside window  -> "N days left"
 *   before window  -> "starts in N days"
 */
export function buildPhaseStatus(completed: number): PhaseStatus {
    const total = GATE_PHASES.length
    if (completed >= total) {
        return { allDone: true, id: "", label: "All phases done", driftLabel: "", tone: "done", index: total, total }
    }

    const phase = GATE_PHASES[completed]!
    const now = new Date(nowSeconds() * 1000)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const start = new Date(phase.start.year, phase.start.month - 1, phase.start.day).getTime()
    const end = new Date(phase.end.year, phase.end.month - 1, phase.end.day).getTime()

    const plural = (n: number) => (n === 1 ? "" : "s")

    let driftLabel: string
    let tone: PhaseStatus["tone"]
    if (today > end) {
        const behind = Math.ceil((today - end) / DAY_MS)
        driftLabel = `${behind} day${plural(behind)} behind`
        tone = "behind"
    } else if (today < start) {
        const until = Math.ceil((start - today) / DAY_MS)
        driftLabel = `starts in ${until} day${plural(until)}`
        tone = "ahead"
    } else {
        const left = Math.ceil((end - today) / DAY_MS)
        driftLabel = `${left} day${plural(left)} left`
        tone = "ontrack"
    }

    return { allDone: false, id: phase.id, label: phase.label, driftLabel, tone, index: completed + 1, total }
}

export { formatMinutes }
