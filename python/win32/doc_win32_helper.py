import os
import shutil
from hashlib import md5
from typing import Callable, Any

import win32com.client as win32
from win32com.client import constants as consts

WORD_APP = "Word.Application"


class MsoType:
    msoTextBox = 17


def _md5(s: str):
    return md5(s.encode('utf-8')).hexdigest()


class HelperDocSession:
    def __init__(self, doc):
        self._doc = doc

    @property
    def doc(self):
        return self._doc

    @property
    def toc(self) -> Any:
        return self.doc.TablesOfContents(1)

    @property
    def selection(self) -> Any:
        return self.doc.Application.Selection

    @property
    def current_index(self) -> int:
        return self.selection.Range.End

    @property
    def current_page(self) -> int:
        return self.selection.Information(consts.wdActiveEndPageNumber)

    @property
    def first_section(self) -> Any:
        return self.doc.Sections(1)

    @property
    def current_section(self) -> Any:
        return self.selection.Sections(1)

    @property
    def current_first_section(self) -> Any:
        return self.selection.Sections(1)


class HelperStatic:
    @staticmethod
    def throw_if_false(b: Any, msg: str):
        if not b:
            raise Exception(msg)

    @staticmethod
    def section_link_previous(section: Any, link: bool):
        """设置与上一节的链接"""
        for header_footer_type in [consts.wdHeaderFooterPrimary, consts.wdHeaderFooterFirstPage,
                                   consts.wdHeaderFooterEvenPages]:
            header_footer = section.Headers(header_footer_type)
            if header_footer.Exists:
                header_footer.LinkToPrevious = link

            footer_footer = section.Footers(header_footer_type)
            if footer_footer.Exists:
                footer_footer.LinkToPrevious = link

    @staticmethod
    def section_page_number(section: Any, page_number_format: str = " PAGE  \\* ARABIC "):
        """设置页码"""
        # 添加页码到页脚
        footer_range = section.Footers(consts.wdHeaderFooterPrimary).Range
        footer_range.Text = ""
        footer_range.Fields.Add(
            Range=footer_range,
            Type=consts.wdFieldEmpty,
            Text=page_number_format
        )
        footer_range.ParagraphFormat.Alignment = consts.wdAlignParagraphCenter
        footer_range.Fields.Update()

    @classmethod
    def replace_mso_text(cls, section: Any, index: int, old_text: str | list[str], new_text: str | list[str]):
        """替换文本 msoTextBox"""
        i = 0
        for shape in section.Range.ShapeRange:
            if shape.Type == MsoType.msoTextBox:
                if i == index:
                    cls._replace_mso_text_frame(shape.TextFrame, old_text, new_text)
                    break
                i += 1

    @staticmethod
    def _replace_mso_text_frame(tf: Any, old_text: str | list[str], new_text: str | list[str]):
        if isinstance(old_text, str):
            old_text = [old_text]
        if isinstance(new_text, str):
            new_text = [new_text]
        txt = tf.TextRange.Text
        for o, n in zip(old_text, new_text):
            txt = txt.replace(o, n)
        tf.TextRange.Text = txt


class HelperActions:
    @staticmethod
    def update_toc(ds: HelperDocSession):
        """更新目录"""
        toc = ds.doc.TablesOfContents(1)
        if toc:
            toc.Update()

    @staticmethod
    def update_toc_tab_stops(ds: HelperDocSession):
        """更新目录右对齐位置"""
        toc = ds.doc.TablesOfContents(1)
        if toc:
            section = ds.doc.Sections(1)
            tab_position = section.PageSetup.PageWidth - section.PageSetup.RightMargin - section.PageSetup.LeftMargin
            for p in toc.Range.Paragraphs:
                f = p.TabStops(1)
                if f:
                    f.Position = tab_position

    @staticmethod
    def update_toc_number(ds: HelperDocSession):
        """更新章节编号"""
        toc = ds.doc.TablesOfContents(1)
        if toc:
            toc.UpdatePageNumbers()

    @staticmethod
    def to_index(ds: HelperDocSession, i: int) -> bool:
        if i < 1:
            return False
        if i > ds.doc.Range(Start=1).End:
            return False
        ds.doc.Range(Start=i, End=i).Select()
        return True

    @classmethod
    def to_next_page(cls, ds: HelperDocSession) -> bool:
        # 当前选择的页码
        ci = ds.current_index
        old_page = ds.current_page
        ni = ci + 1
        while True:
            if not cls.to_index(ds, ni):
                return False
            if old_page != ds.current_page:
                break
            ni += 1
        return True

    @classmethod
    def to_last_page(cls, ds: HelperDocSession) -> bool:
        # 当前选择的页码
        ci = ds.current_index
        old_page = ds.current_page
        ni = ci - 1
        while True:
            if not cls.to_index(ds, ni):
                return False
            if old_page != ds.current_page:
                break
            ni -= 1
        return True

    @classmethod
    def delete_char_with_break(cls, ds: HelperDocSession) -> bool:
        """删除字符 如果后面是换行符则删除换行符"""
        ci = ds.current_index
        nr = ds.doc.Range(Start=ci, End=ci + 1)
        txt: str = nr.Text
        # 换行字符光标是在前面
        if txt in ['\r', '\n']:
            nr.Delete()
            # 恢复选择位置
            cls.to_index(ds, ci - 1)
            return True
        if ci > 1:
            cls.to_index(ds, ci - 1)
            ds.selection.Delete()
            return True
        return False

    @staticmethod
    def insert_section_break(ds: HelperDocSession):
        """插入节分割符"""
        ds.selection.InsertBreak(consts.wdSectionBreakNextPage)

    @staticmethod
    def tables_cross_page_repeat_header(ds: HelperDocSession):
        """所有表格标题自动重复"""
        i = 0
        for table in ds.doc.Tables:
            try:
                table.Rows(1).HeadingFormat = True
            except:
                # 有合并的化不能设置
                pass
            i += 1

    @staticmethod
    def while_page_not_change(ds: HelperDocSession, func: Callable[[HelperDocSession], None]):
        cp = ds.current_page
        while cp != ds.current_page:
            func(ds)


class WordSession:
    def __init__(self, visible: bool = False):
        try:
            self._word = win32.GetActiveObject(WORD_APP)
            self._exist = True
        except:
            self._word = win32.gencache.EnsureDispatch(WORD_APP)
            self._word.Visible = visible
            self._exist = False

    @property
    def word(self) -> Any:
        return self._word

    def quit(self, force: bool = False):
        if not self._exist or force:
            # 关闭 Word 应用程序
            self._word.Quit()


class HelperSession:
    LAST_OUTPUT = '__LAST_OUT_PUT__'

    def __init__(self, file_paths: list[str] | str, ws: WordSession = None):
        if ws is None:
            ws = WordSession()
        self._ws = ws
        if isinstance(file_paths, str):
            self._file_paths = [file_paths]
        else:
            self._file_paths = file_paths
        # 启动 Word 应用程序
        self._exist = False
        self._actions = list[tuple[Callable[[Any], None], tuple]]()
        self._finish = False

    @property
    def ws(self) -> WordSession:
        return self._ws

    def add_action(self, func: Callable[[HelperDocSession], Any] | Callable[[HelperDocSession, ...], Any], *args: Any):
        """
        添加执行动作
        :param func: 执行动作 传入的第一个参数为 HelperDocSession
        :param args: 参数 当 callable 传递 HelperDocSession LAST_OUTPUT 表示上调命令输出
        """
        self._actions.append((func, args))

    def finish(self, quit_ws: bool = True):
        if self._finish:
            return
        self._finish = True
        for file_path in self._file_paths:
            # 打开文档
            doc = self.ws.word.Documents.Open(os.path.abspath(file_path))
            print(f"处理文档：{file_path}")
            doc_session = HelperDocSession(doc)
            last_output = None
            for func, args in self._actions:
                args_n = (
                    (
                        arg(doc_session) if callable(arg) else (
                            arg if args != self.LAST_OUTPUT else last_output
                        )
                    )
                    for arg in args
                )
                print(f"执行动作：{func.__name__}, 参数：{args_n}")
                last_output = func(doc_session, *args_n)
            doc.Save()
            doc.Close()
        if quit_ws:
            self.ws.quit()


if __name__ == '__main__':
    input_file = "./test/data/test_doc_win32.docx"
    copy_file = "./test/output/test_doc_win32_copy.docx"
    try:
        os.remove(copy_file)
    except:
        pass
    shutil.copyfile(input_file, copy_file)
    helper_session = HelperSession(copy_file, visible=True)
    # 替换目录开头文字
    helper_session.add_action(lambda ds: HelperStatic.replace_mso_text(ds.first_section, 0, '2023年', '2024年'))
    helper_session.add_action(lambda ds: HelperStatic.replace_mso_text(ds.first_section, 1, '2023年', '2024年'))
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
    # 只用更新页码
    helper_session.add_action(HelperActions.update_toc_number)
    # 完成并执行
    helper_session.finish()
