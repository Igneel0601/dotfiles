#!/bin/bash

# Check if argument is provided, default to 1 if not
THEME_NUM=${1:-1}

# Set theme file based on argument
THEME_FILE="$HOME/.config/rofi/logout${THEME_NUM}.rasi"

# Check if theme file exists
if [[ ! -f "$THEME_FILE" ]]; then
    echo "Error: Theme file $THEME_FILE not found!"
    echo "Usage: $0 [1|2]"
    echo "  1 - Uses logout_1.rasi"
    echo "  2 - Uses logout_2.rasi"
    exit 1
fi

OPTIONS=" Lock\n Logout\n Hibernate\n Shutdown\n Reboot"

CHOICE=$(echo -e "$OPTIONS" | rofi -dmenu -i -p "Power Menu" -theme "$THEME_FILE")

case "$CHOICE" in
    " Lock")
        # Fix: Use swaylock or your preferred screen locker
        hyprlock
        ;;
    " Logout")
        # Hyprland exit
        hyprctl dispatch exit
        ;;
    " Hibernate")
        # Hyprland exit
        hibernate.sh
        ;;
    " Shutdown")
        poweroff
        ;;
    " Reboot")
        reboot
        ;;
    *)
        # Exit without action if cancelled or invalid choice
        exit 0
        ;;
esac