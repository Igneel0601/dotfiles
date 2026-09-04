import { execAsync } from "ags/process"
import { DeviceSlot } from "../types/battery_types"

export async function fetchMouse(): Promise<DeviceSlot> {
    try {
        const raw = await execAsync(["sh", "-lc", "mouse_battery.sh 2>/dev/null"])
        const parsed = JSON.parse(raw.trim())

        // OpenRazer uses discharging or charging.
        // Count it as connected if class is neither disconnected nor empty.
        const status = parsed.class?.toLowerCase() || ""
        const connected = status !== "disconnected" && status !== "" && parsed.percentage > 0

        return {
            id: "mouse",
            connected,
            percentage: connected ? (parsed.percentage ?? 0) : 0,
        }
    } catch {
        return { id: "mouse", connected: false, percentage: 0 }
    }
}

export async function fetchBluetooth(): Promise<DeviceSlot[]> {
    try {
        const raw = await execAsync(["sh", "-lc", "bt_battery.sh 2>/dev/null"])
        const parsed = JSON.parse(raw.trim()) as Array<{ name?: string; battery?: number; icon?: string }>

        return parsed.map((dev) => ({
            id: "bluetooth",
            connected: true,
            percentage: dev.battery ?? 0,
            iconType: dev.icon,
        }))
    } catch {
        return []
    }
}
