#!/usr/bin/env bash

# Set delimiter for Rofi display
export ROFI_KEYBIND_HINT_DELIMITER=">"

# Call Python script and pass output to rofi
output=$(python3 ~/.local/SCRIPTS/keybinds.hint.py --format rofi)

# Show keybinds in a rofi menu
echo "$output" | rofi -dmenu -i -p "Hyprland Keybinds" -config ~/.config/rofi/keyhint.rasi
