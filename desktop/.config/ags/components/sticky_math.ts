/*
 * solve(...) support.
 *
 * `solve(1828-350)` in the note becomes `1478`.
 *
 * Evaluated here rather than by the model on purpose: an LLM does arithmetic by
 * prediction, so it is confidently wrong often enough to matter - and a budget
 * that is quietly off by ten is worse than one that was never worked out. This
 * is exact, instant and free.
 *
 * There is no eval() anywhere below. The note is text the user typed, but it is
 * also text an AI rewrote, and handing either to a JS evaluator would let a
 * stray line run arbitrary code in the shell process. This parses a fixed
 * arithmetic grammar and can express nothing else.
 */

type Token = { kind: "num"; value: number } | { kind: "op"; value: string }

const OPERATORS = new Set(["+", "-", "*", "/", "(", ")"])

function tokenize(input: string): Token[] | null {
    const tokens: Token[] = []
    let i = 0

    while (i < input.length) {
        const ch = input[i]

        if (ch === " " || ch === "\t" || ch === ",") {
            i++
            continue
        }

        if (OPERATORS.has(ch)) {
            tokens.push({ kind: "op", value: ch })
            i++
            continue
        }

        if ((ch >= "0" && ch <= "9") || ch === ".") {
            let text = ""
            while (i < input.length && ((input[i] >= "0" && input[i] <= "9") || input[i] === ".")) {
                text += input[i]
                i++
            }
            const value = Number(text)
            if (!Number.isFinite(value)) return null
            tokens.push({ kind: "num", value })
            continue
        }

        /* Anything else - a letter, a symbol - means this is not arithmetic. */
        return null
    }

    return tokens.length > 0 ? tokens : null
}

/* Recursive descent: expr = term (('+' | '-') term)*, term = factor (('*' | '/') factor)*. */
function parse(tokens: Token[]): number | null {
    let pos = 0

    function peek(): Token | undefined {
        return tokens[pos]
    }

    function factor(): number | null {
        const token = peek()
        if (!token) return null

        if (token.kind === "op" && token.value === "-") {
            pos++
            const value = factor()
            return value === null ? null : -value
        }

        if (token.kind === "op" && token.value === "(") {
            pos++
            const value = expr()
            const close = peek()
            if (value === null || !close || close.kind !== "op" || close.value !== ")") return null
            pos++
            return value
        }

        if (token.kind === "num") {
            pos++
            return token.value
        }

        return null
    }

    function term(): number | null {
        let left = factor()
        if (left === null) return null

        for (;;) {
            const token = peek()
            if (!token || token.kind !== "op") break
            if (token.value !== "*" && token.value !== "/") break

            pos++
            const right = factor()
            if (right === null) return null
            if (token.value === "/" && right === 0) return null
            left = token.value === "*" ? left * right : left / right
        }

        return left
    }

    function expr(): number | null {
        let left = term()
        if (left === null) return null

        for (;;) {
            const token = peek()
            if (!token || token.kind !== "op") break
            if (token.value !== "+" && token.value !== "-") break

            pos++
            const right = term()
            if (right === null) return null
            left = token.value === "+" ? left + right : left - right
        }

        return left
    }

    const value = expr()
    /* Trailing junk means we did not understand the whole expression. */
    if (value === null || pos !== tokens.length) return null
    return Number.isFinite(value) ? value : null
}

export function evaluate(expression: string): number | null {
    const tokens = tokenize(expression)
    return tokens ? parse(tokens) : null
}

function format(value: number): string {
    /* Whole numbers stay whole; the rest round to 2dp with trailing zeros cut,
     * so 1828-350 is "1478" and 10/3 is "3.33". */
    if (Number.isInteger(value)) return String(value)
    return String(Number(value.toFixed(2)))
}

/*
 * Replaces every solve(...) with its value.
 *
 * An expression that does not parse is left exactly as written - a typo should
 * look like a typo, not silently vanish or turn into NaN.
 */
export function resolveSolve(text: string): string {
    return text.replace(/\bsolve\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi, (whole, body: string) => {
        const value = evaluate(body)
        return value === null ? whole : format(value)
    })
}
