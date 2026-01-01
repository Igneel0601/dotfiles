#!/usr/bin/env bash

# Exit if not on Arch Linux
if [ ! -f /etc/arch-release ]; then
    exit 0
fi

# Detect AUR helper
get_aurhlpr() {
    for cmd in yay paru aura pikaur trizen; do
        if command -v "$cmd" &>/dev/null; then
            echo "$cmd"
            return
        fi
    done
    echo "No AUR helper found!" >&2
    exit 1
}

# Check if a package is installed
pkg_installed() {
    pacman -Q "$1" &>/dev/null
}

aurhlpr=$(get_aurhlpr)

# Flatpak update command
flatpak_update_cmd="flatpak update"

# Use /tmp for temporary info
temp_file="/tmp/update_info"

# Source update info if it exists
# shellcheck source=/dev/null
[ -f "$temp_file" ] && source "$temp_file"

# Trigger system upgrade if passed 'up' argument
if [ "$1" == "up" ]; then
    if [ -f "$temp_file" ]; then
        trap 'pkill -RTMIN+20 waybar' EXIT

        # Parse the saved update counts
        while IFS="=" read -r key value; do
            case "$key" in
                OFFICIAL_UPDATES) official=$value ;;
                AUR_UPDATES) aur=$value ;;
                FLATPAK_UPDATES) flatpak=$value ;;
            esac
        done < "$temp_file"

        command="
        fastfetch
        printf '[Official] %-10s\n[AUR]      %-10s\n[Flatpak]  %-10s\n' '$official' '$aur' '$flatpak'
        ${aurhlpr} -Syu
        command -v flatpak &>/dev/null && flatpak update
        read -n 1 -p 'Press any key to continue...'
        "

        kitty --title systemupdate sh -c "$command"
    else
        echo "No upgrade info found. Please run the script without parameters first."
    fi
    exit 0
fi

# Count AUR and official updates
aur=$("$aurhlpr" -Qua 2>/dev/null | wc -l)
ofc=$(CHECKUPDATES_DB=$(mktemp -u) checkupdates | wc -l)

# Check Flatpak updates
if pkg_installed flatpak; then
    fpk=$(flatpak remote-ls --updates | wc -l)
    fpk_disp="\n󰏓 Flatpak $fpk"
else
    fpk=0
    fpk_disp=""
fi

# Total update count
upd=$(( ofc + aur + fpk ))

# Save update counts to temp file
cat <<EOF > "$temp_file"
OFFICIAL_UPDATES=$ofc
AUR_UPDATES=$aur
FLATPAK_UPDATES=$fpk
EOF

# Output JSON for Waybar
if [ "$upd" -eq 0 ]; then
    echo "{\"text\":\"\", \"tooltip\":\" Packages are up to date\"}"
else
    echo "{\"text\":\"󰮯 $upd\", \"tooltip\":\"󱓽 Official $ofc\n󱓾 AUR $aur$fpk_disp\"}"
fi
