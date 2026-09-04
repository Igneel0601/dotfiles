import Gio from "gi://Gio"
import GLib from "gi://GLib"
import { readFile, writeFile } from "ags/file"
import { NOTES_DIR, notePath, PAGE_COUNT, SCRATCH_PATH, SCRATCH_SEED } from "../types/sticky_types"

/* Per-page last-edit time, tracked in-process so the header updates on keystroke
 * rather than waiting for the debounced write. Indexed by page. */
const editedAt: number[] = Array.from(
    { length: PAGE_COUNT },
    () => GLib.get_monotonic_time() / 1_000_000,
)

function ensureDir(): void {
    try {
        const dir = Gio.File.new_for_path(NOTES_DIR)
        if (!dir.query_exists(null)) dir.make_directory_with_parents(null)
    } catch (error) {
        console.error("sticky: could not create notes dir:", error)
    }
}

/*
 * First-run setup: create the notes dir, and migrate the old single scratch.md
 * into page 1 so the existing note is never lost. Then seed each page's edit
 * time from its file's mtime, so a fresh session shows the real age.
 */
export function initNotes(): void {
    ensureDir()

    const firstPath = notePath(0)
    if (!Gio.File.new_for_path(firstPath).query_exists(null)) {
        let seed = SCRATCH_SEED
        try {
            const legacy = readFile(SCRATCH_PATH)
            if (legacy.trim().length > 0) seed = legacy
        } catch {
            /* No legacy note - fall back to the seed copy. */
        }
        try {
            writeFile(firstPath, seed)
        } catch (error) {
            console.error("sticky: could not seed page 1:", error)
        }
    }

    for (let page = 0; page < PAGE_COUNT; page++) initEdited(page)
}

export function loadNote(page: number): string {
    try {
        return readFile(notePath(page))
    } catch {
        /* Page 1 always has content (migrated/seeded); the rest start empty. */
        return page === 0 ? SCRATCH_SEED : ""
    }
}

export function saveNote(page: number, content: string): void {
    try {
        ensureDir()
        writeFile(notePath(page), content)
    } catch (error) {
        console.error(`sticky: could not write ${notePath(page)}:`, error)
    }
}

/* Called before the AI rewrites a page. The buffer's undo stack covers a
 * mistake within the session (Ctrl+Z), but it dies on restart - this does not. */
export function backupNote(page: number): void {
    try {
        const current = readFile(notePath(page))
        if (current.trim().length > 0) writeFile(`${notePath(page)}.bak`, current)
    } catch {
        /* Nothing on disk yet - nothing worth backing up. */
    }
}

export function markEdited(page: number): void {
    editedAt[page] = GLib.get_monotonic_time() / 1_000_000
}

export function secondsSinceEdit(page: number): number {
    return Math.max(0, GLib.get_monotonic_time() / 1_000_000 - (editedAt[page] ?? 0))
}

function initEdited(page: number): void {
    try {
        const info = Gio.File.new_for_path(notePath(page)).query_info(
            "time::modified",
            Gio.FileQueryInfoFlags.NONE,
            null,
        )

        const modified = info.get_modification_date_time()
        if (!modified) return

        const ageMicros = Number(GLib.DateTime.new_now_local().difference(modified))
        const ageSeconds = Math.max(0, ageMicros / 1_000_000)
        editedAt[page] = GLib.get_monotonic_time() / 1_000_000 - ageSeconds
    } catch {
        /* No file yet — the seed note counts as edited now. */
    }
}
