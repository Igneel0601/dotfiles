import app from "ags/gtk4/app"
import { Gdk } from "ags/gtk4"
import Battery from "./widgets/battery/battery"
import Info from "./widgets/info/info"
import Pomodoro from "./widgets/pomodoro/pomodoro"
import Sticky from "./widgets/sticky/sticky"
import Study from "./widgets/study/study"
import batteryStyle from "./widgets/battery/style.scss"
import infoStyle from "./widgets/info/style.scss"
import pomodoroStyle from "./widgets/pomodoro/style.scss"
import stickyStyle from "./widgets/sticky/style.scss"
import studyStyle from "./widgets/study/style.scss"

function isLaptopDisplay(monitor: Gdk.Monitor): boolean {
  const m = monitor as unknown as {
    get_connector?: () => string | null
    connector?: string | null
  }

  const connector = typeof m.get_connector === "function"
    ? m.get_connector()
    : m.connector

  return /^(edp|lvds|dsi)/i.test(String(connector ?? ""))
}

app.start({
  css: batteryStyle + infoStyle + stickyStyle + pomodoroStyle + studyStyle,
  main() {
    const laptopMonitor = app.get_monitors().find(isLaptopDisplay)
    if (laptopMonitor) {
      Info(laptopMonitor)
      Battery(laptopMonitor)
      Sticky(laptopMonitor)
      Pomodoro(laptopMonitor)
      Study(laptopMonitor)
    }
  },
})
