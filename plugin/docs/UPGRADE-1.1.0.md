# 1.1.0 增量升级与验证

## 实现与兼容

界面继续使用现有 React、Tailwind/CSS 与 Shadow DOM；未增加第三方依赖。1688 后台消息协议、JPEG 转换、90秒会话任务、自动搜索与手动回退逻辑保持原实现。

商品解析新增 brandName、breadcrumbs、lowestOtherOfferRon 和来源标记；新增字段缺失不扩大原五项必需字段。品牌支持真实页面 logo alt、语义属性和属性表；最低价只来自当前商品其他报价区域，过滤推荐、旧价、隐藏和分期。换品证据限定为实际取值节点。未知品牌显示未识别；白牌按 OEM / Generic / Fără brand 归一化比较。

VAT快捷站点只更新参考税率；金额、当地费用及小额订单门槛仍用RON。佣金按面包屑从具体到宽泛匹配；旧全局佣金记录保留，但当前商品使用类目参考或独立手动覆盖。佣金参考表不代表合同费率。

现有固定/按重量头程保留。FBM/FBE各自保存当地费用；结汇损耗默认1.5%。小额门槛默认250RON，2%开关默认关闭，达到门槛不生效。计算分项在界面“查看计算口径”中展示。

企业主体保留原分字段键，模板保存副本；已保存草稿（包括空字段）优先，只有不存在主体草稿才应用默认模板。切换、删除模板不清空产品名称、Model与Batch；临时编辑不修改保存模板。

跨窗口套用企业模板以完整主体为单位接纳，优先于另一窗口未落盘的旧主体字段；普通单字段编辑仍以本窗口待保存输入优先。模板库单独同步，不随企业草稿冲突回写。支持“应用所选模板”，可重新恢复当前模板的完整保存内容。

警示语保留全部旧ID原文，新增general/electronics/under3/textile/custom；自定义文本独立校验字体。中文提示不印到标签、不阻断导出。PAP20与旧图标共用离线路径；标签正文最低5.5pt，预览/PDF共用布局、真实字形边界、固定尺寸及2mm边距。超容阻止导出并指出区域。

DoC五组参考仅由主动选择插入，仍可编辑且始终为草稿。反馈弹窗仅本地显示，微信/二维码预留配置为空。

## 新增本地数据

所有长期记录继续为 `emag:v1:` 前缀和 `{schemaVersion:1,value:...}` 信封，保留原字段数据。

企业模板整套应用时，四个主体字段信封增加可选的 `groupRevision`，使 Chrome 即使在地址或电话未变时也能发出整组变更。实际发送的企业字段另附可选 `writeId`，区分每次写入与迟到回声；本地编辑序号保留后续微调，普通远端同步直接接纳，有旧待写或在途写入风险时才修复磁盘。旧格式无需迁移，这些标记不改变字段值。

- `commission.<productId>`：当前商品手动佣金；null表示恢复自动匹配。
- `profit.market`、`profit.fulfillmentMode`：VAT参考站点与FBM/FBE模式。
- `profit.fbmLocalFeeRon`、`profit.fbeLocalFeeRon`：各自可编辑的当地费用。
- `profit.settlementLossRate`、`profit.smallOrderThresholdRon`、`profit.includeSmallOrderFee`：结汇损耗、门槛与附加费开关。
- `templates.euRep`、`templates.manufacturer`：独立模板库，含templates/defaultId/selectedId；模板项含id/name/company。
- `profile.customWarning`：自定义警示文本。`profile.icons`兼容新增pap20。

## 权限与配置

Manifest版本1.1.0；继续仅申请storage权限，主机访问限https://air.1688.com/*，eMAG仅www.emag.ro注入，1688仅原图片搜索路径注入，扩展CSP保持self。不新增后台服务、遥测或远程字体。

本地可维护配置：`src/config/commissionRules.ts`管理类目关键字及参考佣金，`src/config/declarationReferences.ts`管理DoC示例，`src/config/feedback.ts`预留微信和扩展内二维码路径。修改配置后重新构建加载。

## Chrome验证步骤

1. 在 E:/project/eMAG/plugin 执行 npm run check，产物为 dist；扩展管理页点击现有扩展“重新加载”，再刷新商品页。新安装选择“加载已解压的扩展程序”并选该dist目录。
2. 商品页确认类目、品牌、自营/品牌风险；其他报价可读时点击最低报价检查销售价填入。点击“🔍 一键1688搜同款货源”，验证原顶部上传与搜索流程，失败入口仍能下载JPEG。
3. 切换RO/HU/BG检查21/27/20%，手调VAT后普通刷新UI不覆盖；切FBE检查15RON参考费，切回FBM恢复其费用；勾选小额费，对照249.99/250/250.01RON及费用明细。
4. 两类主体分别保存两套模板，切换、设默认、临时编辑、跨GPSR/DoC/Popup同步并重开；确认草稿优先恢复且删除模板保留当前表单。
5. 选RO/EN警示与全部五图标导出70×40mmPDF；输入中文检查柔和提醒，输入超长地址检查超容阻止。分别导出50×30和100×100mm。打印选实际大小/100%，不适应纸张。
6. 主动选择DoC法规参考后继续编辑，导出检查每页DRAFT和末页完整签署区；反馈弹窗检查版本、待配置、Esc只关闭弹窗并恢复焦点。

## 自动验证

- npm run check：单元/组件测试、ESLint、TypeScript、正式构建。
- npm run test:browser：真实扩展加载，本地受控商品与1688夹具，覆盖图搜上传/搜索/JPEG回退、五模块交互与PDF下载。
- node scripts/saved-page-smoke.mjs：保存的真实Columbia页面离线回放，检查品牌/面包屑及既有图搜。
- node scripts/pdf-samples.mjs、捆绑Python scripts/pdf-verify.py、node scripts/pdf-preview-check.mjs：PDF毫米尺寸、完整文本、嵌入字体、矢量与真实字形边界；Poppler渲染后人工查看。

测试截图、PDF在test-results与tmp/pdfs。夹具和保存HTML回放不能证明在线eMAG动态页面或1688远程货源结果；本轮现场未验证的在线部分会在交付时明确说明。

## 本轮验收记录（2026-11-14）

- `npm run check`：22 个文件、210 项测试通过；ESLint 零警告；TypeScript 与 Vite 正式构建通过。
- 最终 `dist` 已通过 `npm run test:browser` 和保存真实商品 HTML 的回放：包含 1688 自动上传/搜索/JPEG 回退、模板与跨窗口草稿、VAT/FBE/小额费公式、警示与五图标导出、DoC 参考及反馈 Esc。截图包含 `upgrade-templates.png`、`upgrade-feedback.png`、`upgrade-profit.png` 与 `upgrade-label-70x40.png`。
- 商品/利润、企业模板/合规、PDF 三组独立复审通过。企业同步额外覆盖混合修订批、迟到自身事件与双窗口最终收敛，保留原失败复现断言。
- 11 份 PDF 校验通过：三种标签尺寸、长双语警示/五图标、自定义文字、1 页和 8 页 DoC；检查毫米尺寸、完整文本、字体嵌入、矢量图形与间距。Poppler 渲染和 Chromium 预览均检查过，无已确认裁切或重叠。
- Manifest 源文件与构建产物的版本、权限和 CSP 一致，版本为 1.1.0；源文件均未超过 500 行，生产与开发依赖均未变更。
- 后台、图搜消息协议、1688 内容脚本、PDF export/declaration 核心文件与实施前快照字节一致。当前目录没有 Git，原始快照保存在 `.superpowers/sdd/emag-upgrade/baseline.zip`。
