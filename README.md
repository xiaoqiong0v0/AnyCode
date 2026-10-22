# AnyCode

个人代码片段与工具集合。

## 目录结构

| 目录 | 说明 |
|------|------|
| `python/` | Python 工具脚本 |
| `opencode/` | OpenCode 配置与插件 |

---

## python/

### custom_dataclasses.py

DataClass 工具类，支持字段间联动赋值。

```
@dataclass
class DocumentConfig:
    page_size: Size = field(default_factory=lambda: PageSizeDefine.A4)
    margin: Rect = field(default_factory=lambda: Rect.lt_rb(2.5, 1.5))
    page_inner_size: Size = field(default_factory=lambda page_size, margin: Size(...))
```

`page_inner_size` 随 `page_size` 和 `margin` 改变而自动重新赋值。

### doc_win32_helper.py

WPS/Word COM 自动化辅助库，提供链式操作 API。

```
from doc_win32_helper import HelperSession, HelperStatic, HelperActions, WordSession
```

支持批量处理 Word 文档：目录更新、页码设置、表格标题重复等。

---

## opencode/

详见 `opencode/readme.md`。

包含 file-tool 插件，用于缓存并分析图片等文件，主模型不支持视觉时自动通过备用模型分析。
