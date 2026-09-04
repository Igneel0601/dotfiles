export type DeviceSlot = {
    id: "mouse" | "bluetooth"
    connected: boolean
    percentage: number
    iconType?: string
}

export const EMPTY_SLOT: DeviceSlot = {
    id: "mouse",
    connected: false,
    percentage: 0,
}

export type SlotBinding = {
    as: <T>(fn: (value: DeviceSlot) => T) => any
}
