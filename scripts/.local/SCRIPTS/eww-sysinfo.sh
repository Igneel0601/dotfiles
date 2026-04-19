#!/bin/bash

cpuFile="/tmp/.eww_cpu_usage"

get_cpu() {
    local prev_total=0 prev_idle=0
    if [[ -f "$cpuFile" ]]; then
        prev_total=$(sed -n 1p "$cpuFile")
        prev_idle=$(sed -n 2p "$cpuFile")
    fi

    local cpu=( $(grep '^cpu ' /proc/stat) )
    unset "cpu[0]"
    local idle=${cpu[4]}
    local total=0
    for v in "${cpu[@]:0:4}"; do total=$((total + v)); done

    if [[ -n "$prev_total" && -n "$prev_idle" && "$prev_total" -gt 0 ]]; then
        local diff_idle=$((idle - prev_idle))
        local diff_total=$((total - prev_total))
        if (( diff_total > 0 )); then
            echo $(( (1000 * (diff_total - diff_idle) / diff_total + 5) / 10 ))
        else
            echo 0
        fi
    else
        echo 0
    fi

    printf "%s\n%s\n" "$total" "$idle" > "$cpuFile"
}

get_mem() {
    free -m | awk '/^Mem:/ {printf "%.0f\n", ($3/$2)*100}'
}

get_disk() {
    df -h / | awk 'NR==2 {gsub("%",""); print $5}'
}

case "$1" in
    --cpu)  get_cpu ;;
    --mem)  get_mem ;;
    --disk) get_disk ;;
    *) echo "Usage: $0 --cpu|--mem|--disk"; exit 1 ;;
esac
