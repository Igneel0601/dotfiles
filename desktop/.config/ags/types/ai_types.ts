import { STICKY_BULLET } from "./sticky_types"

/*
 * AI provider configuration.
 *
 * OpenAI, Groq, Ollama and Gemini all expose an OpenAI-shaped
 * POST {baseUrl}/chat/completions taking the same body, so switching provider
 * is a matter of changing ACTIVE_PROVIDER - there is no per-provider client.
 */

export type ProviderId = "openai" | "groq" | "ollama" | "gemini"

export type Provider = {
    id: ProviderId
    baseUrl: string
    model: string
    /* Newer OpenAI models reject `max_tokens` and require
     * `max_completion_tokens`; the other OpenAI-compatible servers still take
     * `max_tokens`. The docs disagree on whether gpt-5-nano counts as a
     * reasoning model, so we send the newer name and no `temperature` at all -
     * that request is valid either way. */
    tokenParam: "max_tokens" | "max_completion_tokens"
    /* Provider-specific body fields. Kept per-provider because they are not
     * portable - Ollama and Groq reject OpenAI's GPT-5 knobs. */
    extraParams?: Record<string, unknown>
    /* Where the key lives in the keyring; absent for local servers.
     * Store one with:
     *   secret-tool store --label="OpenAI API key" service openai account default */
    secret?: { service: string; account: string }
}

export const PROVIDERS: Record<ProviderId, Provider> = {
    openai: {
        id: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5-nano",
        tokenParam: "max_completion_tokens",
        extraParams: {
            /* "minimal" is the documented setting for formatting and short
             * rewrites - it emits few or no reasoning tokens, which keeps both
             * latency and the token budget down. */
            reasoning_effort: "minimal",
            /* Nudges the prose short before the line budget has to. */
            verbosity: "low",
            /* No `temperature`: gpt-5-nano rejects any value but the default
             * with a hard 400 ("Unsupported value: 'temperature' does not
             * support 0.2 with this model"), so setting it breaks the request
             * rather than making output more consistent. Verified live. */
        },
        secret: { service: "openai", account: "default" },
    },
    /* The models below are untested placeholders - set one you actually have. */
    groq: {
        id: "groq",
        baseUrl: "https://api.groq.com/openai/v1",
        model: "llama-3.3-70b-versatile",
        tokenParam: "max_tokens",
        secret: { service: "groq", account: "default" },
    },
    ollama: {
        id: "ollama",
        baseUrl: "http://localhost:11434/v1",
        model: "llama3.2",
        tokenParam: "max_tokens",
    },
    gemini: {
        id: "gemini",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        model: "gemini-2.0-flash",
        tokenParam: "max_tokens",
        secret: { service: "gemini", account: "default" },
    },
}

export const ACTIVE_PROVIDER: ProviderId = "openai"

/* Generous on purpose: on a reasoning model the thinking tokens come out of
 * this same budget, and a note that tidies to 15 lines is nowhere near it. Too
 * small a budget gets spent reasoning and returns empty content. */
export const AI_MAX_OUTPUT_TOKENS = 4000

/* One initial attempt plus one retry with the measured overage fed back. */
export const AI_MAX_ATTEMPTS = 2

/*
 * We ask for this fraction of the real line budget.
 *
 * The model counts the lines it writes; the note counts the lines it renders,
 * after wrapping. A 130-character bullet is one line to the model and three on
 * screen, so it overshoots however clearly it is asked. Aiming it low means the
 * overshoot lands inside the real limit. The reply is still checked against the
 * true budget - this only moves the target, it does not relax the check.
 */
export const AI_BUDGET_HEADROOM = 0.7

/* How long a status message sits in the header before reverting to "edited". */
export const AI_STATUS_LINGER_MS = 5000

export function tidySystemPrompt(maxLines: number, cols: number): string {
    return [
        "You tidy a desktop sticky note.",
        /* "at most N lines" got read as a quota: on a note that compressed to
         * seven items it invented four more to reach the target. The ceiling
         * has to be stated as a limit AND as something to come in under. */
        `The note must render in ${maxLines} lines or fewer, at roughly ${cols} characters per line.`,
        "Shorter is better. That number is a hard ceiling, never a target - do not pad to reach it.",
        "The output has exactly as many bullets as the note has real items. No more.",
        "Keep every fact, task, date and link. Cut filler, never information.",
        `One '${STICKY_BULLET}' bullet per item, one line each. No blank lines between items.`,
        /* The note is one screen the user is already looking at - a heading
         * spends a line restating what they can see. */
        "No headings and no title. Bullets only.",
        /* It turned a note's rambling opening line into a task once. Rewriting
         * means reshaping what is there, not adding to it. */
        "Never invent items. If a line is filler, drop it - do not turn it into a task.",
        /* It shortened "Laplace transforms" to "LAP transforms", which destroys
         * the fact it was meant to keep. */
        "Never abbreviate names or technical terms: 'Laplace transforms' stays 'Laplace transforms'.",
        /* solve() is resolved before this call, so any sum left in the note is
         * one the user wants left alone. A model doing mental arithmetic is a
         * confident wrong number waiting to happen. */
        "Never do arithmetic. Copy every number exactly as written.",
        /* The unambiguous codes are already symbols by now; this is for the
         * ones only a reader can settle - "20 pounds" is money in one sentence
         * and flour in the next. */
        "Where an amount is clearly money, write it as a symbol before the number: 20 pounds -> £20.",
        "If the word is not money - pounds of flour, won the match - leave it exactly as it is.",
        /* Preserve the writer's own uncertainty rather than resolving it. */
        "Keep uncertainty as uncertainty: '21st or 22nd?' stays a question.",
        /* Related items next to each other is the grouping we want now that
         * there are no headings to group under. */
        "Keep related items adjacent, in the note's own order where possible.",
        "Plain text only. No preamble, no commentary, no code fences.",
        "Reply with the note itself.",
    ].join(" ")
}

/*
 * Worked examples beat describing the format. The model compresses the words
 * well but spaces the result out - a blank line between every item - which
 * costs a third of the budget. These show the density we want. (Blank lines are
 * also stripped deterministically; the examples stop them being generated.)
 *
 * There are two on purpose:
 *
 * 1. A short note, to teach the shape.
 * 2. A long, multi-topic one, to teach what to do when it will not fit -
 *    merge related lines, drop filler outright, keep subjects adjacent. The
 *    short example alone never demonstrates dropping anything, because
 *    nothing needs to be dropped.
 *
 * Both are also well under the line budget, which reinforces that the budget
 * is a ceiling and not a quota to fill.
 */

export type Exchange = { input: string; output: string }

export const TIDY_EXAMPLES: Exchange[] = [
    {
        input: [
            "call with sam about the api thing on tuesday, he said the rate limit is",
            "100/min so we need to batch. also the domain renewal, expires next month",
            "sometime, i think the 12th? should check. and buy milk",
        ].join("\n"),
        output: [
            "• API: rate limit 100/min, batch calls (Sam, Tue)",
            "• Renew domain - expires 12th next month? check",
            "• Buy milk",
        ].join("\n"),
    },
    {
        /* Deliberately over-long and rambling: two subjects, repetition, and an
         * opening line that is pure filler and must not become a task. */
        input: [
            "right so im writing this down because i keep forgetting things lately",
            "flat viewing on saturday at 11, the one on hill road, need to ask about",
            "parking and whether bills are included. agent is priya, she said bring id.",
            "there was another one on tuesday but i think i missed that already",
            "also work stuff - the migration is blocked until infra sign off, chased",
            "them twice now, no reply. standup moved to 9.30 from monday onwards.",
            "and i should really book the dentist, its been like a year honestly",
        ].join("\n"),
        output: [
            "• Flat viewing Sat 11:00, Hill Road - bring ID (Priya)",
            "• Ask: parking, bills included?",
            "• Tue viewing: missed",
            "• Migration blocked on infra sign-off - chased 2x, no reply",
            "• Standup moves to 9:30 from Monday",
            "• Book dentist",
        ].join("\n"),
    },
]

/*
 * Motivation quote for the pomodoro.
 *
 * Hard-capped because the design gives it a 3-line column: a rambling line
 * would break the layout, and unlike the note there is no room to scroll.
 */
export const QUOTE_MAX_CHARS = 110

export function quotePrompt(task: string): string {
    return [
        "Write ONE short line of encouragement for someone about to focus on this task:",
        `"${task}".`,
        "Under 14 words. No quotation marks, no emoji, no preamble, no name.",
        "Reply with the line only.",
    ].join(" ")
}

/*
 * Used when there is no key, no network, or the call fails. The quote is
 * decoration - it must never stop the timer starting, so there is always a line.
 */
const QUOTE_FALLBACKS = [
    "Small steady steps beat one perfect burst.",
    "Start badly if you must, but start.",
    "The work is the only thing that argues back.",
    "Twenty-five minutes is a promise you can keep.",
    "You do not have to finish. You have to begin.",
]

/* Indexed rather than random: GJS has Math.random, but a stable line per task
 * means restarting AGS mid-session does not reshuffle the quote. */
export function fallbackQuote(task: string): string {
    let hash = 0
    for (let i = 0; i < task.length; i++) hash = (hash * 31 + task.charCodeAt(i)) | 0
    return QUOTE_FALLBACKS[Math.abs(hash) % QUOTE_FALLBACKS.length]!
}

/* --- flow-mode break ---------------------------------------------------
 *
 * After a count-up focus session the break length is chosen by the model from
 * real signals - how long you focused, on what, the time of day, and how many
 * sessions you have already done today. A divisor only sees this one session;
 * the point of the call is fatigue awareness across the whole day. The reply is
 * strict JSON so the widget can act on a number, and it is always clamped and
 * always has a deterministic fallback, so a bad reply never breaks the timer.
 */
export const FLOW_BREAK_REASON_MAX_CHARS = 60

export function flowBreakSystemPrompt(minMinutes: number, maxMinutes: number): string {
    return [
        "You set the rest break after a focus session, Flowtime-style.",
        "You are given how many minutes the person focused, the task, the local time, and how many focus sessions they have already finished today.",
        `Choose a break as a whole number of minutes, between ${minMinutes} and ${maxMinutes}.`,
        /* Concrete anchors: without them gpt-5-nano at minimal effort reads
         * "genuinely draining" too conservatively and hands a 6-hour session a
         * mid-range break. The numbers give it something to interpolate. */
        `Rough guide: about 5 minutes after a 25-minute session, 12 to 18 after 90 minutes, and at or near ${maxMinutes} after three hours or more. Rest has diminishing returns, so never scale straight up.`,
        "Weight the clock and the count too: late at night, or a fourth-or-later session, pushes the break higher and the tone toward stopping.",
        `If the session ran a couple of hours or more, or it is past midnight, give a break near ${maxMinutes} and make the reason say to stop for the day - eat, walk, sleep - rather than push on.`,
        'Reply with ONLY compact JSON, no code fences: {"minutes": <int>, "reason": "<short phrase>"}.',
        "The reason is at most 8 words, plain and human, e.g. \"6h in, past midnight - sleep, don't push\".",
    ].join(" ")
}

export function flowBreakUserPrompt(opts: {
    focusMinutes: number
    task: string
    clockLabel: string
    sessionsToday: number
}): string {
    const task = opts.task.trim().length > 0 ? opts.task.trim() : "(no task named)"
    return [
        `Focused ${opts.focusMinutes} minutes on "${task}".`,
        `Local time ${opts.clockLabel}.`,
        `Focus sessions completed today: ${opts.sessionsToday}.`,
    ].join(" ")
}

/* --- pomodoro session planner ------------------------------------------
 *
 * The one opt-in AI touch in the pomodoro: given a time budget, the person's
 * mood, the time of day, and how much they've already focused today, it plans
 * the focus / short / long lengths and says why in a line. This is where AI
 * earns its place - a real plan from fuzzy input, invoked deliberately, with a
 * 1-2s wait that is fine because it is one-time setup, not mid-session. No
 * offline fallback: the button is greyed when there is no network or key.
 */
export const PLAN_REASON_MAX_CHARS = 80

export function planSystemPrompt(minMinutes: number, maxMinutes: number): string {
    return [
        "You plan a study block as pomodoro intervals.",
        "You are given the current local time, the time the person wants to study until, their mood, and how many minutes they have already focused today.",
        "Work out how many minutes are available between now and the end time (interpret loose times like \"6\" or \"6pm\" sensibly, choosing the nearest future time), and size the plan to fill that and finish around then.",
        `Choose focus / short-break / long-break lengths in whole minutes, each between ${minMinutes} and ${maxMinutes}. Focus is the longest; the short break the shortest (about 3-10 minutes).`,
        "The long break is a bigger rest taken every few rounds: longer than the short break but well under the focus length - usually 15 to 25 minutes, never longer than the focus block.",
        "Tired or anxious -> shorter focus and more frequent breaks; fresh or wired -> longer focus blocks; a lot of focus already today -> ease off.",
        "If no end time is given, plan a single sensible round or two for the mood.",
        'Reply with ONLY compact JSON, no code fences: {"focus": <int>, "short": <int>, "long": <int>, "reason": "<short phrase>"}.',
        "The reason is at most 12 words, plain and human, naming the rounds, e.g. \"till 6pm, ~2h40 - five 30/6 rounds\".",
    ].join(" ")
}

export function planUserPrompt(opts: {
    until: string
    mood: string
    note: string
    clockLabel: string
    focusedTodayMinutes: number
}): string {
    const parts = [
        `Local time now: ${opts.clockLabel}.`,
        `Study until: ${opts.until.trim().length > 0 ? opts.until.trim() : "not given"}.`,
        `Mood: ${opts.mood.trim().length > 0 ? opts.mood.trim() : "unspecified"}.`,
        `Focused today: ${opts.focusedTodayMinutes} minutes.`,
    ]
    if (opts.note.trim().length > 0) parts.push(`Note: ${opts.note.trim()}.`)
    return parts.join(" ")
}

/* Concrete numbers rather than "be shorter" - the model can act on these. */
export function overBudgetPrompt(rendered: number, maxLines: number): string {
    return [
        `That rendered to ${rendered} lines, but the limit is ${maxLines}.`,
        "Compress it further, keeping every fact. Reply with the note only.",
    ].join(" ")
}
