#!/usr/bin/env bash

scrDir=$(dirname "$(realpath "$0")")
iconsDir="${HOME}/.local/share/icons"  # Adjust this if needed

use_swayosd=false
isNotify=${BRIGHTNESS_NOTIFY:-true}
if command -v swayosd-client >/dev/null 2>&1 && pgrep -x swayosd-server >/dev/null; then
    use_swayosd=true
fi

print_error() {
    local cmd
    cmd=$(basename "$0")
    cat <<EOF
Usage: ${cmd} [-m] <action> [step]
  -m : control external monitor via DDC/CI
Valid actions:
  i  -- increase brightness [+5%]
  d  -- decrease brightness [-5%]

Examples:
  ${cmd} i        # Increase laptop brightness by default step (5%)
  ${cmd} -m d 10  # Decrease monitor brightness by 10%
EOF
}

send_notification() {
    local brightness="$1"
    local device="$2"
    local id="$3"

    local angle="$((((brightness + 2) / 5) * 5))"
    local ico="${iconsDir}/Wallbash-Icon/media/knob-${angle}.svg"

    local bar_length=$((brightness / 10))
    local bar=$(seq -s "." $bar_length | sed 's/[0-9]//g')

    [[ "${isNotify}" == true ]] && dunstify -a "HyDE Notify" -r "$id" -t 800 -i "$ico" "${brightness}${bar}" "$device"
}

get_brightness() {
    brightnessctl -m | grep -o '[0-9]\+%' | head -c-2
}

get_device_name() {
    brightnessctl info | awk -F "'" '/Device/ {print $2}'
}

get_monitor_brightness() {
    ddcutil getvcp 10 | grep -oP 'current value =\s+\K[0-9]+'
}

set_monitor_brightness() {
    local val="$1"
    ddcutil setvcp 10 "$val"
}

# === Argument Parsing ===
target="laptop"
if [[ "$1" == "-m" ]]; then
    target="monitor"
    shift
fi

action="$1"
step=${2:-${BRIGHTNESS_STEPS:-5}}

# === External Monitor Control ===
if [[ "$target" == "monitor" ]]; then
    current=$(get_monitor_brightness)
    [[ -z "$current" ]] && echo "Failed to get current monitor brightness" && exit 1

    case $action in
        i | -i)
            new=$((current + step))
            ((new > 100)) && new=100
            ;;
        d | -d)
            new=$((current - step))
            ((new < 0)) && new=0
            ;;
        *)
            print_error && exit 1
            ;;
    esac

    set_monitor_brightness "$new"
    $use_swayosd && swayosd-client --brightness set "$new"
    send_notification "$new" "External Monitor" 8
    exit 0
fi

# === Laptop Screen Control ===
current_brightness=$(get_brightness)

case $action in
    i | -i)
        [[ "$current_brightness" -lt 10 ]] && step=1
        $use_swayosd && swayosd-client --brightness raise "$step" && exit 0
        brightnessctl set +"${step}"%
        send_notification "$(get_brightness)" "$(get_device_name)" 7
        ;;
    d | -d)
        [[ "$current_brightness" -le 10 ]] && step=1
        if [[ "$current_brightness" -le 1 ]]; then
            brightnessctl set "${step}"%
            $use_swayosd && exit 0
        else
            $use_swayosd && swayosd-client --brightness lower "$step" && exit 0
            brightnessctl set "${step}"%-
        fi
        send_notification "$(get_brightness)" "$(get_device_name)" 7
        ;;
    *)
        print_error
        ;;
esac
