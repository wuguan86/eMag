import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    model_base_url: str
    model_name: str
    model_api_key: str = field(repr=False)
    model_enable_thinking: bool | None = None

    @classmethod
    def from_environment(cls) -> 'Settings':
        keys = ('LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY')
        values = {key: os.getenv(key, '').strip() for key in keys}
        missing = [key for key in keys if not values[key]]
        if missing:
            raise RuntimeError(f'缺少服务环境变量 {"、".join(missing)}。')
        try:
            url = urlsplit(values['LLM_BASE_URL'])
            valid_url = (url.scheme in {'http', 'https'} and url.hostname and not url.username
                         and url.password is None and not url.query and not url.fragment)
        except ValueError:
            valid_url = False
        if not valid_url:
            raise RuntimeError('LLM_BASE_URL 必须为模型 API 的 HTTP 或 HTTPS 基础地址。')
        thinking_option = os.getenv('LLM_ENABLE_THINKING', '').strip().lower()
        if thinking_option not in {'', 'true', 'false'}:
            raise RuntimeError('LLM_ENABLE_THINKING 必须填写 true 或 false，也可以留空。')
        return cls(*(values[key] for key in keys), model_enable_thinking=thinking_option == 'true' if thinking_option else None)
