import { appendFileSync, mkdirSync, existsSync, readdirSync, rmdirSync, unlinkSync, statSync } from "node:fs"
import { join } from "node:path"

const LOG_DIR = join(process.env.USERPROFILE || "~", ".opencode", "plugins-log")

export default function createLogger(name) {
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })

  const today = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  }

  const cleanOldLogs = () => {
    try {
      const now = Date.now()
      const maxAge = 7 * 86400000
      for (const f of readdirSync(LOG_DIR)) {
        if (f.startsWith(name)) continue
        if (!f.match(/^\d{4}-\d{2}-\d{2}\.log$/)) continue
        const p = join(LOG_DIR, f)
        try {
          if (now - statSync(p).mtimeMs > maxAge) unlinkSync(p)
        } catch {}
      }
    } catch {}
  }

  let currentDay = today()
  let logFile = join(LOG_DIR, `${currentDay}.log`)

  const write = (level, msg) => {
    const ts = new Date()
    const pad = (n) => String(n).padStart(2, "0")
    const line = `[${ts.getFullYear()}-${pad(ts.getMonth()+1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}] [${level}] ${name} ${msg}`

    const day = today()
    if (day !== currentDay) {
      currentDay = day
      logFile = join(LOG_DIR, `${day}.log`)
      cleanOldLogs()
    }
    try { appendFileSync(logFile, line + "\n") } catch {}
  }

  cleanOldLogs()

  return {
    loaded: () => write("INFO", "loaded"),
    info: (msg) => write("INFO", msg),
    error: (msg, err) => {
      const text = err ? `${msg} — ${err.message || err}` : msg
      write("ERROR", text)
    },
    hook: (hook, detail) => write("HOOK", `${hook}${detail ? " → " + detail : ""}`),
    tool: (toolName, args) => write("TOOL", `${toolName}(${JSON.stringify(args).slice(0, 200)})`),
  }
}
