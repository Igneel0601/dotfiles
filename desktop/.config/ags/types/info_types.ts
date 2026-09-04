export type StatId = "cpu" | "mem" | "disk" | "gpu"

export type StatSnapshot = {
    cpu: number
    mem: number
    disk: number
    gpu: number
}

export type PercentBinding = {
    as: <T>(fn: (value: number) => T) => any
}

export const clampPercent = (v: number): number => Math.max(0, Math.min(100, Math.round(v)))

const REM_PX = 16
export const toPx = (rem: number): number => Math.round(rem * REM_PX)

export const INFO_GAUGE_SIZE_REM = 6.25
export const INFO_MARGIN_RIGHT_REM = 14
