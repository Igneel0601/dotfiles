import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createPoll } from "ags/time"
import BatteryGauge from "../../components/battery_gauge"
import { fetchBluetooth, fetchMouse } from "../../components/battery_sources"
import { DeviceSlot, EMPTY_SLOT } from "../../types/battery_types"

export default function Battery(gdkmonitor: Gdk.Monitor) {
    const { TOP, RIGHT } = Astal.WindowAnchor

    const slots = createPoll<DeviceSlot[]>(
        [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT],
        5000,
        async () => {
            const [mouse, btDevices] = await Promise.all([fetchMouse(), fetchBluetooth()])

            // Combine all active devices into one list
            const allConnected = [
                ...(mouse.connected ? [mouse] : []),
                ...btDevices
            ]

            return [
                allConnected[0] ?? EMPTY_SLOT,
                allConnected[1] ?? EMPTY_SLOT,
                allConnected[2] ?? EMPTY_SLOT,
                allConnected[3] ?? EMPTY_SLOT,
            ]
        },
    )

    const slot1 = slots.as((arr) => arr[0] ?? EMPTY_SLOT)
    const slot2 = slots.as((arr) => arr[1] ?? EMPTY_SLOT)
    const slot3 = slots.as((arr) => arr[2] ?? EMPTY_SLOT)
    const slot4 = slots.as((arr) => arr[3] ?? EMPTY_SLOT)
    const connectedCount = slots.as((arr) => arr.filter((slot) => slot.connected).length)
    const singlePercentage = slot1.as((d) => `${Math.round(d.percentage)}%`)

    return (
        <window
            name="battery"
            /* Own namespace so the compositor blur rule can target this layer. */
            namespace="battery"
            class="BatteryWidget"
            gdkmonitor={gdkmonitor}
            anchor={TOP | RIGHT}
            application={app}
            layer={Astal.Layer.BOTTOM}
            visible={true}
        >
            <box class="card" orientation={Gtk.Orientation.VERTICAL}>
                <box
                    class="single-grid"
                    visible={connectedCount.as((count) => count === 1)}
                    orientation={Gtk.Orientation.VERTICAL} // Shorthand for orientation={Gtk.Orientation.VERTICAL}
                >
                    {/* The Top Part (Gauge) */}
                    <box halign={Gtk.Align.START} valign={Gtk.Align.START}>
                        <BatteryGauge slot={slot1} alignStart={true} />
                    </box>

                    {/* The Bottom Part (Percentage) */}
                    <box vexpand halign={Gtk.Align.START} valign={Gtk.Align.END}>
                        <label
                            class="single-percentage"
                            label={singlePercentage}
                        />
                    </box>
                </box>

                <box
                    class="grid"
                    orientation={Gtk.Orientation.VERTICAL}
                    spacing={0}
                    visible={connectedCount.as((count) => count !== 1)}
                >
                    <box class="row" orientation={Gtk.Orientation.HORIZONTAL} spacing={0}>
                        <BatteryGauge slot={slot1} />
                        <BatteryGauge slot={slot2} />
                    </box>
                    <box class="row" orientation={Gtk.Orientation.HORIZONTAL} spacing={0}>
                        <BatteryGauge slot={slot3} />
                        <BatteryGauge slot={slot4} />
                    </box>
                </box>
            </box>
            
        </window>
    )
}
