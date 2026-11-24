import hmac
import logging
from collections.abc import Awaitable
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Annotated, TypeVar

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .model import ModelError, NameModel
from .names import RefinedName, RefineRequest, TranslatedNames, TranslateRequest
from .settings import Settings


logger = logging.getLogger('uvicorn.error')
bearer = HTTPBearer(auto_error=False)
NameResult = TypeVar('NameResult', RefinedName, TranslatedNames)


def create_app(settings: Settings | None = None, *, model_transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        config = settings or Settings.from_environment()
        async with httpx.AsyncClient(transport=model_transport, timeout=15) as client:
            application.state.api_token = config.api_token
            application.state.name_model = NameModel(config, client)
            yield

    application = FastAPI(title='GPSR 品名服务', lifespan=lifespan)

    def authorize(request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]) -> None:
        if credentials is None or not hmac.compare_digest(credentials.credentials.encode(), request.app.state.api_token.encode()):
            raise HTTPException(401, '服务访问令牌无效，请检查插件配置。', headers={'WWW-Authenticate': 'Bearer'})

    @application.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, error: RequestValidationError) -> JSONResponse:
        # 校验错误只返回字段提示，避免 FastAPI 的默认响应回显商品原标题。
        language_error = any(item['loc'][-1:] == ('sourceLanguage',) for item in error.errors())
        return JSONResponse(status_code=422, content={
            'detail': '请确认并选择正确的原文语言。' if language_error else '品名请求格式或长度无效，请检查后重试。',
        })

    @application.get('/health')
    async def health() -> dict[str, str]:
        return {'status': 'ok'}

    @application.post('/api/v1/gpsr/names/refine', dependencies=[Depends(authorize)])
    async def refine(payload: RefineRequest, request: Request) -> RefinedName:
        return await run_model('提炼', request.app.state.name_model.refine(payload))

    @application.post('/api/v1/gpsr/names/translate', dependencies=[Depends(authorize)])
    async def translate(payload: TranslateRequest, request: Request) -> TranslatedNames:
        return await run_model('翻译', request.app.state.name_model.translate(payload))

    return application


async def run_model(operation: str, result: Awaitable[NameResult]) -> NameResult:
    started = perf_counter()
    try:
        names = await result
    except ModelError as error:
        logger.warning('品名%s失败，状态码 %d，耗时 %.2f 秒。', operation, error.status, perf_counter() - started)
        raise HTTPException(error.status, str(error)) from None
    logger.info('品名%s完成，耗时 %.2f 秒。', operation, perf_counter() - started)
    return names


app = create_app()
