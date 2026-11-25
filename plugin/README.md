# eMAG 卖家工具箱

基于 Chrome Manifest V3、Vite、React 19、TypeScript 和 Tailwind CSS 4 的浏览器扩展。当前界面提供 eMAG 罗马尼亚站商品透视、1688 图搜、利润试算及 GPSR 热敏标签。

## 1.1.1 正式打包

在本目录配置 `.env.local` 后执行以下命令。公开配置字段见 `.env.example`，上架材料与服务部署事项见 [上架与打包说明](docs/STORE_RELEASE.md)。

~~~powershell
npm ci
npm run package
npm run test:release
~~~

`npm run package` 会依次检查正式服务配置、运行全部单元测试和 lint、重新构建，再生成 `release/eMAG-seller-toolkit-1.1.1-YYYYMMDD.zip`。脚本统一 ZIP 路径为 `/`，确认根目录 Manifest、图标、入口及懒加载资源完整，并附带隐私说明和第三方许可。打包使用上海时区的日期。

`npm run test:release` 直接解压并加载生成的 ZIP，检查商品页与独立侧栏中的隐私入口、表单保存、PDF/PNG 导出及保存商品页与模拟 1688 页面之间的图搜流程。浏览器依赖使用 `tmp/browsers`，首次运行可执行 `npx playwright install chromium`，并将 `PLAYWRIGHT_BROWSERS_PATH` 设为该目录。

可使用 `npm run package:verify -- release/具体包名.zip` 独立检查 ZIP。插件底部“隐私与数据”会打开随包 `privacy.html`，其内容根据公开配置生成。配置 `VITE_PRIVACY_POLICY_URL` 后会同时展示线上政策入口。

## 安装与加载

需要 Node.js 22.12+ 或 24+、npm，以及 Chrome 120+。

```powershell
cd E:\project\eMAG\plugin
npm ci
npm run build
```

1. 打开 Chrome 的 `chrome://extensions`，启用“开发者模式”。
2. 点击“加载已解压的扩展程序”，选择本目录下的 `dist`。
3. 打开 `https://www.emag.ro/商品名称/pd/商品编码/`，点击右侧“卖家助手”。
4. 工具栏扩展按钮提供独立的 GPSR 与 DoC 表单，无需停留在商品页。

开发时运行 `npm run dev`，首次仍需加载生成的 `dist`；更改 Manifest 后重新加载扩展和商品页面。正式使用前重新执行 `npm run build`。

品名提炼和翻译需要连接 [GPSR 品名服务](../admin/README.md)。构建前设置 `VITE_GPSR_API_ORIGIN` 为服务的站点根地址，重载插件后即可匿名调用，无需用户注册或填写服务令牌。公网部署须通过 Nginx 等反向代理限制请求频率，不能直接公开 Uvicorn 端口。

## 商品透视与利润

- 自动读取当前商品标题、主图、购买框售价、销售方和其他报价数量。优先使用当前商品 DOM，必要时从身份匹配的 JSON-LD 获取信息。
- 自营依据销售方名称识别，eMAG 配送不等于 eMAG 自营。其他报价数沿用页面口径，不表示已去重的卖家总数，也不包含当前购买框报价。
- 数据缺失显示“解析不全”；未识别数量显示“未识别”，不会用零值推断没有竞争者。页面尚无商品内容时显示“等待页面内容”，会在加载或验证完成后自动重试。字段状态稳定 2 秒后才记录日志，真正持续缺失的字段仍保留去重告警。可手工填写试算售价。
- 主图优先采用页面实际提供的高清地址，包括明确主图、缩放图、图库原图链接及 srcset；不会自行修改 CDN 尺寸或签名。点击“🔍 一键 1688 搜同款货源”会沿用自动上传、搜索及 JPEG 手动回退流程。
- 输入参数在失焦或按 Enter 后参与重算。VAT 可按 RO/HU/BG 参考值快捷切换；类目佣金自动匹配后仍可手调，按商品保存手动覆盖。所有金额仍统一使用 RON。

默认值：RO VAT 21%、1 RON = 1.58 RMB、未匹配类目佣金率 16%、头程单件运费 12 RMB、结汇损耗 1.5%；FBM 当地费用 0 RON、FBE 参考 15 RON。VAT 参考[欧盟官方税率表](https://europa.eu/youreurope/business/taxation/vat/vat-rules-rates/index_en.htm)，允许按商品适用情况修改，不提供自动实时税率服务。

```text
头程单件运费 = 固定金额，或 重量 kg × 每公斤费用 RMB
VAT税金 RON = 含税售价 − 含税售价 ÷（1 + VAT税率）
平台佣金 RON = 含税售价 ×（佣金率 + 生效的小额附加费率）
人民币净回款 =（含税售价 − VAT税金 − 平台佣金 − 当地费用）× 汇率 ×（1 − 结汇损耗率）
净利润 RMB = 人民币净回款 − 采购成本 − 头程单件运费
净利率 = 净利润 ÷（含税售价 × 汇率）× 100%
```

净利率 ≥20% 为“高利”，非负且不足20%为“微利”，负数为“亏损”。采购成本允许为零，但留空不会当作零成本计算。模型未包含仓储、广告、退货或其他自定义费用。

## 标签与声明

- 标签提供 50×30、70×40（默认）、100×100mm，页边距 2mm，正文不小于 5.5pt。
- 产品名、型号、批次号，以及双方公司的名称、地址、邮箱为必填；责任人电话选填。商品标题仅在点击导入按钮后覆盖产品名。
- 企业资料可包含中文，罗马尼亚语变音字符和中文使用离线内嵌字体。图标保持矢量，文字保持 PDF 文本。
- 预览和导出采用同一排版结果。超容会阻止导出并指出问题区域；不会缩成不可读文字、删除信息或偷偷更改尺寸。
- 五种图标默认不选中；Triman 标注法国市场，PAP 20 为纸盒材料识别。按产品实际适用性选择；图形的来源及许可见 `docs/ASSET_SOURCES.md`。
- DoC 使用独立 A4 草稿模板。法规、标准、地点、日期和签署人由用户填写；每页带“草稿 / DRAFT”标识，不生成签名或自动判断法规适用性。
- 打印请使用“实际大小”或“100%”，关闭“适合纸张”。表单生成结果需由使用者核对产品信息和适用要求。

## 隐私与权限

Manifest 申请 `storage` 权限，并为自动图搜限定 `https://air.1688.com/*` 站点访问。GPSR 品名导入使用 `https://detail.1688.com/*` 站点权限，点击导入按钮后才读取当前商品详情页的标题。自动注入的内容脚本匹配 eMAG 页面和 1688 图片搜索页，eMAG 界面及样式仅在详情页激活。

公司资料和参数存储于 `chrome.storage.local`，采购成本按商品编码保存。关闭并重开面板会恢复已保存内容。存储失败时输入保留在当前窗口，底部提示重试。独立开发预览使用浏览器 localStorage 代替扩展存储。GPSR 导入、提炼或翻译时，插件通过扩展后台向配置的服务发送本次使用的品名和原文语言。

点击“🔍 一键 1688 搜同款货源”会从商品图片站点读取图片，通过扩展本地消息暂存后交给 1688 图片搜索页自动上传并点击搜索。图片不会发送到扩展服务器，但会按用户操作提交给 1688。任务失败时扩展下载 JPEG 并显示手动回退说明。图片任务只在浏览器会话存储中保留 90 秒。


## 1.1.0 升级说明

- 商品透视新增品牌、类目面包屑、跟卖风险和可点击填价的最低其他报价；缺失品牌不判作白牌。
- RO/HU/BG 快捷项只切换 VAT 参考值，不新增 HU/BG 站点解析。类目参考佣金在 `src/config/commissionRules.ts` 维护，不代表卖家合同费率。
- 小额订单门槛默认 250 RON，可编辑；2% 附加费默认关闭，勾选后也仅在售价严格低于门槛时计入。固定/按重量头程计费继续可用。
- EU REP 与 Manufacturer 可分别保存、应用、删除及设置默认模板。当前企业草稿（包括已保存的空字段）优先恢复；微调不会改动模板副本。产品名称、Model、Batch 和企业资料继续在 GPSR/DoC、Popup/抽屉之间共享。
- GPSR 品名分别保存完整原标题、原文语言、可编辑的短品名及四种语言结果。从 eMAG 导入外文标题默认选择罗马尼亚语，中文标题识别为中文，其他来源无法确认时手动选择。导入会自动提炼短品名，也可手动触发提炼。点击「翻译并生成三语品名」后，使用短品名生成中文、RO/BG/HU 品名，短品名留空时使用原标题。修改品名或语言、重新导入时会更新关联字段，清空或编辑后迟到的响应会被忽略。
- 新增四组指定 RO/EN 警示、自定义警示、中文非阻断提示、PAP 20 图标。70×40mm 拥挤时自适应到 5.5pt；超容会阻止导出，不裁字或扩大纸张。
- GPSR 追溯码支持输入 12 或 13 位商品码，按原值生成 Code 128，保留前导零。
- DoC 的五组法规参考仅在用户主动选择时插入；保留免责声明与草稿标识。问题反馈与欧盟责任人咨询共用联系邮箱，构建前将环境变量 `VITE_SUPPORT_EMAIL` 设为公开邮箱地址即可。未配置时显示“待配置”。

详细修改、存储键与验收步骤见 [1.1.0 升级说明](docs/UPGRADE-1.1.0.md)。

## 目录

```text
src/content/       内容脚本、生命周期、Shadow DOM 挂载
src/components/    抽屉工作区、利润面板、标签与声明表单
src/popup/         扩展工具栏页面
src/storage/       按字段持久化、防抖、跨窗口同步
src/utils/         页面解析、价格及利润计算、PDF 与矢量资源
src/assets/fonts/  离线字体和授权文件
tests/             业务、存储、UI 生命周期及 PDF 测试
scripts/           浏览器冒烟、PDF 样张与图标生成工具
manifest.json      MV3 配置，CRXJS 生成最终资源映射
dist/              可加载的正式构建
```

## 验证

```powershell
npm run test
npm run lint
npm run build
```

浏览器冒烟使用本地测试页面模拟 eMAG 商品结构，故意设置有侵入性的全局样式，检查真实扩展加载、Shadow DOM、表单和 PDF 下载，不将夹具结果冒充真实站点验证。

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD\tmp\browsers"
npx playwright install chromium
npm run test:browser
npm run probe:emag
```

GPSR 品名冒烟在本机启动 API 夹具，验证扩展权限、实际消息通道以及 eMAG 和 1688 的品名流程。

```powershell
$env:VITE_GPSR_API_ORIGIN = 'http://127.0.0.1:8765'
npm run build
node scripts/gpsr-translation-smoke.mjs
node scripts/gpsr-layout-smoke.mjs
```

PDF 深入验证可运行：

```powershell
node scripts/pdf-samples.mjs
python scripts/pdf-verify.py
node scripts/pdf-preview-check.mjs
```

其中 Python 检查需要 `pypdf`；普通构建与单元测试不依赖 Python。字体和矢量资产已随源码打包，只有重新生成资源时才需要 `fonttools` 等资产处理依赖。

测试截图及浏览器生成的 PDF 位于 `test-results/`；临时文件和浏览器缓存位于 `tmp/`，均已加入忽略列表。

当前版本为 1.1.1。点击“🔍 一键 1688 搜同款货源”后会打开图片搜索页、准备 JPEG，并尝试自动使用顶部上传控件及点击图片卡片中的“搜索图片”。失败提示区分查找文件框和等待上传完成；有图片数据时可在提示中点击“下载 JPEG，手动上传”。

更新已有安装时，打开 `chrome://extensions`，对“eMAG 卖家工具箱”点击重新加载，再刷新商品页面。只刷新商品页不会加载磁盘上的新扩展代码。加载目录仍为 `E:\project\eMAG\plugin\dist`。

## 当前验证边界

1.1.0 本轮使用真实扩展和受控页面夹具验证自动上传、搜索提交、JPEG 失败回退、跨窗口表单和 PDF 下载；另对保存的 Columbia 商品真实 HTML 做离线回放，确认 159.99 RON、eMAG、其他报价 0、品牌 logo alt 和类目面包屑。回放不执行原站脚本，不请求站点接口。

本轮未重新验证在线 eMAG 动态请求、多报价真实节点、真实在线商品切换和 1688 远程货源结果。既往版本的现场记录见 `docs/IMPLEMENTATION.md`，不将旧记录或夹具结果作为本轮在线联调结论。

```powershell
node scripts/saved-page-smoke.mjs
```

如真实 1688 页面结构变化导致自动上传超时，可在状态提示中下载 JPEG，通过顶部“以图搜款”上传同一张图片进行对照。测试截图和 PDF 可在 `test-results/` 与 `tmp/pdfs/` 查看。
