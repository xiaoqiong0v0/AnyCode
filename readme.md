#### python -> custom_dataclasses.py

```
@dataclass
class DocumentConfig:
    page_size: Size = field(default_factory=lambda: PageSizeDefine.A4)
    margin: Rect = field(default_factory=lambda: Rect.lt_rb(2.5, 1.5))

    page_inner_size: Size = field(default_factory=lambda page_size, margin: Size(
        page_size.width - margin.left - margin.right,
        page_size.height - margin.top - margin.bottom
    ))
```

page_inner_size 随 page_size 和 magin 改变而自动重新赋值
