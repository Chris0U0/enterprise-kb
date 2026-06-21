"""
统一 HTTP 异常与校验错误响应体，便于前端按 `code` 分支（在保持 `detail` 兼容 FastAPI 默认形态的前提下）。

数据库瞬时断连（Docker 重启、VPN 闪断、WinError 10054 等）映射为 503，避免误导为业务 500。
"""
from __future__ import annotations

import errno
from collections.abc import Iterator

import asyncpg.exceptions as apg_exc
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, OperationalError

_CODE_BY_STATUS: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_SERVER_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
}


def _exception_chain(exc: BaseException) -> Iterator[BaseException]:
    seen: set[int] = set()
    cur: BaseException | None = exc
    while cur is not None and id(cur) not in seen:
        yield cur
        seen.add(id(cur))
        cur = cur.__cause__ or cur.__context__


def _is_transient_db_connectivity(exc: BaseException) -> bool:
    """建连/传输被掐断、服务端关闭等 — 与业务 SQL 错误区分。"""
    for e in _exception_chain(exc):
        if isinstance(e, (OperationalError, apg_exc.ConnectionDoesNotExistError, apg_exc.ConnectionFailureError)):
            return True
        if isinstance(e, apg_exc.CannotConnectNowError):
            return True
        if isinstance(e, (TimeoutError, ConnectionResetError, BrokenPipeError)):
            return True
        if isinstance(e, OSError):
            err = getattr(e, "errno", None)
            win = getattr(e, "winerror", None)
            if win in (10053, 10054):
                return True
            if err in (errno.ECONNREFUSED, errno.ECONNRESET, errno.EPIPE, errno.ETIMEDOUT):
                return True
    if isinstance(exc, DBAPIError):
        return _is_transient_db_connectivity(exc.orig) if exc.orig is not None else False
    return False


def _http_error_code(status_code: int) -> str:
    return _CODE_BY_STATUS.get(status_code, "HTTP_ERROR")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "code": _http_error_code(exc.status_code),
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "detail": exc.errors(),
                "code": "VALIDATION_ERROR",
            },
        )

    @app.exception_handler(DBAPIError)
    async def sqlalchemy_dbapi_handler(_request: Request, exc: DBAPIError) -> JSONResponse:
        if _is_transient_db_connectivity(exc):
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "数据库暂时不可用，请稍后重试（若使用 VPN，请对本机地址走直连）。",
                    "code": "DATABASE_UNAVAILABLE",
                },
            )
        return JSONResponse(
            status_code=500,
            content={
                "detail": "数据库操作失败。",
                "code": "DATABASE_ERROR",
            },
        )

    @app.exception_handler(apg_exc.ConnectionDoesNotExistError)
    async def asyncpg_conn_gone_handler(
        _request: Request, _exc: apg_exc.ConnectionDoesNotExistError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "detail": "数据库连接已中断，请稍后重试。",
                "code": "DATABASE_UNAVAILABLE",
            },
        )
