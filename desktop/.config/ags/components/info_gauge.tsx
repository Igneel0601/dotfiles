import { Gtk } from "ags/gtk4"
import {
    clampPercent,
    INFO_GAUGE_SIZE_REM,
    PercentBinding,
    StatId,
    toPx,
} from "../types/info_types"

export default function InfoGauge({ id, value }: { id: StatId; value: PercentBinding }) {
    const percent = value.as((v) => clampPercent(v))

    const color = (stat: StatId): [number, number, number] => {
        if (stat === "cpu") return [0.95, 0.55, 0.66]
        if (stat === "mem") return [0.80, 0.65, 0.97]
        if (stat === "gpu") return [0.97, 0.71, 0.45]
        return [0.54, 0.86, 0.92]
    }

    const [r, g, b] = color(id)
    const label = id.toUpperCase()

    return (
        <overlay class="gauge" halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}>
            <drawingarea
                class="ring"
                contentWidth={toPx(INFO_GAUGE_SIZE_REM)}
                contentHeight={toPx(INFO_GAUGE_SIZE_REM)}
                widthRequest={toPx(INFO_GAUGE_SIZE_REM)}
                heightRequest={toPx(INFO_GAUGE_SIZE_REM)}
                $={(self) => {
                    self.set_draw_func((_area, cr, width, height) => {
                        const val = percent()
                        const p = Math.max(0, Math.min(100, val)) / 100
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

                        cr.setSourceRGBA(r, g, b, 0.95)
                        cr.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p))
                        cr.stroke()
                    })

                    percent.subscribe(() => self.queue_draw())
                }}
            />
            <label
                $type="overlay"
                class={`gauge-text ${id}`}
                label={label}
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
