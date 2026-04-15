# dotfiles

Personal dotfiles for Arch Linux + Hyprland, managed with GNU Stow.

## Structure

```
.dotfiles/
├── core/          # zsh, git
├── desktop/       # hyprland, waybar, rofi, dunst, wlogout, eww, hyprpanel
├── terminal/      # kitty, btop, cava, fastfetch
├── theming/       # gtk, kvantum
├── scripts/       # local scripts
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

> install.sh uses `stow` to symlink each module into `$HOME`.

## Waybar

Config lives in `desktop/.config/waybar/`.

### Structure

```
waybar/
├── config.jsonc          # entry point — includes active layout
├── layouts/              # layout variants
│   └── default.jsonc     # full bar (workspaces, spotify, cpu, memory, clock, updates, tray, battery)
├── modules/              # one .jsonc per module
├── includes/
│   └── includes.json     # lists all module files
├── style.css             # imports mocha.css + component styles
└── mocha.css             # Catppuccin Mocha color variables
```

### How layouts work

`config.jsonc` includes `~/.config/waybar/layouts/active.jsonc`, which is a symlink pointing to the currently selected layout file. Switching layouts changes what that symlink points to and restarts waybar.

To switch layouts, run `waybar-layout` (rofi picker) — WIP.

### Reload waybar

```bash
pkill -SIGUSR2 waybar   # reload CSS only
pkill waybar && waybar & # full restart (config/layout changes)
```

### Adding a new layout

1. Create `layouts/<name>.jsonc` with your bar config
2. Run `waybar-layout` to switch to it

## Theme

Catppuccin Mocha throughout. Colors defined in `waybar/mocha.css` and referenced via `@color-name` in CSS.
