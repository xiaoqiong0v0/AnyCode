# python — 按类别

| 类别 | 一句话 | 条目 |
|---|---|---|
| `dataclass/` | dataclass 相关改造工具 | `custom_dataclasses.py` — 支持字段间联动赋值的 DataClass 工具类；`default_factory` 带参数即只读计算字段，依赖变化自动重算、构造期检测依赖环 |
| `win32/` | Windows COM 自动化 | `doc_win32_helper.py` — WPS/Word COM 自动化辅助库，`add_action` 链式批量处理文档（目录更新、页码、表格标题跨页重复等） |

新增类别 = 建 `python/<类别>/` 目录，并在此表补一行；该类别下的条目同批补索引（规则见顶层 README「条目约定」「索引维护」）。
