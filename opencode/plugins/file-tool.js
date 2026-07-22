import { tool } from "@opencode-ai/plugin"
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import createLogger from "@xiaoqiong0v0/opencode-plugin-logger"

import { rm } from "node:fs/promises"
import { join } from "node:path"

const CONFIG_DIR = process.env.HOME || process.env.USERPROFILE
const CONFIG_PATH = join(CONFIG_DIR, ".config/opencode/file-tool.jsonc")
const OPENCODE_CONFIG = join(CONFIG_DIR, ".config/opencode/opencode.json")
const CACHE_DIR = join(CONFIG_DIR, ".opencode/plugins-cache")

const log = createLogger("file-tool", { enabled: true })

// 懒加载视觉模型配置，启动时不抛错
let _visionCfg = null

const LANG = (() => { try { return readJsonc(CONFIG_PATH).lang || "zh" } catch { return "zh" } })()

const TX = {
  file_not_found:           { zh: "文件不存在: {path}", en: "File not found: {path}" },
  file_id_not_found:        { zh: "文件ID不存在: {id}", en: "File ID not found: {id}" },
  file_data_not_found:      { zh: "文件数据不存在: {id}", en: "File data not found: {id}" },
  not_an_image:             { zh: "不是图片文件: {name} ({mime})", en: "Not an image: {name} ({mime})" },
  unsupported_source:       { zh: "不支持的图片来源: {source}", en: "Unsupported source: {source}" },
  describe_image:           { zh: "请详细描述这张图片（{name}）的内容", en: "Describe this image ({name})" },
  current_model:            { zh: "当前模型: {model}\n可用模型:\n{list}", en: "Current model: {model}\nAvailable models:\n{list}" },
  model_not_set:            { zh: "未设置", en: "not set" },
  model_switched:           { zh: "视觉模型已切换为: {model}", en: "Vision model set to: {model}" },
  specify_model:            { zh: "请指定模型名", en: "Specify a model name" },
  unknown_cmd:              { zh: "未知命令: {cmd}\n可用: list-provider, set-provider <model>, list-cache [all|N|main|main N]", en: "Unknown command: {cmd}\nAvailable: list-provider, set-provider <model>, list-cache [all|N|main|main N]" },
  config_error:             { zh: "请在 file-tool.jsonc 中配置 model (provider/modelId) 或 apiKey+apiBaseUrl+model", en: "Set model (provider/modelId) or apiKey+apiBaseUrl+model in file-tool.jsonc" },
  meta_failed:              { zh: "分析失败", en: "Failed" },
  meta_skip:                { zh: "跳过", en: "Skip" },
  meta_not_found:           { zh: "文件不存在", en: "Not found" },
  meta_image:               { zh: "图片", en: "Image" },
  meta_error:               { zh: "分析出错", en: "Error" },
  no_cache:                 { zh: "[] (无缓存)", en: "[] (no cache)" },
}

const T = (key, params) => {
  const t = (TX[key] || { zh: key, en: key })[LANG]
  if (!params) return t
  return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, v), t)
}

const DESC = {
  analyze_image: {
    zh: "用多模态模型分析图片。先调 file_tool list-cache 拿到文件ID，再用 file_id:N 分析。",
    en: "Analyze images with multimodal model. Call file_tool list-cache first to get file IDs, then use file_id:N.",
  },
  file_tool: {
    zh: "文件缓存管理。当你在上下文中看到 [Image N] 或收到 Cannot read 图片错误时，立即调 list-cache 获取文件ID，再用 analyze_image file_id:N 分析。",
    en: "File cache manager. When you see [Image N] or a Cannot read image error, call list-cache to get file IDs, then use analyze_image file_id:N.",
  },
  file_tool_args: {
    zh: "list-cache, list-cache main, list-provider, set-provider <model>",
    en: "list-cache, list-cache main, list-provider, set-provider <model>",
  },
  analyze_args_source: { zh: "file_path=file_id:N", en: "file_path=file_id:N" },
  analyze_args_data: { zh: "file_id:N 或 base64", en: "file_id:N or base64" },
  analyze_args_prompt: { zh: "分析提示", en: "prompt" },
}

function getVisionConfig() {
  if (_visionCfg) return _visionCfg
  const cfg = existsSync(CONFIG_PATH) ? readJsonc(CONFIG_PATH) : {}
  _visionCfg = resolveConfig(cfg)
  return _visionCfg
}

function reloadVisionConfig() {
  const cfg = existsSync(CONFIG_PATH) ? readJsonc(CONFIG_PATH) : {}
  _visionCfg = resolveConfig(cfg)
}

function resolveConfig(fileConfig) {
  const model = fileConfig.model
  if (!model) throw new Error(T("config_error"))
  if (fileConfig.apiKey && fileConfig.apiBaseUrl) {
    const mId = model.includes("/") ? model.split("/").pop() : model
    return { apiKey: fileConfig.apiKey, baseURL: fileConfig.apiBaseUrl, modelId: mId, maxTokens: fileConfig.maxTokens || 4096, timeout: fileConfig.timeout || 60000 }
  }
  if (model.includes("/")) {
    const [provider, modelId] = model.split("/")
    try {
      const raw = readFileSync(OPENCODE_CONFIG, "utf-8")
      const oc = JSON.parse(raw)
      const prov = oc.provider?.[provider]
      if (prov?.options?.apiKey && prov?.options?.baseURL)
        return { apiKey: prov.options.apiKey, baseURL: prov.options.baseURL, modelId, maxTokens: fileConfig.maxTokens || 4096, timeout: fileConfig.timeout || 60000 }
    } catch {}
  }
  throw new Error(`无法解析模型配置: ${model}。请在 file-tool.jsonc 中配置 model (provider/modelId) 或 apiKey+apiBaseUrl+model`)
}

function readJsonc(path) {
  const raw = readFileSync(path, "utf-8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
  return JSON.parse(raw)
}

async function callVisionApi(imageUrl, prompt) {
  const vc = getVisionConfig()
  const resp = await fetch(`${vc.baseURL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${vc.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: vc.modelId, messages: [{ role: "user", content: [{ type: "text", text: prompt || "请详细描述这张图片的内容，返回格式: [文件名] 描述" }, { type: "image_url", image_url: { url: imageUrl } }] }], max_tokens: vc.maxTokens }),
    signal: AbortSignal.timeout(vc.timeout),
  })
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text().catch(() => "unknown")).slice(0, 200)}`)
  const data = await resp.json()
  const msg = data.choices?.[0]?.message
  return msg?.content || msg?.reasoning_content || "(空)"
}

// ====== 会话栈 ======
const SessionStack = {
  _stack: ["default"],
  _main: "default",
  push(id) {
    if (this._stack.length === 1 && this._stack[0] === "default") {
      this._main = id
    }
    this._stack.push(id)
  },
  remove(id) {
    const idx = this._stack.indexOf(id)
    if (idx >= 0) this._stack.splice(idx)
    if (this._stack.length === 0) this._stack.push("default")
  },
  get current() { return this._stack[this._stack.length - 1] },
  get main() {
    try { const v = readFileSync(join(CACHE_DIR, ".main-session"), "utf-8").trim(); if (v) return v } catch {}
    return this._main && this._main !== "default" ? this._main : "default"
  },
  remove(id) {
    const idx = this._stack.indexOf(id)
    if (idx >= 0) this._stack.splice(idx)
    if (this._stack.length === 0) this._stack.push("default")
  },
  get current() { return this._stack[this._stack.length - 1] },
}

// ====== 文件缓存：~/.opencode/plugins-cache/{sessionId}/files.json ======
function sessionDir(sid) { return join(CACHE_DIR, sid) }

function filesDir(sid) { const d = join(sessionDir(sid), "files"); if (!existsSync(d)) mkdirSync(d, { recursive: true }); return d }

function readSession(sid) {
  try { return JSON.parse(readFileSync(join(sessionDir(sid), "files.json"), "utf-8")) }
  catch { return { nextId: 1, files: {}, messages: [] } }
}

function writeSession(sid, data) {
  const dir = sessionDir(sid)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // 超出上限时异步删除最早的消息及文件
  let maxMsgs = 3
  try { const cfg = readJsonc(CONFIG_PATH); if (cfg.maxCacheMessages > 0) maxMsgs = cfg.maxCacheMessages } catch {}
  const msgs = data.messages || []
  if (msgs.length > maxMsgs) {
    const expired = msgs.splice(0, msgs.length - maxMsgs)
    for (const msg of expired) {
      for (const fid of (msg.fileIds || [])) {
        delete data.files[fid]
        const path = join(dir, "files", fid + ".b64")
        rm(path, { force: true })
        .then(() => {
          log.info(`${sid}: Deleted file ${path}`)
        })
        .catch((err) => {
          log.error(`${sid}: Failed to delete file ${path}`, err)
        })
      }
    }
  }
  writeFileSync(join(dir, "files.json"), JSON.stringify(data, null, 2))
}

function writeFileData(sid, fid, url) {
  // url 格式: "data:image/png;base64,iVBOR..."，只存 base64 部分
  const b64 = url.replace(/^data:\w+\/\w+;base64,/, "")
  writeFileSync(join(filesDir(sid), fid + ".b64"), b64, "utf-8")
}

function readFileData(sid, fid) {
  try {
    const b64 = readFileSync(join(filesDir(sid), fid + ".b64"), "utf-8")
    const meta = readSession(sid).files[fid]
    return `data:${meta?.mime || "image/png"};base64,${b64}`
  } catch {
    // 当前会话没有，尝试主会话
    try {
      const mainSid = SessionStack.main
      if (mainSid !== sid) return readFileData(mainSid, fid)
    } catch {}
    return null
  }
}

function deleteSession(sid) {
  const dir = sessionDir(sid)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}


export const FileTool = async () => {
  log.loaded()
  return {
    event: async ({ event }) => {
      if (event.type === "session.created" && event.properties?.sessionID)
        SessionStack.push(event.properties.sessionID)
      if (event.type === "session.deleted" && event.properties?.sessionID) {
        deleteSession(event.properties.sessionID)
        SessionStack.remove(event.properties.sessionID)
      }
      if (event.type === "message.part.updated" && event.properties?.part?.type === "file" && (event.properties.part.mime || "").startsWith("image/")) {
        const part = event.properties.part
        const fn = part.filename || part.name || ""
        if (fn) {
          const sid = event.properties.sessionID || SessionStack.current
          // 首次获取到真实会话ID时更新栈并记录主会话ID
          if (sid && SessionStack.current === "default" && sid !== "default") {
            SessionStack._stack = [sid]
            SessionStack._main = sid
            try { writeFileSync(join(CACHE_DIR, ".main-session"), sid, "utf-8") } catch {}
          }
          // 首次贴图也记录主会话ID（适配主会话未触发session.created的场景）
          if (sid && !existsSync(join(CACHE_DIR, ".main-session"))) {
            try { writeFileSync(join(CACHE_DIR, ".main-session"), sid, "utf-8") } catch {}
          }
          const data = readSession(sid)
          const fid = data.nextId++
          const msgId = part.messageID || ""
          // 添加到文件映射
          data.files[fid] = { id: fid, filename: fn, mime: part.mime, msgId }
          writeFileData(sid, fid, part.url || "")
          // 按消息分组
          const msgs = data.messages
          const last = msgs[msgs.length - 1]
          if (last && last.msgId === msgId) {
            last.fileIds.push(fid)
          } else {
            msgs.push({ msgId, fileIds: [fid] })
          }
          writeSession(sid, data)
        }
      }
    },

    tool: {
      analyze_image: tool({
        description: DESC.analyze_image[LANG],
        args: {
          source: tool.schema.enum(["file_path", "base64"]).describe(DESC.analyze_args_source[LANG]),
          data: tool.schema.string().describe(DESC.analyze_args_data[LANG]),
          prompt: tool.schema.string().optional().describe(DESC.analyze_args_prompt[LANG]),
        },
        execute: async ({ source, data, prompt }, context) => {
          let imageUrl, fileName = ""
          if (source === "file_path" && data.startsWith("file_id:")) {
            const fid = parseInt(data.slice(8), 10)
            const store = readSession(context.sessionID)
            let file = store.files[fid]
            if (!file && context.sessionID !== SessionStack.main) {
              const mainStore = readSession(SessionStack.main)
              file = mainStore.files[fid]
            }
            if (!file) { context.metadata?.({ title: T("meta_failed") }); return T("file_id_not_found", { id: fid }) }
            if (!file.mime.startsWith("image/")) { context.metadata?.({ title: T("meta_skip") }); return T("not_an_image", { name: file.filename, mime: file.mime }) }
            fileName = file.filename
            imageUrl = readFileData(context.sessionID, fid)
            if (!imageUrl) { context.metadata?.({ title: T("meta_failed") }); return T("file_data_not_found", { id: fid }) }
            prompt = prompt || T("describe_image", { name: fileName })
          } else if (source === "file_path") {
            if (!existsSync(data)) {
              const tryPath = join(context.directory, data)
              if (existsSync(tryPath)) data = tryPath
            }
            if (!existsSync(data)) { context.metadata?.({ title: T("meta_not_found") }); return T("file_not_found", { path: data }) }
            const ext = data.split(".").pop().toLowerCase()
            const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", bmp: "image/bmp", gif: "image/gif", webp: "image/webp" }[ext] || "image/png"
            fileName = data.split(/[/\\]/).pop() || ""
            imageUrl = `data:${mime};base64,${readFileSync(data).toString("base64")}`
          } else if (source === "base64") {
            imageUrl = `data:image/png;base64,${data.replace(/^data:image\/\w+;base64,/, "")}`
          } else { return T("unsupported_source", { source }) }
          try {
            const result = await callVisionApi(imageUrl, prompt)
            context.metadata?.({ title: `[Vision] ${fileName || T("meta_image")}`, metadata: { sessionID: context.sessionID, messageID: context.messageID } })
            return T("[Vision] ", "[Vision] ") + result
          } catch (e) { context.metadata?.({ title: T("meta_error") }); return T(`[Vision Error] ${e.message}`, `[Vision Error] ${e.message}`) }
        },
      }),

      file_tool: tool({
        description: DESC.file_tool[LANG],
        args: { command: tool.schema.string().describe(DESC.file_tool_args[LANG]) },
        execute: async ({ command }, context) => {
          const cmd = command.trim()
          if (cmd === "list-provider") {
            const cfg = existsSync(CONFIG_PATH) ? readJsonc(CONFIG_PATH) : {}
            const models = []
            const oc = JSON.parse(readFileSync(OPENCODE_CONFIG, "utf-8"))
            for (const [pName, pVal] of Object.entries(oc.provider || {}))
              for (const mId of Object.keys(pVal.models || {}))
                models.push(`${pName}/${mId}`)
            return T("current_model", {
              model: cfg.model || T("model_not_set"),
              list: models.map(m => "  " + m).join("\n"),
            })
          }
          if (cmd.startsWith("set-provider ")) {
            const model = cmd.slice(13).trim()
            if (!model) return T("specify_model")
            const cfg = existsSync(CONFIG_PATH) ? readJsonc(CONFIG_PATH) : {}
            cfg.model = model; delete cfg.apiKey; delete cfg.apiBaseUrl
            writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
            reloadVisionConfig()
            return T("model_switched", { model })
          }
          if (cmd === "list-cache" || cmd.startsWith("list-cache ")) {
            const arg = cmd === "list-cache" ? "1" : cmd.slice(11).trim()
            let targetSid = context.sessionID
            let limit = arg
            if (arg === "main") { targetSid = SessionStack.main; limit = "1" }
            if (arg.startsWith("main ")) { targetSid = SessionStack.main; limit = arg.slice(5).trim() }
            const data = readSession(targetSid)
            const msgs = data.messages || []
            if (msgs.length === 0) return `${targetSid}: ${T("no_cache")}`
            let count = msgs.length
            if (limit !== "all") {
              const n = parseInt(limit, 10)
              if (!isNaN(n) && n > 0) count = Math.min(n, count)
            }
            const show = msgs.slice(-count)
            let out = `${targetSid}:\n`
            for (const msg of show) {
              out += `  msg_${msg.msgId.slice(-8)}:\n`
              for (const fid of msg.fileIds) {
                const f = data.files[fid]
                if (f) out += `    ${f.filename}: ${f.id}\n`
              }
            }
            return out.trim()
          }
          return T("unknown_cmd", { cmd })
        },
      }),
    },
  }
}
