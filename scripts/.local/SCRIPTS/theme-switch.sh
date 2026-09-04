#!/bin/bash

DOTFILES="$HOME/.dotfiles"
SCHEMES_DIR="$DOTFILES/color-schemes"

# Symlink targets: source_dir -> relative symlink path within dotfiles
declare -A TARGETS=(
    ["kitty/theme.conf"]="terminal/.config/kitty/theme.conf"
    ["rofi/theme.rasi"]="desktop/.config/rofi/theme.rasi"
    ["waybar/theme.css"]="desktop/.config/waybar/theme.css"
    ["btop/theme.theme"]="terminal/.config/btop/themes/default.theme"
    ["Kvantum/main.kvconfig"]="theming/.config/Kvantum/main/main.kvconfig"
    ["Kvantum/main.svg"]="theming/.config/Kvantum/main/main.svg"
    ["kde/kdeglobals"]="theming/.config/kdeglobals"
    ["dunst/dunstrc"]="desktop/.config/matugen/templates/dunstrc"
    ["satty/config.toml"]="apps/.config/satty/config.toml"
    ["gtk-4.0/gtk.css"]="theming/.config/gtk-4.0/gtk.css"
    ["gtk-4.0/gtk-dark.css"]="theming/.config/gtk-4.0/gtk-dark.css"
    ["gtk-4.0/assets"]="theming/.config/gtk-4.0/assets"
    ["icons/bluetooth.svg"]="theming/.local/share/icons/custom/bluetooth.svg"
    ["icons/razer.svg"]="theming/.local/share/icons/custom/razer.svg"
    ["icons/spotify.svg"]="theming/.local/share/icons/custom/spotify.svg"
    ["icons/bluetooth-connected.svg"]="theming/.local/share/icons/custom/bluetooth-connected.svg"
    ["icons/bluetooth-off.svg"]="theming/.local/share/icons/custom/bluetooth-off.svg"
    ["icons/wifi-1.svg"]="theming/.local/share/icons/custom/wifi-1.svg"
    ["icons/wifi-2.svg"]="theming/.local/share/icons/custom/wifi-2.svg"
    ["icons/wifi-3.svg"]="theming/.local/share/icons/custom/wifi-3.svg"
    ["icons/wifi-4.svg"]="theming/.local/share/icons/custom/wifi-4.svg"
    ["icons/wifi-off.svg"]="theming/.local/share/icons/custom/wifi-off.svg"
    ["icons/ethernet.svg"]="theming/.local/share/icons/custom/ethernet.svg"
    ["icons/network-disconnected.svg"]="theming/.local/share/icons/custom/network-disconnected.svg"
)

# Get available themes
get_themes() {
    ls -1 "$SCHEMES_DIR"
}

# Get current theme from any existing symlink
get_current() {
    local link="$DOTFILES/${TARGETS["kitty/theme.conf"]}"
    if [[ -L "$link" ]]; then
        readlink "$link" | sed 's|.*/color-schemes/||' | cut -d'/' -f1
    else
        echo "unknown"
    fi
}

# Switch theme
switch_theme() {
    local theme="$1"

    if [[ ! -d "$SCHEMES_DIR/$theme" ]]; then
        echo "Theme '$theme' not found in $SCHEMES_DIR"
        exit 1
    fi

    for scheme_file in "${!TARGETS[@]}"; do
        local source="$SCHEMES_DIR/$theme/$scheme_file"
        local target="$DOTFILES/${TARGETS[$scheme_file]}"

        if [[ ! -e "$source" ]]; then
            echo "Warning: $source does not exist, skipping"
            continue
        fi

        local target_dir
        target_dir=$(dirname "$target")
        local rel_path
        rel_path=$(realpath --relative-to="$target_dir" "$source")

        ln -sfn "$rel_path" "$target"
        echo "Linked: ${TARGETS[$scheme_file]} -> $rel_path"
    done

    # Reload apps
    echo "Reloading..."

    # Waybar
    if pgrep -x waybar &>/dev/null; then
        killall -SIGUSR2 waybar 2>/dev/null
    fi

    # Kitty
    if pgrep -x kitty &>/dev/null; then
        killall -SIGUSR1 kitty 2>/dev/null
    fi

    # GTK theme
    local gtk_theme="${theme}-lavender-standard+default"
    gsettings set org.gnome.desktop.interface gtk-theme "$gtk_theme"

    # VSCode settings.json from templates/code.tmpl with role substitution
    local vscode_settings="$HOME/.config/Code/User/settings.json"
    local vscode_tmpl="$DOTFILES/templates/code.tmpl"
    local palette_file="$DOTFILES/palettes/$theme.json"
    if [[ -f "$vscode_tmpl" && -f "$palette_file" ]]; then
        local rendered
        rendered=$(cat "$vscode_tmpl")
        while IFS=$'\t' read -r role hex; do
            rendered="${rendered//\{\{${role}\}\}/$hex}"
        done < <(jq -r '.roles | to_entries[] | "\(.key)\t\(.value)"' "$palette_file")
        mkdir -p "$(dirname "$vscode_settings")"
        echo "$rendered" > "$vscode_settings"
    fi

    # Regenerate templated files (dunstrc) + fire matugen post-hooks
    if [[ -f "$HOME/.cache/wall" ]]; then
        matugen image "$HOME/.cache/wall" --prefer saturation &>/dev/null
    fi

    echo "Switched to: $theme"
}

# Rofi picker
rofi_pick() {
    local current
    current=$(get_current)
    local theme
    theme=$(get_themes | rofi -dmenu -p "Theme" -mesg "Current: $current")
    [[ -n "$theme" ]] && switch_theme "$theme"
}

# Usage
case "${1:-}" in
    "")
        rofi_pick
        ;;
    --list)
        echo "Current: $(get_current)"
        echo "Available:"
        get_themes | sed 's/^/  /'
        ;;
    --current)
        get_current
        ;;
    *)
        switch_theme "$1"
        ;;
esac
