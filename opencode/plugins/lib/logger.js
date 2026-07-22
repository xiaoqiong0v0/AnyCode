import { appendFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

const pad = (n, w = 2) => String(n).padStart(w, "0")

const GLOBAL_DIR = join(homedir(), ".config", "opencode")
const CONFIG_NAME = "plugin-logger.jsonc"

const defaults = {
  dir: join(homedir(), ".opencode", "plugins-log"),
  timeFormat: "yyyy-MM-dd HH:mm:ss",
  retentionDays: 7,
  enabled: false,
}

function readJsonc(path) {
  try {
    const raw = readFileSync(path, "utf-8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
    return JSON.parse(raw)
  } catch { return {} }
}

function resolveCfg(opts) {
  const cfg = existsSync(join(GLOBAL_DIR, CONFIG_NAME)) ? readJsonc(join(GLOBAL_DIR, CONFIG_NAME)) : {}
  return { ...defaults, ...cfg, ...(opts || {}) }
}

export default function createLogger(name, opts) {
  const cfg = resolveCfg(opts)
  if (!cfg.enabled) return { loaded() {}, info() {}, error() {}, hook() {}, tool() {} }

  const logDir = cfg.dir
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })

  const formatTime = (ts) => {
    const d = new Date(ts)
    let s = cfg.timeFormat
    s = s.replace("yyyy", d.getFullYear())
    s = s.replace("MM", pad(d.getMonth() + 1))
    s = s.replace("dd", pad(d.getDate()))
    s = s.replace("HH", pad(d.getHours()))
    s = s.replace("mm", pad(d.getMinutes()))
    s = s.replace("ss", pad(d.getSeconds()))
    s = s.replace("SSS", pad(d.getMilliseconds(), 3))
    return s
  }

  const cleanOld = () => {
    if (!cfg.retentionDays) return
    const maxAge = cfg.retentionDays * 86400000
    const now = Date.now()
    try {
      for (const f of readdirSync(logDir)) {
        if (!f.match(/^\d{4}-\d{2}-\d{2}\.log$/)) continue
        try { if (now - statSync(join(logDir, f)).mtimeMs > maxAge) unlinkSync(join(logDir, f)) } catch {}
      }
    } catch {}
  }

  let currentDay = formatTime(Date.now()).slice(0, 10)
  let logFile = join(logDir, currentDay.replace(/-/g, "") + ".log")

  const write = (level, msg) => {
    const now = Date.now()
    const day = formatTime(now).slice(0, 10)
    if (day !== currentDay) { currentDay = day; logFile = join(logDir, day.replace(/-/g, "") + ".log"); cleanOld() }
    try { appendFileSync(logFile, `[${formatTime(now)}] [${level}] ${name} ${msg}\n`) } catch {}
  }

  cleanOld()

  return {
    loaded: () => write("INFO", "loaded"),
    info: (msg) => write("INFO", msg),
    error: (msg, err) => write("ERROR", err ? `${msg} — ${err.message || err}` : msg),
    hook: (h, d) => write("HOOK", `${h}${d ? " → " + d : ""}`),
    tool: (t, a) => write("TOOL", `${t}(${JSON.stringify(a).slice(0, 200)})`),
  }
}
