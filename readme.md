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


#### python -> doc_win32_helper.py


```
from doc_win32_helper import HelperSession, HelperStatic, HelperActions, WordSession


def post_processing(file: str, ws: WordSession, name: str):
    helper_session = HelperSession(file, ws=ws)
    # 替换目录开头文字
    helper_session.add_action(
        lambda ds: HelperStatic.replace_mso_text(
            ds.first_section, 1, ['2023年', 'xxx'], ['2024年', name]
        )
    )
    # 跳转到目录末尾
    helper_session.add_action(HelperActions.to_index, lambda ds: ds.toc.Range.End)
    # 然后到下一页在回来保证在该页末尾
    helper_session.add_action(HelperActions.to_next_page)
    helper_session.add_action(HelperActions.to_index, lambda ds: ds.current_index - 1)
    # 插入分节符
    helper_session.add_action(HelperActions.insert_section_break)
    # 删除换行符直到上一页
    helper_session.add_action(
        HelperActions.while_page_not_change,
        lambda ds: HelperStatic.throw_if_false(
            HelperActions.delete_char_with_break(ds),
            '删除换行符失败'
        )
    )
    # 在当前节设置罗马数字的页码
    helper_session.add_action(lambda ds: HelperStatic.section_page_number(ds.current_section, " PAGE  \\* ROMAN "))
    # 跳转下一页
    helper_session.add_action(HelperActions.to_next_page)
    # 断开节链接
    helper_session.add_action(lambda ds: HelperStatic.section_link_previous(ds.current_section, False))
    # 在当前节设置页码
    helper_session.add_action(lambda ds: HelperStatic.section_page_number(ds.current_section))
    # 所有表格标题自动重复
    helper_session.add_action(HelperActions.tables_cross_page_repeat_header)
    # 更新目录
    helper_session.add_action(HelperActions.update_toc)
    # 更新页码对齐
    helper_session.add_action(HelperActions.update_toc_tab_stops)
    # 完成并执行
    helper_session.finish(False)


# 如果出现指针错误, 最好打开word后再执行
ws: WordSession = WordSession()
for name, file in all_file_names.items():
    abs_path = os.path.abspath(os.path.join(out_dir, file))
    post_processing(abs_path, ws, name)
ws.quit()
```
