import { Gtk } from "ags/gtk4"
import { SlotBinding } from "../types/battery_types"

type BatteryGaugeProps = {
    slot: SlotBinding
    alignStart?: boolean
}

export default function BatteryGauge({ slot, alignStart = false }: BatteryGaugeProps) {
    const percentage = slot.as((d) => d.percentage)
    const connected = slot.as((d) => d.connected)

    const icon = slot.as((d) => {
        if (d.id === "mouse") return "󰍽"

        const iconMap: Record<string, string> = {
            phone: "󰄜",
            "audio-card": "󰋋",
            "audio-headset": "󰋋",
            "input-keyboard": "󰌌",
            "input-gaming": "󰖺",
            bluetooth: "󰂯",
        }

        return iconMap[d.iconType || ""] || "󰂯"
    })

    return (
        <overlay
            class="gauge"
            halign={alignStart ? Gtk.Align.START : Gtk.Align.CENTER}
            valign={alignStart ? Gtk.Align.START : Gtk.Align.CENTER}
        >
            <drawingarea
                class="ring"
                contentWidth={100}
                contentHeight={100}
                widthRequest={100}
                heightRequest={100}
                $={(self) => {
                    self.set_draw_func((_area, cr, width, height) => {
                        const val = percentage()
                        const p = Math.max(0, Math.min(100, val)) / 100
                        const isConnected = connected()
                        const cx = width / 2
                        const cy = height / 2

                        const lineWidth = 7
                        const radius = (Math.min(width, height) / 2) - (lineWidth / 2) - 5

                        cr.setAntialias(3)
                        cr.setLineCap(1)
                        cr.setLineWidth(lineWidth)

                        cr.setSourceRGBA(0.46, 0.47, 0.52, 0.15)
                        cr.arc(cx, cy, radius, 0, Math.PI * 2)
                        cr.stroke()

                        if (isConnected) {
                            if (val <= 10) {
                                cr.setSourceRGBA(0.95, 0.30, 0.30, 0.95)
                            } else if (val <= 30) {
                                cr.setSourceRGBA(0.95, 0.85, 0.30, 0.95)
                            } else {
                                cr.setSourceRGBA(0.42, 0.90, 0.45, 0.95)
                            }

                            cr.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p))
                            cr.stroke()
                        }
                    })

                    percentage.subscribe(() => self.queue_draw())
                    connected.subscribe(() => self.queue_draw())
                }}
            />
            <label
                $type="overlay"
                class={slot.as((d) => `gauge-text ${d.id}`)}
                label={connected.as((isConnected: boolean) => (isConnected ? icon() : ""))}
                halign={Gtk.Align.CENTER}
                valign={Gtk.Align.CENTER}
                hexpand={true}
                vexpand={true}
                xalign={0.5}
                yalign={0.5}
            />
        </overlay>
    )
}
