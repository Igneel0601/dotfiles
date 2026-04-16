#!/bin/bash
# Cycle waybar shape styles (pill → flat → ...)

DOTFILES="$HOME/.dotfiles"
STYLES_DIR="$DOTFILES/desktop/.config/waybar/styles"
SHAPE_LINK="$DOTFILES/desktop/.config/waybar/shape.css"
STATE_FILE="$HOME/.config/waybar/.shape"

# Get available shapes
mapfile -t SHAPES < <(ls -1 "$STYLES_DIR"/*.css 2>/dev/null | xargs -n1 basename | sed 's/\.css$//' | sort)

if [[ ${#SHAPES[@]} -eq 0 ]]; then
    notify-send "Waybar Shape" "No shapes found"
    exit 1
fi

# Get current shape
current="pill"
if [[ -f "$STATE_FILE" ]]; then
    current=$(cat "$STATE_FILE")
fi

# Find next shape
idx=0
for i in "${!SHAPES[@]}"; do
    if [[ "${SHAPES[$i]}" == "$current" ]]; then
        idx=$(( (i + 1) % ${#SHAPES[@]} ))
        break
    fi
done
next="${SHAPES[$idx]}"

# Update symlink
ln -sf "styles/${next}.css" "$SHAPE_LINK"

# Save state
mkdir -p "$(dirname "$STATE_FILE")"
echo "$next" > "$STATE_FILE"

# Restart waybar
systemctl --user restart waybar.service

notify-send "Waybar Shape" "Switched to: $next"
