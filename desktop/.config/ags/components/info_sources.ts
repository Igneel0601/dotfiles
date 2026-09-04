import { execAsync } from "ags/process"
import { clampPercent } from "../types/info_types"

let prevIdle = 0
let prevTotal = 0

export async function readCpuPercent(): Promise<number> {
    try {
        const raw = await execAsync(["sh", "-lc", "cat /proc/stat | head -n 1"])
        const parts = raw.trim().split(/\s+/)
        const nums = parts.slice(1).map((n) => Number.parseInt(n, 10) || 0)
        const idle = (nums[3] ?? 0) + (nums[4] ?? 0)
        const total = nums.reduce((sum, n) => sum + n, 0)

        if (prevTotal === 0) {
            prevIdle = idle
            prevTotal = total
            return 0
        }

        const totalDelta = total - prevTotal
        const idleDelta = idle - prevIdle

        prevIdle = idle
        prevTotal = total

        if (totalDelta <= 0) return 0
        return clampPercent((1 - idleDelta / totalDelta) * 100)
    } catch {
        return 0
    }
}

export async function readMemPercent(): Promise<number> {
    try {
        const raw = await execAsync(["sh", "-lc", "cat /proc/meminfo"])
        const lines = raw.split("\n")

        let total = 0
        let available = 0

        for (const line of lines) {
            if (line.startsWith("MemTotal:")) {
                total = Number.parseInt(line.replace(/\D+/g, " ").trim().split(" ")[0] || "0", 10)
            }
            if (line.startsWith("MemAvailable:")) {
                available = Number.parseInt(line.replace(/\D+/g, " ").trim().split(" ")[0] || "0", 10)
            }
        }

        if (total <= 0) return 0
        return clampPercent(((total - available) / total) * 100)
    } catch {
        return 0
    }
}

export async function readDiskPercent(): Promise<number> {
    try {
        const raw = await execAsync(["sh", "-lc", "df -P / | awk 'NR==2 { gsub(/%/, \"\", $5); print $5 }'"])
        return clampPercent(Number.parseInt(raw.trim(), 10) || 0)
    } catch {
        return 0
    }
}

export async function readGpuPercent(): Promise<number> {
    try {
        const nvidia = await execAsync(["sh", "-lc", "nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null | head -n 1"])
        const val = Number.parseInt(nvidia.trim(), 10)
        if (Number.isFinite(val)) return clampPercent(val)
    } catch {
        // Non-NVIDIA or nvidia-smi not available.
    }

    try {
        const amd = await execAsync(["sh", "-lc", "for f in /sys/class/drm/card*/device/gpu_busy_percent; do [ -r \"$f\" ] && cat \"$f\" && exit 0; done; exit 1"])
        const val = Number.parseInt(amd.trim(), 10)
        if (Number.isFinite(val)) return clampPercent(val)
    } catch {
        // Path not exposed by this driver.
    }

    try {
        const intel = await execAsync(["sh", "-lc", "for f in /sys/class/drm/card*/gt_busy_percent; do [ -r \"$f\" ] && cat \"$f\" && exit 0; done; exit 1"])
        const val = Number.parseInt(intel.trim(), 10)
        if (Number.isFinite(val)) return clampPercent(val)
    } catch {
        return 0
    }

    return 0
}
