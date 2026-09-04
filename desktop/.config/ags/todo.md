# todo

## Done

- **Pomodoro widget** — timestamp-driven engine (restart-safe), task-owns-session,
  dunst + piper TTS on finish, fullscreen, lights-out (blackout + scaled clock),
  flip-clock digits with hour flipper (`H:MM:SS`), type-editable durations
  (1-240 min), presets, per-phase accents. Design: "Pomodoro Widget.dc.html".
- **Flow (count-up) mode** — Flowtime: focus counts up, Stop sets a break from
  how long you focused (`÷5`, clamped 3-30 min). An AI flow-break refines that ÷5
  with a one-line reason (kept - it's the pomodoro's one AI touch now).
- **Study dashboard** — GATE countdown + GitHub-style study heatmap, below the
  pomodoro. Fed live from the session log (`pomodoro-log.jsonl`): a FileMonitor
  fills cells the moment a focus session ends. Heatmap is a rolling 22-week
  runway anchored at the July study-start, sliding to the exam as Feb nears.
  Design: "Study Dashboard.dc.html".
- **AI motivation quote** (pomodoro) — built, then removed: a one-word task only
  ever produced generic filler and it cost a call + layout compromises.
- **Sticky-note pagination** — 3 file-backed pages (`notes/1.md`..`3.md`), the old
  `scratch.md` migrated into page 1. Dedicated footer bar (top border mirroring the
  header) holds the pager `‹ ● ○ ○ ›`: button-styled arrows + jump dots, or
  `Alt+←/→`. Per-page edit time, backup, and AI tidy; undo doesn't cross pages.
- **Mood → preset picker** (pomodoro ✨ corner button) — tap how you feel
  (tired/fresh/anxious/wired) and the focus/break lengths jump to a matching
  preset (`MOOD_PRESETS`): tired 20/8/15, fresh 50/10/20, anxious 15/5/15, wired
  30/5/15. A pure lookup — instant, offline, no key. Replaced the AI session
  planner (built then cut same day: with presets it was just a switch statement;
  the note field wasn't earning the AI/network/key tax). Flow-break AI left as-is.
- **Stop hook** — `~/.claude/settings.json`: dunst `notify-send` + piper TTS when a
  turn finishes (async). Reminds the user Claude is done.
- **Pomodoro control polish** — (1) **F/S/L pills are indicator-only** now (plain
  labels, not buttons): they mark the active phase but no longer reset the session
  on a tap. (2) **Setup controls grey out while running** — Focus task, Set mood,
  and Settings dim mid-session (they only take effect between sessions); pause
  re-enables them. Lights-out + fullscreen stay live. (3) **Paused-only reset** — a
  circular ↺ appears beside Start only while paused; a confirm popover ("Reset
  session? task stays, nothing logged") guards it. Reuses `reset()` — zeroes the
  phase, keeps the task, no heatmap mark.
- **Entry focus-ring fix** — killed GTK4's purple full-box focus ring on the
  planner/task entries while keeping the underline (`:focus-within`, not `:focus`).
- **Study phase tracker + scroll-toggle countdown** — the GATE plan's 8 phases
  (M1..Buffer, dates from `~/.personal/study/gate/gate_plan.md`) live in
  `study_types.ts`. The study card's left column is now **phase-first**: the
  current phase id (hero) + topic + drift vs its planned *end* ("6 days behind" /
  "N days left" / "starts in N days"), colour-toned. A **Mark done** button (with
  a confirm popover naming the next phase) advances **manually** — calendar ≠
  reality, so it never auto-advances; progress persists in `study-progress.json`.
  **Scroll over the left column** (any direction, looping, capture-phase so the
  clipped digit doesn't slide) swaps to a **days-left countdown** that targets the
  **learning-phase end** (`LEARNING_END` = Sep 20 2026), separate from the exam
  date that still drives the heatmap runway. Left column pinned to a fixed width
  so switching views never resizes the heatmap.

## Open

**Flow-break AI — kept (reversed the earlier cut).** When the AI *planner* was
replaced by the deterministic mood→preset picker, the plan had been to also cut
the flow-break AI. Decision reversed: the flow-break AI (`proposeBreak` /
`breakNote` / `flowBreak`) stays as-is on top of the deterministic ÷5 — it is now
the pomodoro's only AI touch. Optional later: a "you're spent" rest state once
cumulative focus today crosses ~5h (from the log).

**Study dashboard — dates confirmed against `~/.personal/study/gate/gate_plan.md`.**
`EXAM_DATE = Feb 7 2027` is correct (CSE ~Feb 7, IIT Madras; TENTATIVE until the
official notification ~Aug 2026 — revisit then). `STUDY_START = Jul 1 2026` kept
deliberately: the plan's true M1 start is Jun 22, but the pomodoro log is empty
(zero sessions) and no study happened before July, so an earlier anchor just adds
blank cells. The heatmap fills from the first logged focus session onward.
Optional marker available: soft deadline ~Jan 17 2027 (3-week pre-exam buffer).

## Later (study / pomodoro)

- **Filter the study heatmap by task.** The heatmap is task-agnostic today — it
  sums *every* completed focus session regardless of the task text. Once the
  pomodoro is used for non-GATE things, those minutes inflate the study runway.
  The `task` field is already logged per session (`pomodoro-log.jsonl`), so this
  is a one-line filter in `study_source.ts` (keep only study-tagged tasks) when
  it becomes relevant.
- **Per-topic time breakdown.** Same log already stores `task` per focus block,
  so a "31h Engg-maths / 12h DSA this month" view is buildable with no new
  logging — just read the field the heatmap currently ignores.

## Later (sticky note)

- Markdown rendering via `Gtk.TextTag`
- Coloured bullets per category
- Run `solve()` / currency even when the AI call fails
- Refuse to apply a tidy that doesn't fit, instead of letting it scroll
- Skip the API call when the note is already tidy

## Bug (pomodoro) — reset button unreachable during a flow break

Found Aug 31 2026, live. During a flow-mode break the reset control never
appears, so a break can only be escaped by toggling the mode in settings.

Two causes, both in `widgets/pomodoro/pomodoro.tsx`:

1. **`paused` is countdown-shaped.** It reads
   `pausedRemaining > 0 && pausedRemaining < durations[phase] * 60`. A flow
   break's length is *earned* (`focusSeconds / FLOW_BREAK_DIVISOR`, clamped
   3–30 min), not a setting, so any focus stretch of ~25 min or more earns a
   break at or above `durations.short` (default 5 min) and the `< full` test is
   false. The button stays hidden even after pausing. Fix: in flow mode a
   stopped non-focus phase with time left *is* paused — there is no "full" to
   compare against.
2. **`resetSegment` resets a flow break to a countdown break.** It calls
   `reset()`, which sets `pausedRemaining` to `durations.short * 60`. In flow
   there is no short/long cycle; reset should land on a clean idle focus
   (`pausedRemaining: 0`), the same state `setMode()` produces.

Optional third: show reset while a flow break is *running*, so escaping it isn't
a Pause-then-reset two-step.

Workaround until fixed: settings → flip mode flow → countdown → flow.
