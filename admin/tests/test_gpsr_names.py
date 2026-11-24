import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings


API = '/api/v1/gpsr/names'
AUTH = {'Authorization': 'Bearer service-test-token'}
SETTINGS = Settings('https://model.example/v1', 'test-model', 'model-test-key', 'service-test-token')
NAMES = {'zh': '女士罗纹吊带背心', 'ro': 'Maiou reiat cu bretele', 'bg': 'Рипсен потник с презрамки', 'hu': 'Bordázott pántos trikó'}


def make_client(handler):
    return TestClient(create_app(SETTINGS, model_transport=httpx.MockTransport(handler)))


def model_response(content):
    return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps(content, ensure_ascii=False)}}]})


def test_refine_forwards_name_and_language_with_server_credentials():
    name = '80-200斤吊带螺纹背心女大码修身外穿内搭打底衫无袖薄厂家直销'

    def handler(request):
        assert request.url == 'https://model.example/v1/chat/completions'
        assert request.headers['Authorization'] == 'Bearer model-test-key'
        body = json.loads(request.content)
        assert body['model'] == 'test-model'
        assert json.loads(body['messages'][-1]['content']) == {'name': name, 'sourceLanguage': None}
        return model_response({'name': NAMES['zh']})

    with make_client(handler) as client:
        response = client.post(f'{API}/refine', json={'name': name, 'sourceLanguage': None}, headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {'name': NAMES['zh']}


def test_translate_calls_model_once_and_reuses_original_for_source_target():
    requests = []

    def handler(request):
        requests.append(request)
        return model_response({key: value for key, value in NAMES.items() if key != 'ro'})

    with make_client(handler) as client:
        response = client.post(f'{API}/translate', json={'name': '  Maiou de damă  ', 'sourceLanguage': 'ro'}, headers=AUTH)
    assert len(requests) == 1
    assert response.status_code == 200
    assert response.json() == {**NAMES, 'ro': 'Maiou de damă'}


def test_health_authentication_and_invalid_inputs_do_not_call_model():
    def handler(_request):
        pytest.fail('无效请求不应调用模型')

    with make_client(handler) as client:
        assert client.get('/health').json() == {'status': 'ok'}
        valid = {'name': '背心', 'sourceLanguage': 'zh-CN'}
        assert client.post(f'{API}/translate', json=valid).status_code == 401
        assert client.post(f'{API}/translate', json=valid, headers={'Authorization': 'Bearer wrong'}).status_code == 401
        for route, invalid in [('translate', {**valid, 'sourceLanguage': None}),
                               ('translate', {**valid, 'sourceLanguage': 'fr'}),
                               ('translate', {**valid, 'name': '衣' * 161}),
                               ('translate', {**valid, 'name': 'Vest'}),
                               ('translate', {**valid, 'url': 'https://example.com'}),
                               ('refine', {**valid, 'name': '衣' * 2001}),
                               ('refine', {**valid, 'name': '  '})]:
            response = client.post(f'{API}/{route}', json=invalid, headers=AUTH)
            assert response.status_code == 422
            assert set(response.json()) == {'detail'}


@pytest.mark.parametrize(('status', 'expected'), [(429, 429), (401, 502), (500, 502)])
def test_maps_upstream_status_to_safe_error(status, expected):
    with make_client(lambda _: httpx.Response(status, text='private upstream error')) as client:
        response = client.post(f'{API}/refine', json={'name': '背心', 'sourceLanguage': 'zh-CN'}, headers=AUTH)
    assert response.status_code == expected
    assert 'private upstream error' not in response.text


def test_maps_model_timeout():
    def handler(request):
        raise httpx.ReadTimeout('private upstream error', request=request)

    with make_client(handler) as client:
        response = client.post(f'{API}/refine', json={'name': '背心', 'sourceLanguage': None}, headers=AUTH)
    assert response.status_code == 504


@pytest.mark.parametrize('content', [{}, {'ro': 'Maiou'}, {**NAMES, 'hu': ' '}, {**NAMES, 'hu': 'a' * 161}, {**NAMES, 'zh': 'Vest'}])
def test_rejects_incomplete_or_invalid_model_output(content):
    with make_client(lambda _: model_response(content)) as client:
        response = client.post(f'{API}/translate', json={'name': 'Vest', 'sourceLanguage': 'en'}, headers=AUTH)
    assert response.status_code == 502


@pytest.mark.parametrize(('language', 'source_key'), [('zh-CN', 'zh'), ('bg', 'bg'), ('hu', 'hu'), ('en', None)])
def test_translates_each_supported_language_and_preserves_source(language, source_key):
    original = NAMES[source_key] if source_key else 'Ribbed camisole'
    content = {key: value for key, value in NAMES.items() if key != source_key}
    with make_client(lambda _: model_response(content)) as client:
        response = client.post(f'{API}/translate', json={'name': original, 'sourceLanguage': language}, headers=AUTH)
    assert response.status_code == 200
    assert response.json() == NAMES


@pytest.mark.parametrize('content', [None, '', 'not json', '[]', '{"name": 5}'])
def test_rejects_malformed_model_response(content):
    upstream = {'choices': [{'message': {'content': content}}]}
    with make_client(lambda _: httpx.Response(200, json=upstream)) as client:
        response = client.post(f'{API}/refine', json={'name': '背心'}, headers=AUTH)
    assert response.status_code == 502


def test_accepts_fenced_model_json_and_rejects_multiline_name():
    fence = chr(96) * 3
    content = fence + 'json\n{"name":"女士背心"}\n' + fence
    upstream = {'choices': [{'message': {'content': content}}]}
    with make_client(lambda _: httpx.Response(200, json=upstream)) as client:
        assert client.post(f'{API}/refine', json={'name': '背心'}, headers=AUTH).json() == {'name': '女士背心'}
    with make_client(lambda _: model_response({'name': '女士\n背心'})) as client:
        assert client.post(f'{API}/refine', json={'name': '背心'}, headers=AUTH).status_code == 502


def test_config_requires_all_values_and_keeps_credentials_out_of_repr(monkeypatch):
    values = {'LLM_BASE_URL': SETTINGS.model_base_url, 'LLM_MODEL': SETTINGS.model_name,
              'LLM_API_KEY': SETTINGS.model_api_key, 'GPSR_API_TOKEN': SETTINGS.api_token}
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    loaded = Settings.from_environment()
    assert loaded == SETTINGS
    assert SETTINGS.model_api_key not in repr(loaded)
    assert SETTINGS.api_token not in repr(loaded)
    monkeypatch.delenv('LLM_API_KEY')
    with pytest.raises(RuntimeError, match='LLM_API_KEY'):
        Settings.from_environment()
