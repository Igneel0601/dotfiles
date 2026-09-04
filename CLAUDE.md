# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## System

- **Host:** igneel (Arch Linux)
- **WM:** Hyprland | **Bar:** Waybar | **Terminal:** Kitty | **Shell:** zsh + Oh My Zsh
- **Theme:** Catppuccin Mocha | **Launcher:** Rofi | **Notifications:** Dunst

## Dotfile Management

Managed with **GNU Stow**. Each top-level directory is a module. Stow symlinks files from `~/.dotfiles/<module>/` into `~` preserving the directory structure (e.g. `desktop/.config/hypr/hyprland.conf` → `~/.config/hypr/hyprland.conf`).

`.stowrc` sets `--target=/home/archVaibhav` and `--dir=/home/archVaibhav/.dotfiles` so `-t ~` is not needed.

### Common stow commands

```bash
stow <module>          # create symlinks for a module
stow -D <module>       # remove symlinks for a module
stow --restow <module> # re-create symlinks (use after adding files)
stow --adopt <module>  # move existing target files into module, then symlink
```

### Fresh install

```bash
bash ~/.dotfiles/install.sh   # stows: core, desktop, terminal, theming, scripts
stow apps                     # optional
stow peripherals              # optional
```

## Module Structure

| Module | Contents |
|--------|----------|
| `core` | `.zshrc`, `.zprofile`, `.gitconfig`, `.config/zsh/`, `.config/git/` |
| `desktop` | hypr, waybar, hyprpanel, rofi, dunst, wlogout, eww |
| `terminal` | kitty, btop, cava, fastfetch, neofetch |
| `theming` | gtk-3.0, nwg-look, Kvantum, `.gtkrc-2.0` |
| `apps` | mpv, obs-studio, lazygit, nnn, swappy |
| `peripherals` | openrazer, polychromatic, input-remapper-2 |
| `scripts` | `~/.local/SCRIPTS/` (shell/python utilities) |
| `themes/` | Future theme switcher — gitignored, not yet implemented |

## Key Rules

- **Never stow `~/.local/bin/`** — managed by pipx/uv, not this repo
- **Never track `~/.config/gtk-4.0/`** — symlinks to system theme package, managed by pacman
- **Never track `~/.ssh/`, `~/.gnupg/`, `~/.smbcredentials/`, `~/.config/rclone/rclone.conf`** — sensitive
- **`gtk-4.0` theming** is handled by the system Catppuccin package, not dotfiles
- When adding a new config to a module, run `stow --restow <module>` after

## Scripts (`~/.local/SCRIPTS/`)

Python utilities live in `pyutils/` with a `wrapper/` subdir (rofi, fzf, libnotify bindings). Key scripts: `wall2.sh` (wallpaper), `keybinds.sh` (rofi keybind hint), `screenshot.sh`, `volumecontrol.sh`, `brightnesscontrol.sh`.

## Gotchas (verify, don't assume)

- **Tray applet icons are themed per-app — NOT by waybar.** `desktop/.config/waybar/modules/tray.jsonc` is just `{spacing}`; it does *not* map icons. To find how an applet's icon is themed, query its `IconName` over DBus first:
  ```bash
  # enumerate items, then GetAll on each
  gdbus call --session --dest org.kde.StatusNotifierWatcher --object-path /StatusNotifierWatcher \
    --method org.freedesktop.DBus.Properties.Get org.kde.StatusNotifierWatcher RegisteredStatusNotifierItems
  gdbus call --session --dest <bus> --object-path <path> \
    --method org.freedesktop.DBus.Properties.GetAll org.kde.StatusNotifierItem | grep IconName
  ```
  - `nm-applet` (`nm-signal-100`) and `blueman` (`blueman-active`) resolve from the **GTK icon theme** (`Tela-circle-dracula`). Fix wifi/bt at the icon-theme level.
  - `polychromatic` uses its own setting: `peripherals/.config/polychromatic/preferences.json` → `tray.icon` = absolute path to `~/.local/share/icons/custom/razer.svg`. Restart with `setsid -f polychromatic-tray-applet`.
  - `spotify` (`IconName=spotify-linux-32`, `IconThemePath=/opt/spotify/icons`, no pixmap) exposes **no app-level icon setting**, so it's the one legit case for the waybar host-side override: `tray.jsonc` → `icons: { "spotify-client": "~/.local/share/icons/custom/spotify.svg" }` (keyed by SNI `Id`). Reload with `pkill -SIGUSR2 waybar`.
  - The `wifi-*.svg`/`bluetooth*.svg` in `color-schemes/catppuccin-*/icons/` are **unused leftovers** — nothing renders them. Wired icons: `razer.svg` (polychromatic setting), `spotify.svg` (tray.jsonc map).
- **Themed glyph SVGs must embed the Nerd Font char as an XML entity `&#xHEX;`, not the literal PUA character** — editors/tools silently drop the raw glyph, producing a blank icon. Verify a new icon actually draws: `rsvg-convert -w64 -h64 icon.svg -o /tmp/t.png && identify -format '%k' /tmp/t.png` — >1 colors = glyph rendered, 1 = blank.
- **HiDPI tray blur:** `eDP-1` is scale **2.0**. A tray SVG referenced by path (waybar `tray.icons`) is rasterized at its **intrinsic** size and then scaled — a `viewBox="0 0 32 32"` with no `width`/`height` becomes a 32px pixbuf upscaled to ~44px = blurry. Give wired tray SVGs an explicit high intrinsic size (e.g. `width="128" height="128"` alongside the `viewBox`) so the pixbuf is high-res. (GTK-icon-theme icons like blueman/nm-applet are scale-aware and don't need this.)
- **Custom themed icons use a two-hop symlink** that reflavors on theme switch: `~/.local/share/icons/custom/<name>.svg` →(stow, theming module) `theming/.local/share/icons/custom/<name>.svg` →(theme-switch.sh) `color-schemes/catppuccin-<flavor>/icons/<name>.svg`. These SVGs are nerd-font `<text>` glyphs (lavender fill); librsvg/GTK renders them — Qt may not.
- **Hyprland `exec-once` does NOT re-run on `hyprctl reload`.** It only fires at session launch. After editing an autostart line, relaunch the program manually (`<prog> & disown`) — a config reload won't restart it.
- **Tray-applet autostart ordering:** start applets *after* `waybar` in `prefs.conf` (waybar hosts the StatusNotifierWatcher). polychromatic doesn't retry for the watcher like nm-applet/blueman do, so if it starts first its icon never registers.
- **Editing a stowed file = editing the live file** (same inode via the symlink/folded dir). `stow --restow` is only needed when *adding new files*, not when editing tracked ones. e.g. `~/.config/waybar` is a single folded symlink to the repo dir.

## Theme Switcher (planned)

Will be a Rofi-based script. Theme definitions will live in `themes/<theme-name>/`. Color format varies by app: Hyprland uses `rgba(RRGGBBAA)`, Waybar uses CSS variables imported from `color-schemes/catppuccin-mocha/waybar/theme.css`.
