# AnyCode

个人代码片段与工具集合。**可脱敏、跨项目复用**的资产放这里。

与私有仓 reuse **同构**（同一条目规范、同一索引规矩）；**私有化 = 搬家到 reuse 并补业务上下文**，两处不并行维护第二份。

## 目录

| 目录 | 用途 |
|---|---|
| `general/` | 语言无关的通用资产，按类别分（见 `general/README.md`） |
| `cases/` | 经典案例，按问题域分（见 `cases/README.md`） |
| `pitfalls/` | 踩坑集，按工具 / 主题分（见 `pitfalls/README.md`） |
| `<语言>/` | 按语言分（`python/`、`java/`、`go/` …），**按需创建** |

各语言目录**按需创建**：该语言的首个条目出现时才建目录，并在上表补一行。

## 条目约定

- 路径：`<general|语言>/<类别>/<条目>`
- 一条 = **单文件自包含**，依次写清：做什么 / 依赖 / 用法 / 坑 / 验证 / 来源+日期
- 不写机器路径（本机用户名、盘符、个人检出路径一律不出现）
- 只声明可复现的最小依赖，不贴与本条无关的项目上下文

## 索引维护

新增 / 改名 / 删除条目，**必须同批**更新所在目录 README 的列表；先落文件后补索引视为未完成。

## 判定（宁私勿公）

| 内容 | 去处 |
|---|---|
| 可脱敏、跨项目可复用 | 本仓（AnyCode，GitHub 公开） |
| 业务逻辑 / 凭据形态 / 内网拓扑 / 客户信息 | reuse（私有） |
| 拿不准 | reuse |

## 检出与维护

检出与日常更新统一在 `~/.opencode/source-cache/<repo>/`，改完 commit 并 push；**不在别处维护第二份副本**。

## 现有条目

索引明细见各语言目录 README（`python/README.md`）。

### python/dataclass/custom_dataclasses.py

DataClass 工具类，支持字段间联动赋值。

```
@dataclass
class DocumentConfig:
    page_size: Size = field(default_factory=lambda: PageSizeDefine.A4)
    margin: Rect = field(default_factory=lambda: Rect.lt_rb(2.5, 1.5))
    page_inner_size: Size = field(default_factory=lambda page_size, margin: Size(...))
```

`page_inner_size` 随 `page_size` 和 `margin` 改变而自动重新赋值。

### python/win32/doc_win32_helper.py

WPS/Word COM 自动化辅助库，提供链式操作 API。

```
from doc_win32_helper import HelperSession, HelperStatic, HelperActions, WordSession
```

支持批量处理 Word 文档：目录更新、页码设置、表格标题重复等。

## 已迁出

`opencode/`（file-tool 插件等 OpenCode 配置与插件）已迁至独立仓库，本仓不再包含。
