# opencode

OpenCode 配置与插件目录。可直接复制到 `~/.config/opencode/` 下使用。

## 目录结构

| 路径 | 说明 |
|------|------|
| `plugins/` | 本地插件（自动加载） |
| `plugins/lib/` | 插件公共工具库 |
| `plugins/lib/logger.js` | 文件日志工具，写入 `~/.opencode/plugins-log/` |
| `plugins/file-tool.js` | 文件缓存管理插件 |
| `file-tool.jsonc` | file-tool 插件配置（自动生成） |

## file-tool 插件

当用户粘贴文件（如图片）时，自动缓存到 `~/.opencode/plugins-cache/{sessionId}/`。

### 工具

| 工具 | 说明 |
|------|------|
| `file_tool list-provider` | 列出可用模型提供者 |
| `file_tool set-provider <model>` | 切换视觉分析模型 |
| `file_tool list-cache [all\|N]` | 查看缓存文件列表（默认最后1条消息） |
| `analyze_image file_id:N` | 用视觉模型分析指定缓存图片 |

### 使用方式

1. 将 `plugins/` 复制到 `~/.config/opencode/plugins/`
2. 重启 OpenCode
3. 首次 `set-provider` 时自动创建 `file-tool.jsonc`
