import GLib from "gi://GLib"
import { INFO_MARGIN_RIGHT_REM, toPx } from "./info_types"

/*
 * Design tokens for the sticky note, taken from the "Sticky Note Widget"
 * Claude Design project. That design exposes three knobs — surface, typeface
 * and accent — and the values below are its defaults.
 *
 * Surface and typeface resolve to CSS classes in widgets/sticky/style.scss
 * rather than inline styles, since GTK has no inline style attribute.
 */

export type StickySurface = "ink" | "paper" | "glass"
export type StickyTypeface = "mono" | "handwritten" | "sans"

export const STICKY_SURFACE: StickySurface = "glass"
export const STICKY_TYPEFACE: StickyTypeface = "mono"

/*
 * Geometry.
 *
 * The design asks for the note to dock under the info and battery widgets and
 * match "their combined width". It was drawn on a 1280x800 frame, where that
 * width happened to be 375px — so the literal 375 is not portable. These
 * constants rebuild that intent from the sibling widgets instead, which is what
 * actually keeps the three cards aligned on any display.
 *
 * The two widget windows are content-sized; the values below are measured from
 * `hyprctl layers` and need revisiting if the gauges are resized.
 */
const WIDGET_WINDOW_WIDTH_PX = 228
const WIDGET_WINDOW_HEIGHT_PX = 230

/* The 0.5rem margin on `box.card` in the info and battery stylesheets. */
const CARD_MARGIN_PX = 8

const INFO_MARGIN_RIGHT_PX = toPx(INFO_MARGIN_RIGHT_REM)

/* Info is pushed left of battery, so the two cards' facing margins plus the
 * offset between the windows is the gap the eye actually reads: 12px. */
export const STICKY_GAP_PX = INFO_MARGIN_RIGHT_PX - WIDGET_WINDOW_WIDTH_PX + CARD_MARGIN_PX * 2

/* Left edge of the info card through to the right edge of the battery card. */
export const STICKY_WIDTH_PX = INFO_MARGIN_RIGHT_PX + WIDGET_WINDOW_WIDTH_PX - CARD_MARGIN_PX * 2

/* Sit the note the same gap below the widget row that separates the two cards. */
export const STICKY_TOP_PX = WIDGET_WINDOW_HEIGHT_PX - CARD_MARGIN_PX + STICKY_GAP_PX

/* Right and bottom gaps match the card margin, so the note's right edge lines
 * up with the battery card and its bottom mirrors the row's outer spacing. */
export const STICKY_GAP_RIGHT_PX = CARD_MARGIN_PX
export const STICKY_GAP_BOTTOM_PX = CARD_MARGIN_PX

/* A drop shadow can only paint inside its layer-shell window, so the window is
 * grown on the shadowed sides and the note is inset by the same amount. */
export const STICKY_SHADOW_ROOM_PX = 40
export const STICKY_WINDOW_MARGIN_TOP_PX = STICKY_TOP_PX - STICKY_SHADOW_ROOM_PX

/* The original single note. Kept only so its content can be migrated into
 * page 1 the first time the paginated notes run. */
export const SCRATCH_PATH = `${GLib.get_user_data_dir()}/ags/scratch.md`

/* Pagination: the note is several file-backed pages, notes/1.md .. notes/N.md.
 * Fixed count keeps it simple - no add/delete UI. The header shows "N.md". */
export const NOTES_DIR = `${GLib.get_user_data_dir()}/ags/notes`
export const PAGE_COUNT = 3

/* 0-indexed page -> its file (1-indexed on disk, matching the header label). */
export function notePath(page: number): string {
    return `${NOTES_DIR}/${page + 1}.md`
}

/* Shown on first run, before the file exists. Matches the design's mock copy. */
export const SCRATCH_SEED = [
    "# tonight",
    "- ship the widget",
    "- watch the rain 🌧",
    "",
    "idea: fade the note in when",
    "the cursor gets close",
].join("\n")

/* The body's inner padding. Applied as TextView margins rather than CSS
 * padding, so the fit measurement can subtract the exact value it renders. */
export const STICKY_BODY_MARGIN_PX = 18

/* Bullet glyph. Measures 17px in JetBrainsMono - exactly two mono cells, the
 * same as "- " - so the hanging indent below lines up on the cell grid. */
export const STICKY_BULLET = "•"

/* Width of "* " in px. The TextView pulls its first line back by this much so
 * wrapped text hangs under the bullet's text rather than under the bullet. */
export const STICKY_HANGING_INDENT_PX = 17

/* Mirrors `line-height` on textview.body in style.scss; the Pango metrics used
 * to size the fit budget do not know about the stylesheet. Keep the two equal. */
export const STICKY_LINE_HEIGHT = 1.5

/* nf-md-creation from the Nerd Font, the conventional "sparkles" AI mark.
 * Written as an escape so the source stays ASCII and the codepoint is legible. */
export const AI_GLYPH = "\u{F0674}"

/* Debounce between the last keystroke and the write to disk. */
export const SCRATCH_SAVE_DEBOUNCE_MS = 600

/* How often the "edited ..." label recomputes. */
export const SCRATCH_EDITED_POLL_MS = 30_000

export function formatEdited(secondsAgo: number): string {
    if (secondsAgo < 45) return "edited just now"

    const minutes = Math.round(secondsAgo / 60)
    if (minutes < 60) return `edited ${minutes}m ago`

    const hours = Math.round(minutes / 60)
    if (hours < 24) return `edited ${hours}h ago`

    return `edited ${Math.round(hours / 24)}d ago`
}
