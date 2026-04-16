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

## Theme Switcher (planned)

Will be a Rofi-based script. Theme definitions will live in `themes/<theme-name>/`. Color format varies by app: Hyprland uses `rgba(RRGGBBAA)`, Waybar uses CSS variables imported from `color-schemes/catppuccin-mocha/waybar/theme.css`.
