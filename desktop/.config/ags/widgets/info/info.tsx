import app from "ags/gtk4/app"
import { Astal, Gdk, Gtk } from "ags/gtk4"
import { createPoll } from "ags/time"
import InfoGauge from "../../components/info_gauge"
import {
    readCpuPercent,
    readDiskPercent,
    readGpuPercent,
    readMemPercent,
} from "../../components/info_sources"
import {
    INFO_MARGIN_RIGHT_REM,
    StatSnapshot,
    toPx,
} from "../../types/info_types"

export default function Info(gdkmonitor: Gdk.Monitor) {
    const { TOP, RIGHT } = Astal.WindowAnchor

    const stats = createPoll<StatSnapshot>(
        { cpu: 0, mem: 0, disk: 0, gpu: 0 },
        2000,
        async () => {
            const [cpu, mem, disk, gpu] = await Promise.all([
                readCpuPercent(),
                readMemPercent(),
                readDiskPercent(),
                readGpuPercent(),
            ])

            return { cpu, mem, disk, gpu }
        },
    )

    const cpu = stats.as((s) => s.cpu)
    const mem = stats.as((s) => s.mem)
    const disk = stats.as((s) => s.disk)
    const gpu = stats.as((s) => s.gpu)

    return (
        <window
            name="info"
            /* Own namespace so the compositor blur rule can target this layer. */
            namespace="info"
            class="InfoWidget"
            gdkmonitor={gdkmonitor}
            anchor={TOP | RIGHT}
            marginRight={toPx(INFO_MARGIN_RIGHT_REM)}
            layer={Astal.Layer.BOTTOM}
            visible={true}
            application={app}
        >
            <box class="card" orientation={Gtk.Orientation.VERTICAL}>
                <box class="grid" orientation={Gtk.Orientation.VERTICAL} spacing={0}>
                    <box class="row" orientation={Gtk.Orientation.HORIZONTAL} spacing={0}>
                        <InfoGauge id="cpu" value={cpu} />
                        <InfoGauge id="mem" value={mem} />
                    </box>
                    <box class="row" orientation={Gtk.Orientation.HORIZONTAL} spacing={0}>
                        <InfoGauge id="disk" value={disk} />
                        <InfoGauge id="gpu" value={gpu} />
                    </box>
                </box>
            </box>
        </window>
    )
}
