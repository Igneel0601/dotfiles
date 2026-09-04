# AGENTS

This workspace is an AGS (Aylur GTK Shell) config for Linux desktop UI.
Primary target environment: Arch Linux with Hyprland (Wayland).

## Goal for Agents

Make small, safe edits to AGS widgets and styling without treating this as a web React app.

## Read First

- [app.ts](app.ts): app entrypoint, monitor loop, global CSS load
- [widget/Bar.tsx](widget/Bar.tsx): canonical widget example
- [style.scss](style.scss): GTK theme-aware SCSS
- [tsconfig.json](tsconfig.json): strict TS + AGS JSX setup
- [env.d.ts](env.d.ts): module declarations for scss/css/blp imports

## Run and Check

From repo root:

- ags run ./app.ts
- ags run --watch ./app.ts
- tsc --noEmit

## Architecture

- Entry: app.ts starts AGS and maps monitors to widget instances.
- Widgets: TSX files in widget/ produce GTK windows/components.
- Styling: style.scss is GTK CSS/SCSS, not browser CSS.
- Typings: @girs/ provides GI and Astal type definitions.

## AGS GTK Conventions

- Use imports from ags/gtk4 and ags/gtk4/app.
- Use GTK/Astal primitives such as window, box, centerbox, button, label, menubutton, popover.
- Keep per-monitor behavior by passing gdkmonitor and using app.get_monitors().map(...).
- Use Astal window anchor/exclusivity for panel placement.
- Use AGS utilities like createPoll and execAsync for dynamic data and shell integration.

## Do Not Treat As Web UI

- Do not add React hooks or DOM APIs.
- Do not assume browser CSS semantics.
- Do not introduce web bundler patterns unless explicitly requested.

## Styling Rules (GTK SCSS)

- Prefer GTK theme tokens, for example @theme_fg_color and @theme_bg_color.
- Keep styles theme-aware and lightweight.
- Validate selectors against GTK widget structure used in TSX.

## Environment Notes

- Assume Linux shell commands and Wayland behavior.
- Hyprland integrations may be added through available astalhyprland typings in @girs.
- Avoid OS-specific assumptions for non-Linux targets unless requested.
