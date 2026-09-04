import Pango from "gi://Pango"
import { Gtk } from "ags/gtk4"
import { STICKY_LINE_HEIGHT } from "../types/sticky_types"

/*
 * How much text actually fits in the note.
 *
 * Measured off the live TextView rather than computed from constants, so it
 * stays right if the note is resized or the typeface changes. Character width
 * is only ever a hint for the prompt - the TextView wraps, so the real limit is
 * the number of lines the text renders to, which Pango can tell us exactly.
 */

export type FitBudget = {
    /* Text width in px, excluding the TextView's margins. */
    width: number
    maxLines: number
    /* Approximate columns; a prompt hint only, never a hard check. */
    cols: number
}

export function measureBudget(view: Gtk.TextView): FitBudget {
    const width = Math.max(1, view.get_width() - view.left_margin - view.right_margin)
    const height = Math.max(1, view.get_height() - view.top_margin - view.bottom_margin)

    const context = view.get_pango_context()
    const font = context.get_font_description()
    const metrics = context.get_metrics(font, null)

    const natural = (metrics.get_ascent() + metrics.get_descent()) / Pango.SCALE
    const charWidth = metrics.get_approximate_char_width() / Pango.SCALE

    /* The stylesheet's line-height multiplies the font's natural line box; the
     * Pango metrics above do not know about it. */
    const lineHeight = Math.max(1, natural * STICKY_LINE_HEIGHT)

    return {
        width,
        maxLines: Math.max(1, Math.floor(height / lineHeight)),
        cols: Math.max(8, Math.floor(width / Math.max(1, charWidth))),
    }
}

/* Exact rendered line count, wrapping included - a 113-character single line
 * correctly counts as 3, which a character count would get wrong.
 *
 * Mirrors the view's own indent: with a hanging indent the wrapped lines are
 * narrower than the first, so a layout without it would count too few. */
export function renderedLines(view: Gtk.TextView, text: string, width: number): number {
    const layout = Pango.Layout.new(view.get_pango_context())
    layout.set_width(width * Pango.SCALE)
    layout.set_wrap(Pango.WrapMode.WORD_CHAR)
    layout.set_indent(view.indent * Pango.SCALE)
    layout.set_text(text, -1)
    return layout.get_line_count()
}
