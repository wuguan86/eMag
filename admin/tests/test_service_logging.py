import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi.testclient import TestClient

from app.main import create_app
from app.service_logging import DailyServiceLogHandler
from app.settings import Settings


def test_pruning_keeps_recent_30_calendar_days_and_preserves_other_files(tmp_path):
    current = datetime(2026, 11, 25, 12, tzinfo=timezone.utc)
    recent = tmp_path / 'gpsr-2026-10-27.log'
    expired = tmp_path / 'gpsr-2026-10-26.log'
    unrelated = tmp_path / 'operator-notes.log'
    for file in (recent, expired, unrelated):
        file.write_text('保留期限测试', encoding='utf-8')
    handler = DailyServiceLogHandler(tmp_path, clock=lambda: current)
    assert recent.exists()
    assert not expired.exists()
    assert unrelated.exists()
    handler.close()


def test_rotation_and_quiet_period_cleanup_use_the_same_retention_rule(tmp_path):
    current = [datetime(2026, 11, 25, 23, tzinfo=timezone.utc)]
    handler = DailyServiceLogHandler(tmp_path, clock=lambda: current[0])
    record = logging.LogRecord('测试', logging.INFO, '', 0, '品名提炼完成，状态码 200。', (), None)
    handler.emit(record)
    current[0] += timedelta(days=1)
    handler.emit(record)
    assert (tmp_path / 'gpsr-2026-11-25.log').exists()
    assert (tmp_path / 'gpsr-2026-11-26.log').exists()
    current[0] += timedelta(days=30)
    handler.prune()
    assert not list(tmp_path.glob('gpsr-*.log'))
    handler.close()


def test_api_logs_status_without_product_text_or_model_key(tmp_path, monkeypatch):
    monkeypatch.setenv('SERVICE_LOG_DIRECTORY', str(tmp_path))
    settings = Settings('https://model.example/v1', 'test-model', 'private-model-key')
    transport = httpx.MockTransport(lambda _: httpx.Response(200, json={
        'choices': [{'message': {'content': '{"name":"测试背心"}'}}],
    }))
    with TestClient(create_app(settings, model_transport=transport)) as client:
        result = client.post('/api/v1/gpsr/names/refine', json={'name': '保密商品原标题', 'sourceLanguage': 'zh-CN'})
    assert result.status_code == 200
    output = '\n'.join(file.read_text(encoding='utf-8') for file in tmp_path.glob('gpsr-*.log'))
    assert '品名提炼完成' in output
    assert '保密商品原标题' not in output
    assert '测试背心' not in output
    assert 'private-model-key' not in output
