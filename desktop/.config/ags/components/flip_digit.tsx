import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import { timeout } from "ags/time"
import {
    DIGIT_H_PX,
    DIGIT_HALF_PX,
    DIGIT_W_PX,
    FLIP_MS,
} from "../types/pomodoro_types"

/*
 * One flip-clock digit card.
 *
 * Structure, bottom to top:
 *
 *   staticTop     the NEW digit's top half     - revealed as the leaf falls away
 *   staticBottom  the OLD digit's bottom half  - covered as the leaf lands
 *   leafTop       the OLD top, rotating 0 -> -90 about the seam
 *   leafBottom    the NEW bottom, rotating 90 -> 0 about the seam
 *   seam
 *
 * At rest the two leaves are hidden and the statics show the current digit.
 *
 * Two things make this work in GTK. Clipping: there is no CSS `overflow`, but
 * `Gtk.Widget` has an `overflow` property and `Gtk.Fixed` will place a child
 * outside its own bounds - so each half is a full 214px glyph shown through a
 * 107px window. Perspective: GTK has no `perspective` property, but
 * `transform: perspective(...) rotateX(...)` works as a function, so it lives
 * in the keyframes instead of on the parent.
 */

type Half = { widget: Gtk.Widget; glyph: Gtk.Label }

/*
 * One half-card: a window exactly DIGIT_HALF_PX tall onto a full-height glyph.
 *
 * The clipper is a ScrolledWindow, which looks odd until you try the
 * alternatives. A plain Gtk.Box will not do it: set_size_request() sets only a
 * MINIMUM, so a box holding the 214px glyph measures 214 and clips nothing -
 * both halves then draw the whole digit over each other, which is what made the
 * first attempt look mangled rather than flipped. Overriding vfunc_measure on a
 * Box subclass does not help either; GJS never calls it. A ScrolledWindow with
 * propagate-natural off honours the requested 107 exactly and clips for free.
 */
function makeHalf(char: string, which: "top" | "bottom", leaf: boolean): Half {
    const widget = new Gtk.ScrolledWindow()
    widget.add_css_class("half")
    widget.add_css_class(which)
    if (leaf) widget.add_css_class("leaf")

    /* EXTERNAL keeps the scrollbars out of the layout entirely. */
    widget.set_policy(Gtk.PolicyType.EXTERNAL, Gtk.PolicyType.EXTERNAL)
    widget.set_propagate_natural_height(false)
    widget.set_propagate_natural_width(false)
    widget.set_size_request(DIGIT_W_PX, DIGIT_HALF_PX)
    widget.set_overflow(Gtk.Overflow.HIDDEN)

    const glyph = new Gtk.Label({ label: char })
    glyph.add_css_class("glyph")
    glyph.set_size_request(DIGIT_W_PX, DIGIT_H_PX)

    /* The bottom half shows the same glyph pulled up by exactly one half, so
     * the two line up into one continuous digit across the seam. */
    const fixed = new Gtk.Fixed()
    fixed.put(glyph, 0, which === "top" ? 0 : -DIGIT_HALF_PX)
    widget.set_child(fixed)

    return { widget, glyph }
}

export default function FlipDigit({ digit }: { digit: Accessor<string> }) {
    const card = new Gtk.Fixed()
    card.add_css_class("digit")
    card.set_size_request(DIGIT_W_PX, DIGIT_H_PX)

    let current = digit.get()

    const staticTop = makeHalf(current, "top", false)
    const staticBottom = makeHalf(current, "bottom", false)
    const leafTop = makeHalf(current, "top", true)
    const leafBottom = makeHalf(current, "bottom", true)

    /* Insertion order is z-order in Gtk.Fixed: leaves above statics, seam on top. */
    card.put(staticTop.widget, 0, 0)
    card.put(staticBottom.widget, 0, DIGIT_HALF_PX)
    card.put(leafTop.widget, 0, 0)
    card.put(leafBottom.widget, 0, DIGIT_HALF_PX)

    const seam = new Gtk.Box()
    seam.add_css_class("seam")
    seam.set_size_request(DIGIT_W_PX, 2)
    card.put(seam, 0, DIGIT_HALF_PX - 1)

    leafTop.widget.set_visible(false)
    leafBottom.widget.set_visible(false)

    let settle: ReturnType<typeof timeout> | null = null

    const unsubscribe = digit.subscribe(() => {
        const next = digit.get()
        if (next === current) return

        const previous = current
        current = next

        /* Behind the falling leaf: the new top is already there, and the old
         * bottom is still showing until the incoming leaf covers it. */
        staticTop.glyph.set_label(next)
        staticBottom.glyph.set_label(previous)
        leafTop.glyph.set_label(previous)
        leafBottom.glyph.set_label(next)

        leafTop.widget.set_visible(true)
        leafBottom.widget.set_visible(true)

        /* A CSS animation only restarts when the class is re-applied, so it has
         * to come off and go back on rather than just being set again. */
        leafTop.widget.remove_css_class("flipping")
        leafBottom.widget.remove_css_class("flipping")
        leafTop.widget.add_css_class("flipping")
        leafBottom.widget.add_css_class("flipping")

        settle?.cancel()
        settle = timeout(FLIP_MS, () => {
            settle = null
            /* The leaf has landed - hand off to the statics and hide it. */
            staticBottom.glyph.set_label(current)
            leafTop.widget.set_visible(false)
            leafBottom.widget.set_visible(false)
            leafTop.widget.remove_css_class("flipping")
            leafBottom.widget.remove_css_class("flipping")
        })
    })

    card.connect("destroy", () => {
        settle?.cancel()
        unsubscribe()
    })

    return card
}
