# dotfiles

Personal dotfiles for Arch Linux + Hyprland, managed with GNU Stow.

## Structure

```
.dotfiles/
├── core/          # zsh, git
├── desktop/       # hyprland, waybar, rofi, dunst, wlogout, eww, hyprpanel
├── terminal/      # kitty, btop, cava, fastfetch
├── theming/       # gtk, kvantum
├── scripts/       # local scripts + shared Python venv (uv)
├── apps/          # lazygit, mpv, nnn, obs, rclone, swappy
└── peripherals/   # input-remapper, openrazer, polychromatic
```

## Install

```bash
git clone <repo> ~/.dotfiles
cd ~/.dotfiles
./install.sh        # stows: core desktop terminal theming scripts

# optional
stow apps
stow peripherals
```

After install, set up the waybar active layout symlink:

```bash
mkdir -p ~/.config/waybar/layouts
ln -sf ~/.dotfiles/desktop/.config/waybar/layouts/default.jsonc ~/.config/waybar/layouts/active.jsonc
```

Then enable the waybar systemd service:

```bash
systemctl --user daemon-reload
systemctl --user enable --now waybar.service
```

## Waybar

Config lives in `desktop/.config/waybar/`.

### Structure

```
waybar/
├── config.jsonc          # entry point — includes active layout
├── layouts/              # layout variants
│   ├── default.jsonc     # full bar (workspaces, spotify, cpu, memory, clock, updates, tray, battery)
│   └── minimal.jsonc     # minimal bar (workspaces, clock, battery)
├── modules/              # one .jsonc per module
├── includes/
│   └── includes.json     # lists all module files
└── style.css             # imports shared Waybar colors + component styles
```

### How layouts work

`config.jsonc` includes `~/.config/waybar/layouts/active.jsonc`, a symlink pointing to the active layout. Switching layouts changes what the symlink points to and restarts waybar.

Switch layout: `Ctrl+Shift+Right` — opens rofi picker via `waybar-layout.py`

### Waybar keybinds

| Keybind | Action |
|---|---|
| `Ctrl+Alt+R` | Restart waybar |
| `Ctrl+Shift+Right` | Switch layout (rofi) |
| `Ctrl+SIGUSR2` | Reload CSS only (`pkill -SIGUSR2 waybar`) |

### Adding a new layout

1. Create `layouts/<name>.jsonc`
2. Press `Ctrl+Shift+Right` and select it from rofi

### Waybar systemd service

Waybar runs as a user systemd service (`desktop/.config/systemd/user/waybar.service`).

```bash
systemctl --user start waybar.service
systemctl --user stop waybar.service
systemctl --user restart waybar.service
systemctl --user status waybar.service
```

## Scripts

Python scripts in `scripts/.local/SCRIPTS/`. Shared venv managed with uv at `scripts/.venv/`.

```bash
cd ~/.dotfiles/scripts
uv sync   # restore venv after fresh clone
```

Shebang used: `#!/home/archVaibhav/.dotfiles/scripts/.venv/bin/python`

## Theme

Catppuccin Mocha throughout. Waybar colors live in `color-schemes/catppuccin-mocha/waybar/theme.css` and are referenced via `@color-name` in CSS.
