# 离线字体与标准标志来源

本工程没有远程字体请求。字体以 TTF 留存在 `src/assets/fonts`，由 `scripts/pdf-assets.py` 转成按需动态加载的 base64 模块。原字体总计约 4.02 MB，未压缩 base64 模块合计约 5.37 MB；实际 PDF 由 jsPDF 仅嵌入使用的字形子集。重新生成需要 Python 的 `fonttools`。

## 字体

| 文件 | 来源 | 许可与用途 |
| --- | --- | --- |
| NotoSans-Regular.ttf | [Noto Fonts，hinted TTF](https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf) | SIL OFL 1.1；拉丁及罗马尼亚文（含 Ș/ș/Ț/ț/Ă/ă/Â/â/Î/î）。完整许可保存为 `Noto-OFL.txt`。 |
| DroidSansFallback.ttf | [Android Open Source Project](https://github.com/aosp-mirror/platform_frameworks_base/blob/master/data/fonts/DroidSansFallback.ttf) | Apache 2.0；中文及其他 BMP 字形。完整版权与许可保存在 `Droid-NOTICE.txt`。 |

不假定任意 Unicode 都可打印：根据字体真实 cmap 检查每个字符。缺字、emoji、控制字符与不受支持的增补平面字符会阻止导出并提示，不会静默换成方框。预览 SVG 使用同一份字体、字体指标、逐字换行和坐标，所有用户输入均 XML 转义。

浏览器预览通过 FontFace API 将 base64 解码为 ArrayBuffer，并以 `EmagToolkitNotoSans` / `EmagToolkitDroidFallback` 专用字体名注册到当前文档；等待两种字体加载完成后才启用导出。Shadow DOM 内不使用 `@font-face`，也不发送 data URL 或远程字体请求。SVG 禁用 kerning/ligatures，并将每个字体片段的 `textLength` 固定为 PDF 指标宽度，修正浏览器小字号量化导致的累积误差。

## 矢量标志

现有四个标志于 2026-11-12 下载并核对 Wikimedia Commons `imageinfo/extmetadata` 许可元数据。保留原比例和轮廓，将 SVG 的曲线、圆和变换统一转换为三次贝塞尔路径；删除编辑器元数据及未使用定义，未重画或使用文字代替这四个标志。标准来源说明比例依据，Commons 页面说明下载资产的版权状态。单独使用这些图形不构成产品合规判定。

| 标志 | 下载与著作信息 | 规范依据 |
| --- | --- | --- |
| CE | [Conformité Européenne (logo).svg](https://commons.wikimedia.org/wiki/File:Conformit%C3%A9_Europ%C3%A9enne_(logo).svg)，MatthiasDD，Public domain | [Regulation (EC) No 765/2008，Annex II](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32008R0765)，按图形比例；本工程图形高度 5 mm。 |
| WEEE | [WEEE 2.svg](https://commons.wikimedia.org/wiki/File:WEEE_2.svg)，European Union / Biezl，Public domain | [Directive 2012/19/EU，Annex IX](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32012L0019)，带横杠的划叉带轮垃圾桶；本工程高度 7 mm。 |
| 0–3 岁禁玩 | [Age warning symbol.svg](https://commons.wikimedia.org/wiki/File:Age_warning_symbol.svg)，John Gustafsson，Public domain | [Directive 2009/48/EC，Annex V](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32009L0048)；EN 71-1 年龄警示图形，保留红色圈斜杠、婴儿轮廓和 0–3；本工程直径 10 mm。 |
| Triman | [Pictogramme TRIMAN decret 2014-1577 NOR DEVP1332154D.svg](https://commons.wikimedia.org/wiki/File:Pictogramme_TRIMAN_decret_2014-1577_NOR_DEVP1332154D.svg)，法国生态部，CC0 | [Décret n° 2014-1577 du 23 décembre 2014](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000029958212)，附件规范图形；本工程高度 6 mm。 |
| PAP20 | 本项目新增 `pap20.svg`：三箭头回收轮廓为项目绘制，数字 `20` 和缩写 `PAP` 使用上表 Noto Sans 字形转换的路径，沿用 SIL OFL 1.1 授权。无外部图片、位图或运行时文字依赖。 | [Commission Decision 97/129/EC，Annex II](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31997D0129)：瓦楞纸板材料识别为 `PAP` / `20`；该决定规定材料缩写与数字编码，不把此项目绘制的箭头作为其官方图样。本工程整体高度 8 mm，数字和材料缩写均可辨识。 |

CC0 文本：[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)。公共领域图形可能仍受商标或特定产品标识规则约束。Triman 的包装分类指示信息应按实际产品和适用回收组织规则另外确认，本工具仅提供用户选择的标志。

PAP20 仅适用于实际包装材料为对应瓦楞纸板的情况，不表示产品认证。五个图标的 PDF 路径和预览 SVG 均读取 `iconData.ts` 的同一份轮廓。运行 `python scripts/pdf-assets.py --icon pap20` 只更新 PAP20，不重生成字体模块或改写其他四个 SVG；`--icons-only` 重新转换全部图标而保留字体。转换器支持将字形的二次曲线统一转为三次曲线。

## 生成和验证

运行 `node scripts/pdf-samples.mjs` 会通过 Vite 的 Node 模块加载器调用实际 PDF API，在 `tmp/pdfs` 生成三种标签尺寸、四种新增双语预设、自定义中英罗警示、五图标 100mm 标签、短声明和长声明（多页）。同时输出预览 SVG 与 `label-manifest.json`（完整文字、实际字形包围盒、图标坐标和有效性），并验证两组超容内容被阻止导出。不需要浏览器环境。`createLabelPdf(profile)`、`createDeclarationPdf(profile,draft)` 返回 jsPDF 实例；调用 `output('arraybuffer')` 即可落盘。`buildDeclaration` 还提供每页文字与签署区坐标供验证。

运行 `node scripts/pdf-preview-check.mjs` 使用 `tmp/browsers` 的真实 Chromium，在 ShadowRoot 内渲染八组实际 LabelPreview（AV 字偶距、连字、中罗混排、100 mm 长行、五图标长警示、自定义警示、仅警示含中文及超容警示）。页面设置 `font-src 'none'`，验证二进制字体仍为 loaded，逐行比较 `getComputedTextLength()` 与 PDF 布局宽度，误差必须小于 0.1 mm；另检查字形边界、行间不重叠、图标间距与中文提示位于纸张外。浏览器 `getBBox()` 的整字体行框单独记录，实际墨迹边界读取同一离线 TTF 的 `glyf` 包围盒。指标与截图写入 `test-results/pdf-preview-metrics.json` 和 `test-results/pdf-preview-shadow.png`。`python scripts/pdf-verify.py` 再检查实际 PDF 的文字完整性、尺寸、字体嵌入、矢量图形和多页草稿。

标签尺寸固定为 50×30、70×40、100×100 mm，保留 2 mm 边距；正文按 7、6.5、6、5.5pt 自适应，尽量保留标题层级。实际字形包围盒约束四边，紧凑行距至少保留相邻轮廓 0.05mm 净空，文字区与独立图标区域至少相隔 0.5mm。未填产品名/型号/批次或任一公司名/地址/邮箱、缺字、警示控制字符或任何区域超容都会阻止下载；无效预览只绘制原尺寸空白纸，不截断文字、不缩小图标或放大纸张。电话选填。警示保留 `none/choking/adult/bag/electrical` 的历史语义，新增 `general/electronics/under3/textile/custom`；自定义文案可选字段 `customWarning` 兼容旧配置，并对实际选中的最终警示执行字体与字符校验。最终标签文字包含中文时仅在预览下方柔黄提醒，不阻断下载、也不把提醒印入标签。声明为 A4 英文草稿，每页有“草稿 / DRAFT”页眉；长段落自动分页，签署区整体保留同页且不生成签名图像。
