/*
 * Currency words to symbols: "350 INR" and "Rs. 350" both become "₹350".
 *
 * Mechanical, so it is done here rather than asked of the model - the same
 * reasoning as solve(). A code beside a number is not a judgement call.
 *
 * What is deliberately NOT here: bare "pounds" (5 pounds of flour is weight),
 * "crowns", "won" ("won the match"). Those are genuinely ambiguous, so they are
 * left to the model, which can read the sentence. A wrong symbol is worse than
 * a spelled-out word - it silently changes what the note says.
 */

type Currency = {
    symbol: string
    /* Matched case-insensitively, whole-word, and only next to a number. */
    words: string[]
}

const CURRENCIES: Currency[] = [
    { symbol: "₹", words: ["inr", "rupees", "rupee", "rs"] },
    { symbol: "$", words: ["usd", "dollars", "dollar", "bucks"] },
    { symbol: "€", words: ["eur", "euros", "euro"] },
    /* "gbp" and "quid" only - never bare "pounds". */
    { symbol: "£", words: ["gbp", "quid"] },
    { symbol: "¥", words: ["jpy", "yen"] },
]

/* 1,828 / 350 / 12.50 - digits with optional thousands separators and decimals. */
const AMOUNT = String.raw`\d[\d,]*(?:\.\d+)?`

export function resolveCurrency(text: string): string {
    let out = text

    for (const { symbol, words } of CURRENCIES) {
        const alternation = words.join("|")

        /* A function replacement, never a string one: "$" is special to
         * String.replace, so the string form turned `${symbol}$1` into "$$1",
         * which replace reads as a literal "$" followed by a literal "1" - and
         * "50 dollars" silently became "$1". A function gets the capture as an
         * argument, with no escaping in between.
         *
         * `(?![a-z])` rather than `\b`: there is no word boundary between the
         * "s" and the "3" of "Rs350", but "rs" followed by a non-letter is
         * exactly what we mean, and it still rejects "rsx350". */

        /* "350 INR", "350INR", "1,828 rupees" -> symbol first, as most
         * currencies are written. */
        out = out.replace(
            new RegExp(String.raw`\b(${AMOUNT})\s*(?:${alternation})(?![a-z])\.?`, "gi"),
            (_whole, amount: string) => `${symbol}${amount}`,
        )

        /* "INR 350", "Rs. 350", "Rs350" */
        out = out.replace(
            new RegExp(String.raw`\b(?:${alternation})(?![a-z])\.?\s*(${AMOUNT})`, "gi"),
            (_whole, amount: string) => `${symbol}${amount}`,
        )
    }

    return out
}
