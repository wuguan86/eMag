# 1.1.1 上架与打包说明

## 已接入的公开资料

- 运营主体为四川润林寰宇贸易有限责任公司。
- 公开联系邮箱为 591004761@qq.com。
- 品名服务沿用原发布包的 https://emag.toutouapp.cn。
- 模型服务按运营方确认填写为阿里云百炼／通义千问（qwen3.8-flash）。
- 运营方将品名和语言用于推理，运营方声明不将其用于模型训练。
- 自有服务应用日志配置为最近 30 个 UTC 自然日，更新服务后生效。第三方平台的数据保存规则按其服务条款和实际配置核实。

## 正式打包

在 `plugin` 目录运行以下命令。

~~~powershell
npm ci
npm run package
npm run test:release
~~~

打包流程会重新运行单元测试、lint 和生产构建，校验清单版本、图标、页面、共享模块、懒加载资源、隐私说明和许可，再生成 `release/eMAG-seller-toolkit-1.1.1-YYYYMMDD.zip`。ZIP 资源统一使用 `/`，`manifest.json` 位于根目录。只读取 `dist` 的产物，拒绝将源码、测试、环境文件、source map 和本地服务权限混入正式包。

`npm run test:release` 会实际解压生成的 ZIP，使用独立浏览器配置加载该目录，验证隐私入口、商品解析、保存、PDF/PNG 导出以及保存商品页面到模拟 1688 搜索页面的图片流程。测试页面与测试 PDF 使用样例资料。

首次运行浏览器验证需在同一 PowerShell 会话安装 Chromium。

~~~powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PWD 'tmp/browsers'
npx playwright install chromium
npm run test:release
~~~

独立校验现有压缩包可运行以下命令。

~~~powershell
npm run package:verify -- release/eMAG-seller-toolkit-1.1.1-20261125.zip
~~~

`npm run build` 仍用于开发及本地加载，正式交付使用 `npm run package`。版本号在 `package.json` 与 `manifest.json` 中保持一致。公开构建配置字段集中列于 `.env.example`，实际值放在 `.env.local`，模型密钥仅配置到服务器。

## 发布前还需运营方完成

1. 确定公开 HTTPS 隐私政策地址。构建已生成 `dist/privacy.html`，可连同 `dist/THIRD_PARTY_NOTICES.txt` 上传到公开网站的相同目录。政策页可独立访问和阅读。
2. 将该政策地址写入 `.env.local` 的 `VITE_PRIVACY_POLICY_URL`，重新执行 `npm run package`。检查公开页面中的运营主体、模型供应商和实际生效的日志政策。
3. 更新并重新部署 `admin` 服务，使新增的 30 天日志轮转与清理逻辑生效。应用日志目录默认为 `admin/logs`，Docker 中为 `/app/logs`，可通过 `SERVICE_LOG_DIRECTORY` 指定。部署日志说明见 `admin/README.md`。
4. 核实云平台、Nginx 或其他接入层已有的日志，以及阿里云账户实际使用地域、数据保存及训练相关配置。自有服务的清理仅覆盖应用日志目录下按日命名的 `gpsr-YYYY-MM-DD.log`。
5. 在商店开发者后台填写开发者资料、商品说明、支持邮箱、隐私政策链接、权限用途、数据处理披露，准备截图及审核操作说明，并进行真实站点回归。

## 商店介绍草稿

eMAG 卖家工具箱由四川润林寰宇贸易有限责任公司提供，面向使用中文的 eMAG 跨境卖家，辅助完成商品信息查看、1688 同款货源搜索、利润试算和 GPSR 标签制作。

主要功能包括读取 eMAG 罗马尼亚站当前商品信息，将商品主图提交 1688 搜索，按用户输入参数测算利润，以及整理和翻译标签品名、保存企业资料、导出标签 PDF 与 PNG。

本产品为独立第三方辅助工具。eMAG、1688 的商标归各自权利人所有。商品解析当前适配罗马尼亚站，利润参数与标签内容需要使用者按实际业务核对。

## 权限用途参考

| 权限或访问范围 | 用户功能 |
| --- | --- |
| storage | 本机表单、企业模板、试算参数和临时图搜任务 |
| activeTab、scripting | 用户主动导入时读取受支持商品页的标题 |
| sidePanel | 打开浏览器侧边栏表单 |
| www.emag.ro 内容脚本 | 商品页解析和卖家助手 |
| air.1688.com | 用户触发的图片上传及搜索 |
| detail.1688.com | 用户主动导入的商品标题 |
| emag.toutouapp.cn | 用户触发的品名提炼与翻译 |

## 真实站点回归

用正式包在浏览器重新加载后，至少完成以下操作并保留截图。

- 打开 eMAG 真实商品详情，检查标题、主图、售价、销售方及报价数量，切换商品后确认无旧数据残留。
- 点击图搜，确认真实 1688 页面收到图片且能搜索。遇到验证页时由用户完成验证，再继续操作。
- 分别从 eMAG 与 1688 商品页导入品名，检查短品名、三语翻译及中文对照。
- 编辑企业资料，关闭后重新打开确认保存，检查 PDF/PNG 文字、尺寸和条码。
- 从商品助手和独立侧栏打开“隐私与数据”，确认本机说明和配置后的公开政策地址可读。

自动化的受控页面回归已与真实站点验证分别记录，真实网站的验证结果以部署及回归时的实际页面为准。
