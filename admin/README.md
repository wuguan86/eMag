# GPSR 品名服务

Chrome 扩展调用 FastAPI，FastAPI 通过兼容 OpenAI Chat Completions 的接口提炼商品原标题并翻译短品名。部署配置适用于个人或小团队，每次操作发送的业务数据为品名和原文语言。

## 本地运行

在 `admin` 目录执行以下命令，使用 Python 3.11 或更新版本。

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

配置模型供应商的 `LLM_BASE_URL`、`LLM_MODEL` 和 `LLM_API_KEY`。
`LLM_BASE_URL` 填供应商的接口基础地址，例如 `https://api.example.com/v1`，应用会追加 `/chat/completions`。
品名接口匿名开放给插件使用，`LLM_API_KEY` 仅保存在服务端。服务端不再需要插件访问令牌。
如果模型默认开启深度思考且接口支持 `enable_thinking`（例如 `qwen3.8-flash`），可在 `.env` 中设置 `LLM_ENABLE_THINKING=false`，缩短品名提炼和翻译的等待时间。留空时沿用模型供应商的默认行为。修改后重启服务。

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000 --no-access-log
```

在另一个终端检查服务并运行测试。

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
.\.venv\Scripts\python.exe -m pytest -q
```

## 云服务器部署

在云服务器的 `admin` 目录创建并填写 `.env`，将容器端口绑定到本机，由 Nginx 提供 HTTPS 公网入口。品名接口匿名访问，公网流量必须经过启用 IP 限流的 Nginx，不要直接暴露 Uvicorn 端口。

```sh
chmod 600 .env
docker build -t emag-gpsr-admin .
docker run -d --name emag-gpsr-admin --restart unless-stopped \
  --env-file .env -p 127.0.0.1:8000:8000 emag-gpsr-admin
curl -fsS http://127.0.0.1:8000/health
```

将下面的 Nginx 配置加入 `http` 上下文，例如放到由它加载的站点配置文件中。替换域名和证书路径，再用 `nginx -t` 检查并重新加载。API 每个客户端 IP 限 10 次/分钟，支持最多 3 个额外突发请求。

```nginx
limit_req_zone $binary_remote_addr zone=gpsr_api:10m rate=10r/m;

server {
    listen 443 ssl;
    server_name gpsr.example.com;
    ssl_certificate     /etc/letsencrypt/live/gpsr.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gpsr.example.com/privkey.pem;
    client_max_body_size 32k;
    access_log off;

    location = /health {
        proxy_pass http://127.0.0.1:8000;
    }

    location ~ ^/api/v1/gpsr/names/(refine|translate)$ {
        limit_req zone=gpsr_api burst=3 nodelay;
        limit_req_status 429;
        proxy_read_timeout 25s;
        proxy_pass http://127.0.0.1:8000;
    }

    location / {
        return 404;
    }
}
```

## 30 天应用日志

更新本次代码并重启服务后，品名服务按 UTC 日期将操作类型、成功状态或错误状态码及耗时写入 `logs/gpsr-YYYY-MM-DD.log`。默认保留当天及此前 29 个自然日，启动、请求写入以及每日 UTC 零点都会清理过期文件。应用日志字段仅包含固定操作描述、状态和耗时。

日志目录默认位于 `admin/logs`，可通过 `SERVICE_LOG_DIRECTORY` 设置。Docker 镜像已为非 root 应用用户准备 `/app/logs`。需要容器重建后延续日志时，可为该目录挂载命名卷。

~~~sh
docker run -d --name emag-gpsr-admin --restart unless-stopped \
  --env-file .env -p 127.0.0.1:8000:8000 \
  --mount source=emag-gpsr-logs,target=/app/logs emag-gpsr-admin
~~~

自有服务的清理范围为该目录下的 `gpsr-YYYY-MM-DD.log`。原有容器输出日志、Nginx 错误日志、云平台日志及模型平台的数据保存需要分别核实与配置。上方示例关闭了 Nginx 访问日志，Uvicorn 启动命令也关闭访问日志。将日志策略写入公开政策前应确认已在线部署并生效。

## 构建插件并联调

在 `plugin` 目录执行以下命令。正式部署填 HTTPS 站点根地址，本地联调可用 `http://127.0.0.1:8000`。

```powershell
$env:VITE_GPSR_API_ORIGIN = 'https://gpsr.example.com'
npm ci
npm run build
```

在 Chrome 加载或重新加载 `plugin/dist`，打开 eMAG 或 1688 商品页即可使用品名提炼和翻译，无需填写服务令牌。

打开一条 eMAG 或 1688 商品详情，点击「从当前商品导入」，检查原标题完整、短品名保留商品类别和必要规格，再点击「翻译并生成三语品名」，核对中文、RO、BG 和 HU。服务地址变更后重新构建并加载插件。

## 接口

| 请求                                  | JSON 输入                                  | 成功响应                             |
| ----------------------------------- | ---------------------------------------- | -------------------------------- |
| `GET /health`                       | 空                                        | `{"status":"ok"}`                |
| `POST /api/v1/gpsr/names/refine`    | `{"name":"商品原标题","sourceLanguage":"zh-CN"}` | `{"name":"短品名"}`                 |
| `POST /api/v1/gpsr/names/translate` | `{"name":"短品名","sourceLanguage":"zh-CN"}` | 包含 `zh`、`ro`、`bg`、`hu` 的 JSON 对象 |

两个 POST 接口匿名访问，由反向代理按客户端 IP 限流。提炼支持最长 2000 字符的标题，`sourceLanguage` 可填 `null`。翻译支持最长 160 字符的单行品名，原文语言可选 `zh-CN`、`ro`、`bg`、`hu`、`en`。如果原文语言与某个输出字段相同，该字段直接复用品名。
