import app from "ags/gtk4/app"
import { createComputed, createState } from "ags"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createPoll, timeout, Timer } from "ags/time"
import { AiError, missingKeyHint, readApiKey, tidyNote } from "../../components/ai_source"
import { measureBudget, renderedLines } from "../../components/sticky_fit"
import { resolveSolve } from "../../components/sticky_math"
import { resolveCurrency } from "../../components/sticky_money"
import {
    backupNote,
    initNotes,
    loadNote,
    markEdited,
    saveNote,
    secondsSinceEdit,
} from "../../components/sticky_source"
import {
    ACTIVE_PROVIDER,
    AI_BUDGET_HEADROOM,
    AI_STATUS_LINGER_MS,
    PROVIDERS,
} from "../../types/ai_types"
import {
    AI_GLYPH,
    formatEdited,
    PAGE_COUNT,
    SCRATCH_EDITED_POLL_MS,
    SCRATCH_SAVE_DEBOUNCE_MS,
    STICKY_BODY_MARGIN_PX,
    STICKY_GAP_BOTTOM_PX,
    STICKY_HANGING_INDENT_PX,
    STICKY_GAP_RIGHT_PX,
    STICKY_SHADOW_ROOM_PX,
    STICKY_SURFACE,
    STICKY_TYPEFACE,
    STICKY_WIDTH_PX,
    STICKY_WINDOW_MARGIN_TOP_PX,
} from "../../types/sticky_types"

export default function Sticky(gdkmonitor: Gdk.Monitor) {
    const { TOP, RIGHT, BOTTOM } = Astal.WindowAnchor

    initNotes()

    /* Which page is showing. Each page is its own file-backed note. */
    const [page, setPage] = createState(0)

    /* A transient AI message takes over the timestamp slot while it is set,
     * so errors never get written into the note itself. */
    const [status, setStatus] = createState<string | null>(null)
    const [busy, setBusy] = createState(false)

    /* The "edited ..." label, per page. The tick forces a periodic recompute;
     * switching pages recomputes it immediately (page() is a dependency). */
    const editedTick = createPoll(0, SCRATCH_EDITED_POLL_MS, (n) => n + 1)
    const meta = createComputed(() => {
        editedTick()
        return status() ?? formatEdited(secondsSinceEdit(page()))
    })
    const fileLabel = page((p) => `${p + 1}.md`)

    let view: Gtk.TextView | null = null
    let saveTimer: Timer | null = null
    let statusTimer: Timer | null = null
    /* Suppresses the change handler while a page is loaded programmatically. */
    let loading = false

    function onBufferChanged(buffer: Gtk.TextBuffer) {
        if (loading) return
        const current = page.get()
        markEdited(current)
        saveTimer?.cancel()
        saveTimer = timeout(SCRATCH_SAVE_DEBOUNCE_MS, () => {
            saveTimer = null
            saveNote(current, buffer.text)
        })
    }

    function goToPage(target: number) {
        const next = Math.max(0, Math.min(PAGE_COUNT - 1, target))
        if (next === page.get() || !view) return

        const buffer = view.get_buffer()
        const from = page.get()

        /* Flush unsaved edits on the page we're leaving. */
        const hadPending = saveTimer !== null
        saveTimer?.cancel()
        saveTimer = null
        if (hadPending) saveNote(from, buffer.text)

        /* Load the target without tripping the change handler, and reset undo so
         * Ctrl+Z can't reach across pages. */
        loading = true
        buffer.set_enable_undo(false)
        buffer.text = loadNote(next)
        buffer.set_enable_undo(true)
        loading = false

        setPage(next)

        /* Any lingering AI message belonged to the page we left. */
        statusTimer?.cancel()
        statusTimer = null
        setStatus(null)
    }

    function flashStatus(message: string) {
        setStatus(message)
        statusTimer?.cancel()
        statusTimer = timeout(AI_STATUS_LINGER_MS, () => {
            statusTimer = null
            setStatus(null)
        })
    }

    async function tidy() {
        if (busy.get() || !view) return

        const self = view
        const buffer = self.get_buffer()
        const current = page.get()

        const original = buffer.text.trim()
        if (original.length === 0) return

        /* Arithmetic and currency codes are resolved before the model sees the
         * note: it never gets the chance to "helpfully" recompute a sum and
         * land on a plausible wrong number, and the unambiguous symbols are
         * already done by the time it looks. It still handles the ambiguous
         * ones, where reading the sentence is the whole job. */
        const note = resolveCurrency(resolveSolve(original))

        const provider = PROVIDERS[ACTIVE_PROVIDER]

        setBusy(true)
        statusTimer?.cancel()
        setStatus("tidying...")

        try {
            const key = await readApiKey(provider)
            if (provider.secret && !key) throw new AiError(missingKeyHint(provider))

            const budget = measureBudget(self)
            const result = await tidyNote({
                provider,
                key,
                note,
                maxLines: budget.maxLines,
                askLines: Math.max(3, Math.floor(budget.maxLines * AI_BUDGET_HEADROOM)),
                cols: budget.cols,
                measure: (text) => renderedLines(self, text, budget.width),
            })

            /* If the user paged away mid-call, don't splice the result into a
             * different note. */
            if (page.get() !== current) return

            /* Compared against the buffer, not against `note` - `note` already
             * has solve() resolved, so comparing to it would call a note
             * "unchanged" while the resolved arithmetic was still only in a
             * local and never reached the buffer. */
            if (result.text.trim() === original) {
                flashStatus("already tidy")
                return
            }

            backupNote(current)

            /* Grouped into one user action so a single Ctrl+Z puts the note
             * back the way it was. */
            buffer.begin_user_action()
            buffer.text = result.text
            buffer.end_user_action()

            flashStatus(
                result.overBudget
                    ? `tidied, ${result.lines}/${budget.maxLines} lines`
                    : "tidied - ctrl+z to undo",
            )
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            console.error("sticky: tidy failed:", message)
            flashStatus(message.length > 64 ? `${message.slice(0, 61)}...` : message)
        } finally {
            setBusy(false)
        }
    }

    return (
        <window
            name="sticky"
            /* Gives the layer surface its own namespace, so a compositor blur
             * rule can target the note without also matching the other AGS
             * widgets (they otherwise all report "gtk4-layer-shell"). */
            namespace="sticky"
            class="StickyWidget"
            gdkmonitor={gdkmonitor}
            anchor={TOP | RIGHT | BOTTOM}
            marginTop={STICKY_WINDOW_MARGIN_TOP_PX}
            layer={Astal.Layer.BOTTOM}
            /* Without a keymode the note can never take focus, which would make
             * it read-only. ON_DEMAND takes focus on click and drops it after. */
            keymode={Astal.Keymode.ON_DEMAND}
            visible={true}
            application={app}
            /* Alt + Left/Right pages the note. Bare arrows move the cursor in the
             * TextView, so the switch needs a modifier; the controller runs in
             * the capture phase so it fires even while the TextView has focus. */
            $={(self: Astal.Window) => {
                const keys = new Gtk.EventControllerKey()
                keys.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
                keys.connect("key-pressed", (_c, keyval: number, _code: number, state: Gdk.ModifierType) => {
                    const alt = (state & Gdk.ModifierType.ALT_MASK) !== 0
                    if (alt && keyval === Gdk.KEY_Left) {
                        goToPage(page.get() - 1)
                        return true
                    }
                    if (alt && keyval === Gdk.KEY_Right) {
                        goToPage(page.get() + 1)
                        return true
                    }
                    return false
                })
                self.add_controller(keys)
            }}
        >
            <box
                class={`note surface-${STICKY_SURFACE} type-${STICKY_TYPEFACE}`}
                orientation={Gtk.Orientation.VERTICAL}
                widthRequest={STICKY_WIDTH_PX}
                marginTop={STICKY_SHADOW_ROOM_PX}
                marginStart={STICKY_SHADOW_ROOM_PX}
                marginEnd={STICKY_GAP_RIGHT_PX}
                marginBottom={STICKY_GAP_BOTTOM_PX}
            >
                {/* A centerbox, so the timestamp is centred against the header
                    itself rather than against whatever space the filename and
                    button happen to leave over. */}
                <centerbox class="header" orientation={Gtk.Orientation.HORIZONTAL}>
                    <box $type="start" spacing={8}>
                        <box class="dot" valign={Gtk.Align.CENTER} />
                        <label class="file" label={fileLabel} />
                    </box>

                    <label $type="center" class="meta" label={meta} />

                    {/* Nerd Font glyph rather than an SVG, so it stays a plain
                        label and inherits colour like the rest of the header. */}
                    <button
                        $type="end"
                        class="ai"
                        label={AI_GLYPH}
                        tooltipText="Tidy this page to fit"
                        sensitive={busy((b) => !b)}
                        onClicked={() => void tidy()}
                        /* Hand cursor on hover. GTK has no CSS `cursor`, so it
                         * is set here as a widget property. */
                        $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                    />
                </centerbox>

                <scrolledwindow
                    class="body-scroll"
                    hexpand={true}
                    vexpand={true}
                    hscrollbarPolicy={Gtk.PolicyType.NEVER}
                >
                    {/* Gtk.TextView has no JSX intrinsic in ags/gtk4, so the
                        class is used directly as the element. */}
                    <Gtk.TextView
                        class="body"
                        wrapMode={Gtk.WrapMode.WORD_CHAR}
                        /* Hanging indent: the left margin is pushed in by one
                         * bullet's width and the first line pulled back out by
                         * the same amount, so a bullet starts at the margin and
                         * its wrapped text lines up under the text, not the
                         * bullet. */
                        leftMargin={STICKY_BODY_MARGIN_PX + STICKY_HANGING_INDENT_PX}
                        indent={-STICKY_HANGING_INDENT_PX}
                        rightMargin={STICKY_BODY_MARGIN_PX}
                        topMargin={STICKY_BODY_MARGIN_PX}
                        bottomMargin={STICKY_BODY_MARGIN_PX}
                        $={(self: Gtk.TextView) => {
                            view = self
                            const buffer = self.get_buffer()
                            buffer.text = loadNote(0)
                            /* Gives Ctrl+Z, which is what makes the AI rewrite
                             * safe to apply in place. */
                            buffer.set_enable_undo(true)
                            buffer.connect("changed", onBufferChanged)
                        }}
                    />
                </scrolledwindow>

                {/* Footer bar holding the pager - a top border mirrors the
                    header, so the note reads header / body / footer. */}
                <box class="footer">
                <box class="pager" halign={Gtk.Align.CENTER} hexpand={true} valign={Gtk.Align.CENTER} spacing={10}>
                    <button
                        class="pager-arrow"
                        label={"‹"}
                        tooltipText="Previous page (Alt+Left)"
                        sensitive={page((p) => p > 0)}
                        onClicked={() => goToPage(page.get() - 1)}
                        $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                    />
                    <box class="pager-dots" spacing={7} valign={Gtk.Align.CENTER}>
                        {Array.from({ length: PAGE_COUNT }, (_, i) => (
                            <button
                                class={createComputed(() => `pager-dot ${page() === i ? "active" : ""}`)}
                                tooltipText={`Page ${i + 1}`}
                                onClicked={() => goToPage(i)}
                                $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                            />
                        ))}
                    </box>
                    <button
                        class="pager-arrow"
                        label={"›"}
                        tooltipText="Next page (Alt+Right)"
                        sensitive={page((p) => p < PAGE_COUNT - 1)}
                        onClicked={() => goToPage(page.get() + 1)}
                        $={(self: Gtk.Button) => self.set_cursor_from_name("pointer")}
                    />
                </box>
                </box>
            </box>
        </window>
    )
}
