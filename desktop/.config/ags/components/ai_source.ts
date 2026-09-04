import fetch from "ags/fetch"
import { execAsync } from "ags/process"
import {
    AI_MAX_ATTEMPTS,
    AI_MAX_OUTPUT_TOKENS,
    FLOW_BREAK_REASON_MAX_CHARS,
    flowBreakSystemPrompt,
    flowBreakUserPrompt,
    overBudgetPrompt,
    PLAN_REASON_MAX_CHARS,
    planSystemPrompt,
    planUserPrompt,
    Provider,
    TIDY_EXAMPLES,
    tidySystemPrompt,
} from "../types/ai_types"
import { STICKY_BULLET } from "../types/sticky_types"

type Message = { role: "system" | "user" | "assistant"; content: string }

export class AiError extends Error {}

/* The key lives in the keyring, never in this repo. */
export async function readApiKey(provider: Provider): Promise<string | null> {
    if (!provider.secret) return null

    try {
        const out = await execAsync([
            "secret-tool", "lookup",
            "service", provider.secret.service,
            "account", provider.secret.account,
        ])
        const key = out.trim()
        return key.length > 0 ? key : null
    } catch {
        return null
    }
}

export function missingKeyHint(provider: Provider): string {
    const s = provider.secret
    return s
        ? `no ${provider.id} key - run: secret-tool store --label="${provider.id} key" service ${s.service} account ${s.account}`
        : `no key configured for ${provider.id}`
}

/* Models like to wrap output in ``` even when told not to. */
function stripFences(text: string): string {
    const trimmed = text.trim()
    if (!trimmed.startsWith("```")) return trimmed

    return trimmed
        .replace(/^```[^\n]*\n?/, "")
        .replace(/\n?```$/, "")
        .trim()
}

/*
 * Blank lines are the single biggest source of overflow: the model compresses
 * the words well, then spaces the result out and spends a third of the budget
 * on nothing. Dropping them is lossless, so it is done here rather than asked
 * for - a prompt can be ignored, this cannot.
 */
export function normalizeNote(text: string): string {
    return stripFences(text)
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0)
        /* Normalise whatever bullet it reached for into the one the note
         * renders with. Done here rather than asked for, so the note stays
         * consistent even when the model ignores the prompt. */
        .map((line) => line.replace(/^\s*[-*+]\s+/, `${STICKY_BULLET} `))
        .join("\n")
}

/* The bare model reply, trimmed. Callers that want note formatting run it
 * through normalizeNote (see chat); callers that want JSON must not. */
async function rawChat(provider: Provider, key: string | null, messages: Message[]): Promise<string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (key) headers["Authorization"] = `Bearer ${key}`

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model: provider.model,
            messages,
            [provider.tokenParam]: AI_MAX_OUTPUT_TOKENS,
            ...provider.extraParams,
        }),
    })

    const raw = await response.text()

    if (response.status !== 200) {
        let detail = raw.slice(0, 160)
        try {
            detail = JSON.parse(raw)?.error?.message ?? detail
        } catch {
            /* Not JSON; the raw slice is the best we have. */
        }
        throw new AiError(`http ${response.status}: ${detail}`)
    }

    let payload: any
    try {
        payload = JSON.parse(raw)
    } catch {
        throw new AiError("response was not JSON")
    }

    const content = payload?.choices?.[0]?.message?.content
    if (typeof content !== "string" || content.trim().length === 0) {
        /* A reasoning model that spent the whole token budget thinking lands
         * here with a finish_reason of "length". */
        const reason = payload?.choices?.[0]?.finish_reason
        throw new AiError(reason === "length" ? "ran out of output tokens" : "empty response")
    }

    return content.trim()
}

async function chat(provider: Provider, key: string | null, messages: Message[]): Promise<string> {
    return normalizeNote(await rawChat(provider, key, messages))
}

export type FlowBreakResult = { minutes: number; reason: string }

/* Pull the first {...} out of a reply that may carry stray prose around it. */
function firstJsonObject(text: string): string {
    const s = stripFences(text)
    const start = s.indexOf("{")
    const end = s.lastIndexOf("}")
    if (start === -1 || end === -1 || end < start) throw new AiError("no JSON object in reply")
    return s.slice(start, end + 1)
}

/*
 * Choose the flow-mode break. Returns a clamped whole-minute length and a short
 * reason. Throws on any failure (no key, network, bad JSON) so the caller can
 * fall back to the deterministic divisor - the AI never blocks the break.
 */
export async function flowBreak(opts: {
    provider: Provider
    key: string | null
    focusMinutes: number
    task: string
    clockLabel: string
    sessionsToday: number
    minMinutes: number
    maxMinutes: number
}): Promise<FlowBreakResult> {
    const messages: Message[] = [
        { role: "system", content: flowBreakSystemPrompt(opts.minMinutes, opts.maxMinutes) },
        { role: "user", content: flowBreakUserPrompt(opts) },
    ]

    const raw = await rawChat(opts.provider, opts.key, messages)

    let parsed: any
    try {
        parsed = JSON.parse(firstJsonObject(raw))
    } catch {
        throw new AiError("break reply was not JSON")
    }

    const n = Math.round(Number(parsed?.minutes))
    if (!Number.isFinite(n)) throw new AiError("break reply had no minutes")

    const minutes = Math.max(opts.minMinutes, Math.min(opts.maxMinutes, n))
    const reason = String(parsed?.reason ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, FLOW_BREAK_REASON_MAX_CHARS)

    return { minutes, reason }
}

export type SessionPlan = { focus: number; short: number; long: number; reason: string }

/*
 * Plan a study block from a budget + mood. Returns clamped focus/short/long
 * durations and a one-line reason. Throws on any failure - the caller only ever
 * invokes it when online with a key (the button is greyed otherwise), so there
 * is no fallback to fold in.
 */
export async function planSession(opts: {
    provider: Provider
    key: string | null
    until: string
    mood: string
    note: string
    clockLabel: string
    focusedTodayMinutes: number
    minMinutes: number
    maxMinutes: number
}): Promise<SessionPlan> {
    const messages: Message[] = [
        { role: "system", content: planSystemPrompt(opts.minMinutes, opts.maxMinutes) },
        { role: "user", content: planUserPrompt(opts) },
    ]

    const raw = await rawChat(opts.provider, opts.key, messages)

    let parsed: any
    try {
        parsed = JSON.parse(firstJsonObject(raw))
    } catch {
        throw new AiError("plan reply was not JSON")
    }

    const clamp = (v: unknown) => {
        const n = Math.round(Number(v))
        if (!Number.isFinite(n)) throw new AiError("plan reply had a bad duration")
        return Math.max(opts.minMinutes, Math.min(opts.maxMinutes, n))
    }

    const focus = clamp(parsed?.focus)
    const short = Math.min(focus, clamp(parsed?.short))
    /* A long break sits between the short break and the focus block - guard
     * against the model handing back a long break as big as the whole session. */
    const long = Math.max(short, Math.min(focus, clamp(parsed?.long)))
    const reason = String(parsed?.reason ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, PLAN_REASON_MAX_CHARS)

    return { focus, short, long, reason }
}

export type TidyResult = {
    text: string
    lines: number
    attempts: number
    overBudget: boolean
}

/*
 * Ask, measure, retry once with the real overage, then take the best we got.
 *
 * Verification is local and deterministic, so a sloppy model cannot surprise
 * us: we always know the true rendered height before committing to the buffer.
 * If it still overruns we keep the shortest candidate rather than truncating -
 * the note scrolls, so overflow degrades instead of losing a sentence.
 */
export async function tidyNote(opts: {
    provider: Provider
    key: string | null
    note: string
    /* The real budget. The reply is always checked against this. */
    maxLines: number
    /* What we ask the model for - lower than maxLines, to absorb its overshoot. */
    askLines: number
    cols: number
    measure: (text: string) => number
}): Promise<TidyResult> {
    const { provider, key, note, maxLines, askLines, cols, measure } = opts

    const messages: Message[] = [
        { role: "system", content: tidySystemPrompt(askLines, cols) },
        /* Few-shot as real turns: shows the density and the grouping, which
         * describing them does not. */
        ...TIDY_EXAMPLES.flatMap((example): Message[] => [
            { role: "user", content: example.input },
            { role: "assistant", content: example.output },
        ]),
        { role: "user", content: note },
    ]

    let best: { text: string; lines: number } | null = null

    for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
        const text = await chat(provider, key, messages)
        const lines = measure(text)

        if (!best || lines < best.lines) best = { text, lines }

        if (lines <= maxLines) {
            return { text, lines, attempts: attempt, overBudget: false }
        }

        /* Keep aiming at askLines on the retry too - it overshoots that as
         * readily as it overshot the first target. */
        messages.push({ role: "assistant", content: text })
        messages.push({ role: "user", content: overBudgetPrompt(lines, askLines) })
    }

    return { ...best!, attempts: AI_MAX_ATTEMPTS, overBudget: true }
}
