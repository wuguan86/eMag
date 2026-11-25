import asyncio
import logging
import os
import time
from collections.abc import Callable
from contextlib import asynccontextmanager, suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DailyServiceLogHandler(logging.Handler):
    def __init__(self, directory: Path, *, clock: Callable[[], datetime] = utc_now):
        super().__init__()
        self.directory = Path(directory).resolve()
        self.clock = clock
        self.directory.mkdir(parents=True, exist_ok=True)
        formatter = logging.Formatter('%(asctime)s UTC %(levelname)s %(message)s', '%Y-%m-%d %H:%M:%S')
        formatter.converter = time.gmtime
        self.setFormatter(formatter)
        self.prune()

    def prune(self) -> None:
        # 按 UTC 自然日保留当天及此前 29 天，仅清理本服务命名的日志。
        oldest_date = self.clock().date() - timedelta(days=29)
        for file in self.directory.glob('gpsr-????-??-??.log'):
            try:
                log_date = datetime.strptime(file.name, 'gpsr-%Y-%m-%d.log').date()
            except ValueError:
                continue
            if file.is_file() and log_date < oldest_date:
                file.unlink(missing_ok=True)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.prune()
            destination = self.directory / self.clock().strftime('gpsr-%Y-%m-%d.log')
            with destination.open('a', encoding='utf-8') as output:
                output.write(self.format(record) + '\n')
        except (OSError, ValueError):
            # 磁盘或权限故障通过日志系统报告，避免日志写入失败中断用户的品名请求。
            self.handleError(record)


async def prune_at_midnight(handler: DailyServiceLogHandler) -> None:
    while True:
        current = handler.clock()
        midnight = current.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        await asyncio.sleep(max(1, (midnight - current).total_seconds()))
        try:
            handler.prune()
        except OSError:
            logging.getLogger('uvicorn.error').warning('服务历史日志清理失败，请检查日志目录权限。')


@asynccontextmanager
async def service_logging():
    directory = Path(os.getenv('SERVICE_LOG_DIRECTORY', '').strip() or Path(__file__).resolve().parents[1] / 'logs')
    handler = DailyServiceLogHandler(directory)
    # 每个应用实例独立持有处理器，避免测试、多次创建应用或重载时重复写入日志。
    logger = logging.Logger('emag.gpsr', level=logging.INFO)
    logger.propagate = False
    logger.addHandler(handler)
    cleanup_task = asyncio.create_task(prune_at_midnight(handler))
    try:
        yield logger
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task
        logger.removeHandler(handler)
        handler.close()
