#!/bin/bash

DOTFILES="$HOME/.dotfiles"
SCHEMES_DIR="$DOTFILES/color-schemes"

# Symlink targets: source_dir -> relative symlink path within dotfiles
declare -A TARGETS=(
    ["kitty/theme.conf"]="terminal/.config/kitty/theme.conf"
    ["rofi/theme.rasi"]="desktop/.config/rofi/theme.rasi"
    ["waybar/theme.css"]="desktop/.config/waybar/theme.css"
    ["btop/theme.theme"]="terminal/.config/btop/themes/default.theme"
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

        if [[ ! -f "$source" ]]; then
            echo "Warning: $source does not exist, skipping"
            continue
        fi

        local target_dir
        target_dir=$(dirname "$target")
        local rel_path
        rel_path=$(realpath --relative-to="$target_dir" "$source")

        ln -sf "$rel_path" "$target"
        echo "Linked: ${TARGETS[$scheme_file]} -> $rel_path"
    done

    # Kvantum — repoint main symlink
    ln -sfn "$SCHEMES_DIR/$theme/Kvantum" "$HOME/.config/Kvantum/main"
    echo "Linked: Kvantum/main -> $theme"

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
