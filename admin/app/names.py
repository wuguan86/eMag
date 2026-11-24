import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator


SourceLanguage = Literal['zh-CN', 'ro', 'bg', 'hu', 'en']
TITLE_LIMIT = 2000
NAME_LIMIT = 160
TARGET_LANGUAGES = {'zh': '简体中文', 'ro': '罗马尼亚语', 'bg': '保加利亚语', 'hu': '匈牙利语'}
CHINESE = re.compile(r'[\u3400-\u9fff\uf900-\ufaff]')


def normalize_name(value: str, limit: int, *, single_line: bool = False) -> str:
    text = value.strip()
    # 浏览器输入框使用 UTF-16 长度，服务端沿用相同口径。
    if not text or len(text.encode('utf-16-le')) // 2 > limit:
        raise ValueError('品名为空或超过长度上限。')
    if single_line and ('\n' in text or '\r' in text):
        raise ValueError('品名必须为单行。')
    return text


class RefineRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    name: str
    source_language: SourceLanguage | None = Field(default=None, alias='sourceLanguage')

    @field_validator('name')
    @classmethod
    def validate_name(cls, value: str) -> str:
        return normalize_name(value, TITLE_LIMIT)


class TranslateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    name: str
    source_language: SourceLanguage = Field(alias='sourceLanguage')

    @field_validator('name')
    @classmethod
    def validate_name(cls, value: str) -> str:
        return normalize_name(value, NAME_LIMIT, single_line=True)

    @field_validator('source_language')
    @classmethod
    def validate_source_language(cls, value: SourceLanguage, info: ValidationInfo) -> SourceLanguage:
        if value == 'zh-CN' and 'name' in info.data and not CHINESE.search(info.data['name']):
            raise ValueError('请确认并选择正确的原文语言。')
        return value


class RefinedName(BaseModel):
    name: str


class TranslatedNames(BaseModel):
    zh: str
    ro: str
    bg: str
    hu: str
