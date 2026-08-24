# H₂ TestLens｜氢能测试智报

浦发·IGNITE 未来能源黑客松 · T02「设备测试数据分析与自动报告」作品原型。

[![Deploy H2 TestLens to GitHub Pages](https://github.com/lghui12138/h2-testlens-hackathon/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/lghui12138/h2-testlens-hackathon/actions/workflows/deploy-pages.yml) [![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-20bfa5)](https://lghui12138.github.io/h2-testlens-hackathon/) [![npm tests](https://img.shields.io/badge/npm-222%2F222-10b981)]() [![pytest](https://img.shields.io/badge/pytest-114%2F114-10b981)]()

## 公开演示

直接打开：[H₂ TestLens GitHub Pages](https://lghui12138.github.io/h2-testlens-hackathon/)

项目主页：[GitHub 仓库](https://github.com/lghui12138/h2-testlens-hackathon) · 发布状态：[GitHub Actions](https://github.com/lghui12138/h2-testlens-hackathon/actions/workflows/deploy-pages.yml)。GitHub 官方 Pages 地址会按仓库配置跳转到公开渲染域名：[lghui.top/h2-testlens-hackathon](https://lghui.top/h2-testlens-hackathon/)。当前自定义域名 HTTPS 证书尚未由 GitHub 配置完成，稳定代码入口仍是 GitHub 仓库。

Python/Excel 增强版：[`t02-equipment-test-report-assistant`](https://github.com/lghui12138/t02-equipment-test-report-assistant) — FastAPI + Python 骨架，含电流平台/稳定窗口/极化/绝缘/耐久/异常检测引擎、多源解析器、Markdown+Excel 报告生成与 CI。

这是浏览器网页原型：不需要登录，不上传原始 CSV；可以直接载入演示样本，也可以在浏览器内导入 CSV/TXT/Excel/DOCX。公开页面只提供工程分析和报告初稿，不替代标准认证、安全验证或企业放行签核。

## 一句话

把设备测试 CSV 变成工程师可以复核、可以行动的中文报告：自动识别工况分段，计算关键 KPI，给出异常证据和建议动作，并保留原始数据到结论的追溯关系。

当前交付版本：**v3.5.47**。本轮完成真实企业数据深度验证、易用性升级与 Pages 同步：青川 127 列电堆 CSV 字段映射闭环，压力 kPa/bar 语义统一与 kW→W 功率转换验证，38,257 行回归测试通过；企业 profile 合规边界明确（`example_unapproved` / `ENTERPRISE_PROFILE_REQUIRED`），enterprise adapter 深度绑定 profile fieldMapping。前端易用性增强：批处理队列增加总大小显示、失败文件移除按钮、解析错误提示；移动端 480px 断点优化、企业表格触摸滚动、按钮触控区域加大。集成测试与回归测试全部通过，`npm test` 当前为 **222/222** 全绿，Python 配套仓库 **114/114** 全绿。真实企业数据回归验证仍保持：青川科技 38,257 行电堆时序识别 61 个电流平台候选、氢质氢离 212/345 车识别 29/13 个绝缘窗口，且保持 `descriptive_only` 边界。GitHub Pages 站点独立项目页 [`projects/h2-testlens.html`](https://lghui12138.github.io/projects/h2-testlens.html) 同步更新。

交付形态：浏览器网页静态入口 `src/index.html` 与 Next/Vinext App 入口 `app/page.tsx` 均提供同一套分析功能；当前不包含原生 iOS/Android 安装包或原生设备能力保证。

网页与 App 的分离边界见 [`docs/WEB_AND_APP.md`](docs/WEB_AND_APP.md)：GitHub Pages 是评审和公开演示入口，Vinext App 是同一分析内核的可扩展应用入口；两者共用 `src/` 分析模块和样本/配置，不把原始 T02 数据提交到仓库。

标准实施边界矩阵见 [`docs/STANDARD_BOUNDARY_MATRIX.md`](docs/STANDARD_BOUNDARY_MATRIX.md)，逐项区分产品映射、缺失证据和不可宣称的结论。

公开分享卡片与 OG 元数据已随 GitHub Pages 构建发布，便于从 GitHub 或聊天工具打开时识别项目定位；分享预览不代表标准符合性结论。

每轮 GitHub 更新记录见 [`docs/GITHUB_ROUND_LOG.md`](docs/GITHUB_ROUND_LOG.md)。

v3.5.38 证据：`.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.38.json`、`.research/ignite_t02_standards_20260821/t02_reference_audit_v3.5.38.json`、`.research/ignite_t02_standards_20260821/t02_integration_report_v3.5.38.md`。

## 运行

```bash
npm test
npm start
```

然后打开 <https://127.0.0.1:4173>。本地分析不依赖外部服务；托管构建依赖仓库锁定的 Node 包。演示数据位于 `sample-data/`：标准样本、中文单位样本和基线样本分别覆盖单次分析、字段适配和批次对比。

## 使用示例

### 1. 分析单个 CSV 文件

启动本地服务器后，在浏览器打开 `http://127.0.0.1:4173`，将 CSV 拖入上传区域，或点击“载入演示样本”使用 `sample-data/test_run_001.csv`。页面会自动识别 `timestamp_s / phase / current_a / voltage_v / temperature_c / pressure_bar / flow_slpm / leak_ppm` 等标准字段，并计算电流平台、稳态窗口、极化统计和异常证据。

```bash
# 启动本地分析服务器
npm start
# 然后访问 https://127.0.0.1:4173
```

### 2. 解读分析结果

分析完成后，页面会展示以下核心证据：

- **工况分段**：`idle / ramp / steady / cooldown` 等阶段的起止时间、持续时长和样本数。
- **电流平台**：每个平台的目标电流、实际电流均值/极值/标准差、持续时间和样本数。
- **稳态窗口**：平台内满足容差要求的连续区间，默认自动选择最后一个合格区间，工程师可在界面中人工改选。
- **KPI 与风险**：峰值功率、稳态电压均值/标准差、峰值温度/压力、泄漏监测、压力漂移、绝缘阻值趋势和单片电压异常。
- **证据溯源**：每个 KPI 都绑定 `metricTrace`，包含 canonical 字段、 derivation 标签和行范围定位，原始行不上传。

> 注意：`descriptive_only` 模式下，所有数值均为描述性证据，不自动判定为安全阈值、标准符合性或企业放行结论。

### 3. 使用批次对比功能

批次对比用于将当前测试与基线或上一批次进行差异分析。通过本地 API 或浏览器批次面板均可触发：

```bash
# 方式一：浏览器批次面板
# 在多文件导入后，上传 config/batch-declaration.example.json 形状的企业批次声明，
# 页面会展示每文件的 READY/NOT_READY、实际中位采样间隔、声明偏差和边界问题代码。

# 方式二：本地 API 批次对比
curl -X POST http://127.0.0.1:4173/api/compare \
  -H 'Content-Type: application/json' \
  -d '{
    "baselineCsv": "'"$(cat sample-data/test_run_baseline.csv)'"",
    "currentCsv": "'"$(cat sample-data/test_run_001.csv)'"",
    "baselineFileName": "baseline.csv",
    "currentFileName": "current.csv",
    "includeReport": true
  }'
```

响应中的 `comparison` 对象包含：

- `verdictTransition`：基线判定 → 当前判定
- `kpiDeltas`：关键指标差值
- `newRisks` / `resolvedRisks`：新增与消除的风险项
- `reportMarkdown`：可下载的对比报告 Markdown

### 4. 导出报告

支持三种导出方式：

- **Markdown 报告**：点击页面中的“下载报告”或调用 API `POST /api/analyze?includeReport=true`，响应中的 `reportMarkdown` 字段即为完整中文报告，可直接保存为 `.md`。
- **Excel 报告**：企业资料解析后，页面会生成包含 14 个工作表的 Excel 文件（测试信息、参数、目标工况、质量检查、平台、稳定区间、极化数据、异常清单、处理日志等）。
- **JSON 证据包**：API 返回的 `metricTrace` 和结构化 `quality / issues / platforms` 可用于二次开发或存档。

```bash
# 导出 Markdown 报告（通过本地 API）
curl -X POST http://127.0.0.1:4173/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "csv": "'"$(cat sample-data/test_run_001.csv)'"",
    "fileName": "demo-run.csv",
    "includeReport": true
  }' | jq -r '.reportMarkdown' > demo-report.md
```

## GitHub Pages 独立部署

GitHub `main` 当前提交 `c00e582` 已由 Actions Run `32712931265`（页面 #101）成功构建/部署；部署 job 返回公开渲染地址 `https://lghui.top/h2-testlens-hackathon/`，自定义域 HTTPS/可达性仍属于外部配置状态。Pages workflow 已固定到官方 Node24 action SHA。

独立 GitHub 仓库为 `lghui12138/h2-testlens-hackathon`。`.github/workflows/deploy-pages.yml` 会在 `main` 推送后运行提交检查，并把 `_site/` 静态产物发布到 GitHub Pages；静态页面使用相对资源路径，适配项目站点 URL。Pages 准备阶段优先携带完整 release receipt；在 GitHub Actions 且缺少 receipt 时会自动执行 `npm run package:submission`，package smoke、ZIP 完整性或 SHA-256 任一失败都会阻断 Pages 准备。只有本地预览或非 Actions 模拟才使用 unbound/`not_run` 回退，不伪造云端 artifact 或正式标准证据。GitHub Pages 版本使用本地证据草稿回退，不依赖 ChatGPT API。

## 当前输入约定

标准 CSV 字段为：`timestamp_s, phase, current_a, voltage_v, temperature_c, pressure_bar, flow_slpm, leak_ppm`；也支持常见中文/别名表头，以及气体温度/压力、环境温度/湿度/气压字段，并自动换算 `ms/mA/mV/kPa/MPa/Pa/ppb/m³·h⁻¹/°F`。`phase` 可选，缺失时使用活动窗口回退。阈值在界面中可调整；当前值是演示用默认值，正式接入时应从企业测试标准或工单配置读取。

## 当前已实现

- 演示样本资源失败会显示可行动错误；电堆显式 mV 单片通道会先转换到 V，单位不明或不支持时保持空值并阻断相关统计。

- 本地 CSV 导入和演示样本加载
- 企业资料结构适配：车辆 `FC_*` CSV、中文电堆 CSV、GB18030/带明确 BOM 的 UTF-16 制表符 TXT 和原始时序 XLSX；支持多文件 CSV/TXT 批次导入；原始企业数据不进入仓库
- T02 实际解析覆盖审计：`npm run t02:coverage` 默认写入当前版本 `.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.38.json`，也支持显式输入/输出参数；对 198 个资料文件输出 SHA-256、实际原始数据解析器、参考审计要求和逐文件使用台账（当前 190 processed / 6 reference_only / 1 blocked_binary / 1 declared_no_upload）；新增证据深度分层为 143 `descriptive_interval`、13 `dynamic_event_only`、34 `generic_metrics_only`、8 `reference_boundary`、0 `formal_kpi`；7 个参考边界文件与独立参考审计逐文件交叉链接；车辆 46 列、电堆 127/422 列以“分析输入/交叉核对/目录保留”分层，并验证未分类字段与多角色冲突字段；耐久 8 份报告的跨报告筛查发现电堆型号不一致；真实 XLSX 公式 6,572/6,572 有缓存值，正式验收仍需人工公式复核证据；缺少企业目标参数时还输出 `inferred/descriptive_only` 候选区间，但不把候选、文件扫描或规则原型误写成标准符合
- T02 源资料完整性核对：`npm run t02:integrity -- "T02_SOURCE_ROOT" ".research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.38.json"` 重新计算当前目录全部文件的大小和 SHA-256，并校验审计根目录、记录数和路径唯一性；新增、缺失、变更或审计形状错配会失败并列出，不复制原始资料
- T02 参考资料内容映射：`npm run t02:reference` 默认写入当前版本 `.research/ignite_t02_standards_20260821/t02_reference_audit_v3.5.38.json`，也支持显式输入/输出参数；提取企业说明、车辆需求、青川任务说明书和产品背景 PDF/DOCX 的关键词与实现映射；当前 21/21 条声明关键词证据完整，若未来出现不完整项会单独阻断“完整复核”表述；不把参考资料正文复制进仓库，也不把企业需求误写成国家标准
- T02 全包报告：`npm run t02:report` 读取同版本覆盖/参考审计，生成 `.research/ignite_t02_standards_20260821/t02_integration_report_v3.5.38.md`，逐项列出 198 个文件、源 SHA-256、原始数据解析状态、参考内容审计状态、逐文件字段角色计数、字段用途矩阵和非符合性边界，并展示耐久跨报告可比性筛查；输入安全层对带明确 BOM 且解码后文本正常的 UTF-16 表格做兼容处理，无 BOM 的控制字节文件仍阻断
- 台架耐久 DOCX 报告解析：读取测试结果、目标功率点、平均单体电压、离均差、方差和冷却温度；可配置耐久预警阈值
- 飞书告警适配：默认 dry-run/JSON 预览，用户明确确认后才向企业批准的机器人 webhook 发送结构化文本
- 车辆性能趋势：目标电流段平均单体电压、离均差、方差和净功率的点位趋势与斜率参数
- 批次增量 manifest：保存文件名、大小、记录数、时间范围和 SHA-256，显示新增/变更/未变并写入本地历史与 Excel 处理日志
- 企业对象追溯与人工修改审计：profile 可要求 `testRunId/deviceId/testType/testDate/cellCount/activeAreaCm2/evidenceRef` 和结构化 `editLog`；缺失时 fail-closed，公共输出不包含操作者或旧/新值摘要
- 内部批次运行器：`npm run watch:batch -- --dir /approved/input --once` 可扫描新增/变更文件并生成 JSON、Markdown、Excel 报告；不加 `--send-alerts` 不外发
- 声明式跨文件批次汇总：`npm run watch:batch -- --dir /approved/input --batch-declaration /approved/batch-declaration.json --once`；未提供企业批次声明时不自动拼接文件，汇总固定为 `descriptive_only`
- 浏览器声明式批次核对：多文件导入后上传 `config/batch-declaration.example.json` 形状的企业声明；静态页和 Vinext 页共用 `src/batch-aggregation.mjs`，展示脱敏的 `READY/NOT_READY`、实际中位采样间隔、声明偏差、逐文件时间序列状态和边界问题代码
- 参数/目标工况 Excel 导入：按表头和参数代码读取“数据处理设定参数”“目标工况设定”，不依赖行号
- 目标工况逐参数证据：输出目标、上下偏差、实际均值/极值/标准差、绝对/相对偏差、超限时长/比例和正常/警告/异常/无法判定状态
- 计量比可追溯计算：缺少直接计量比时，按可配置片数、法拉第常数、标准摩尔体积和空气氧体积分数计算氢气/空气理论流量；常数和口径写入报告
- 企业 Excel 报告导出：测试信息、参数、目标工况、字段映射、质量检查、平台、稳定区间、极化数据、异常清单和处理日志等 14 个工作表
- 车辆运行态/上电态统计、目标电流段平均值、10 分钟绝缘最小值和 350/250 kΩ 趋势预警摘要
- 多文件会话边界：车辆目标电流段/绝缘窗口、电堆平台/稳定区间不跨文件拼接；车辆图支持左/右信号独立选择和独立缩放，并在报告/Excel 日志记录来源会话
- v3.5.4：电堆每个平台保留全部候选稳定区间；默认自动选择最后一个合格区间，工程师可人工改选其他合格区间，自动候选、人工请求、最终选择和无效回退均进入结果、报告、Excel“稳定区间”和“处理日志”。
- v3.5.5：大文件导入增加 `aria-live` 状态、逐文件让步和可回退模块化 Web Worker；分析保持完整行数，趋势图只对展示层做最多 6,000 点采样，并保留多文件会话边界。Worker 不改变判定、KPI、报告或原始数据哈希口径。
- v3.5.6：示例 PEM profile 声明 `supportedDatasetTypes: ["generic"]`，电堆/车辆数据误用时进入 `BLOCKED_PROFILE_SCOPE`；主配置与 `public/config` 做字节 parity 检查。
- v3.5.7：修复 GB/T 46104 流程模板重复声明“热启动结果”的配置缺陷，新增内置 profile 阶段证据唯一性回归；重新生成真实 T02 覆盖/参考审计，提交门为 76/76 测试、74/74 检查。
- v3.5.8：修正增湿罐水温不能冒充入口露点的字段语义；新增循环水电导率、增湿罐水温、工程量摘要的统计/核对证据；真实 T02 覆盖审计增加 heartbeat 和 DOCX 解析器懒加载，198 个文件重放完成；重新生成真实 T02 覆盖/参考审计和提交包。
- v3.5.9：统一静态页和 Vinext 页的多格式多文件入口；浏览器按需加载 XLSX/JSZip/Mammoth；PDF 和需求型 DOCX 作为参考资料保留，二进制文本进入阻断计数，不再让整批导入失败；公开页面补回企业适配面板和 XLSX 报告下载；真实 T02 覆盖/参考审计和 Vinext 生产构建均通过。
- v3.5.10：T02 审计新增逐文件使用台账、包级字段角色并集和“正式符合性声明数”检查；198 个文件均有明确的处理/参考/阻断边界，处理行仍为 2,262,283，正式符合性声明数为 0；同时修复 XLSX 空表头被误计为字段的问题。Vinext 生产构建已在升级依赖后通过；TypeScript 独立检查仍需单独优化，不能把它与生产构建混为一谈。
- v3.5.11：`approved` profile 新增与当前修订号绑定的审批证据门控；8 份耐久 DOCX 的 14 个表格字段和 8 个报告元数据字段进入使用台账，耐久结构化指标进入包级指标并集；缺失/不一致审批证据仍 fail-closed，不生成正式符合性声明。
- v3.5.12：`FULL_METHOD_IMPLEMENTED` 新增完整方法实施证据门控；方法来源、条款/步骤覆盖、逐项实施证据、验证人/日期/引用和空 `openGaps` 缺一不可；不完整证据保持 `NOT_READY / ANALYSIS_DRAFT`，不能进入 `HUMAN_REVIEW_PACKAGE`。当前回归门为 83/83 测试、4/4 AI、79/79 提交检查，T02 审计为 198/198 文件。
- v3.5.13：浏览器、T02 覆盖审计和 `watch:batch` 统一使用共享二进制输入检测；批处理器对二进制 TXT 写入 `blocked_binary` manifest/报告边界，不再把不可解析内容送入分析器；新增真实边界回归。
- v3.5.16：静态页和 Vinext 页接入声明式批次核对面板；浏览器调用 `validateBatchDeclaration`、`observeDeclaredBatch`、`summarizeDeclaredBatch` 和 `publicBatchAggregation`，不复制批次规则、不展开敏感标识，并保留每文件 session 边界。
- v3.5.16 门控：`npm test` 91/91、`npm run eval:ai` 4/4、`npm run check:submission` 86/86、API smoke、profile audit、Vinext build、静态站准备、ZIP 完整性和 SHA-256 回读通过；交付包为 `dist/h2-testlens-submission-v3.5.16.zip`。
- v3.5.17：T02 资料审计增加字段角色完整性证据（未分类/多角色冲突必须为 0）和参考声明关键词证据完整性摘要；当前 21/21 条声明关键词证据完整，仍不把关键词证据等同于标准全文或企业放行结论。
- v3.5.17 门控：`npm test` 92/92、`npm run eval:ai` 4/4、`npm run check:submission` 87/87、API smoke、profile audit、Vinext build、静态站准备、ZIP 完整性和 SHA-256 回读通过；最终包为 `dist/h2-testlens-submission-v3.5.17.zip`。
- v3.5.18：真实包 01 XLSX 的 8/8 工作表证据进入版本化 T02 审计，并由回归测试锁定；工作簿中的报告/身份/参数目录只作可追溯证据，不能冒充企业批准参数或标准验收限值。
- v3.5.18 门控：`npm test` 93/93、`npm run eval:ai` 4/4、`npm run check:submission` 87/87、API smoke、profile audit、Vinext build、静态站准备和 ZIP 完整性通过；最终包为 `dist/h2-testlens-submission-v3.5.18.zip`，SHA-256 由相邻 `.sha256` sidecar 记录。
- v3.5.19：修正企业适配器原始功率门控；电流×电压仍可用于明确标记的描述性 KPI，但不再满足 profile 的原始 `power_w` 要求，schema 同时保留派生证据和缺失原始通道状态。
- v3.5.19 门控：以 `npm test` 94/94、T02 真实覆盖/参考审计、AI grounding、提交检查、API smoke、profile audit、生产构建、静态站准备和提交包完整性为交付条件；标准符合性和企业验收仍不自动宣称。
- v3.5.20：企业车辆/电堆/耐久适配器统一接入企业批准的一阶 RSS 不确定度传播；`uncertaintyModelRequired` 在适配器、workflow、release gate、Markdown 和 Excel 路径一致 fail-closed；耐久功率点的 mV 标准差同步修正为 V。
- v3.5.21：无目标工况表时允许仅凭“数据处理设定参数”运行可配置的相对稳定性描述分析；结果进入页面、Markdown、Excel 和处理日志，但正式性能点、稳定点、极化点和符合性判定仍保持 fail-closed。
- v3.5.22：从版本化 T02 覆盖/参考审计生成全资料包接入报告，逐项列出 198 个文件、190 个适配器输入、参考/阻断/未上传边界、包级字段角色和标准边界。
- v3.5.23：在 approved profile 中加入测试对象追溯和人工修改审计门；缺少 `testRunId/deviceId/testType/testDate/cellCount/activeAreaCm2/evidenceRef` 或结构化 `editLog` 时保持 `NOT_READY`，公共 API、Markdown 和 Excel 处理日志只输出脱敏状态/计数；T02 机器证据同步到 v3.5.23。
- v3.5.24：把耐久跨报告可比性筛查从适配器接入真实 T02 覆盖审计、全包报告和提交检查；真实 8 份报告保留描述性状态，电堆型号不一致进入 `DURABILITY_COMPARABILITY_STACK_MODEL_MISMATCH`，不被解释为耐久等效性或标准符合。
- v3.5.25：把 7 个参考 PDF/DOCX 的独立内容审计与 198 文件覆盖台账按相对路径交叉链接，报告明确区分“原始数据解析器”和“参考内容审计”，提交门锁定参考边界文件 7/7 已关联；参考内容仍不进入时序 KPI。
- v3.5.26：新增源资料完整性核对器，逐文件重新计算当前资料目录的大小和 SHA-256，并对新增、缺失、变更文件 fail-closed；这证明版本化审计仍对应当前目录，但不改变原始数据、参考资料和标准符合性边界。
- v3.5.27：源资料完整性核对器新增审计根目录、记录总数和重复路径 fail-closed 校验，并补齐三类审计形状回归；T02 原始资料、参考内容和标准符合性边界不变。
- v3.5.38 当前实测：T02 三个示例 profile 固定为 `descriptive_only`、未审批和 `thresholds: null`；T02 车辆 profile 还要求单位证据，未声明 `V/mV` 时单体电压 KPI 留空；已声明物理单体电压时，归一化后的非正值从物理电压 KPI 排除而 raw 保留并计数；电堆阳极/阴极气体流量无标准状态单位或使用实际 `L/min` 时不进入计量比，直接 `UNIT_UNSUPPORTED` 阻断；静态网页、Next/Vinext App、API、`batch-watch` 和 T02 全资料覆盖审计均保持该模式，170 个车辆源文件进入动态设定变化描述分析；车辆时间计算按会话本地轴，正式功率验收拒绝派生功率；电堆逐片时序统计、实际电压功率交叉核算、逐行片数、排除区间证据和参数工作簿公式复核已进入报告/Excel/UI；出厂 XLSX 检测结果按表头定位并保留测量值数组，耐久图表按来源报告分组；T02 覆盖卡现在可下载前 5 个字段值复核重点的聚合 CSV，供企业确认字段语义/无效码，但不含原始行、不自动判定异常；公共 API 的质量会话摘要递归脱敏来源文件名，Excel workflow 也纳入 source/public parity；该分析按源文件/会话隔离，不执行阈值、验收、安全、符合性或放行判定。标准符合性、企业批准 profile、Excel/WPS 视觉验收和真实平行验证仍未完成。
- 2026-08-24 继续轮：六智能体进一步发现标准 ledger 需要逐项绑定 `standardRefs[]`，并修复实际及无单位流量被误当成 `SLPM` 的风险；现在每个运行时标准引用都绑定独立 source/evidence 与 canonical `standard_id`，缺少标准状态或温压基准的流量积分 fail-closed；电堆阳极/阴极计量比也不再接受实际 `L/Min`，单片 `mV` 先转换到 V。T02 全包报告新增逐文件 SHA-256、字段角色计数和前 5 个高风险字段明细，公开卡片可直接打开；混合批次显示 parser errors；XLSX/报告/基线空状态有反馈；演示样本失败有恢复提示；车辆状态 8 不再生成正式性能点；正式 standardRefs 缺少 runtime binding 时 fail-closed。当前门：`npm test` **180/180**、`npm run check:submission` **132/132**、typecheck、Vinext build 5/5、API smoke、AI 4/4；Run 86 云端 package smoke 已闭环，Pages 自定义域仍不可达。
- 电堆中文字段、单片电压通道、时间戳分辨率和通道数量一致性检查
- 电堆阳极/阴极/冷却回路流阻、冷却液温差和可用内阻字段的派生统计；计算关系写入字段映射与报告
- 企业专用图：车辆绝缘阻值与 350/250 kΩ 报警线、电堆有效极化点与短稳定点标记
- 数据完整率、功率、稳态电压稳定性、温度、压力、泄漏监测、压力漂移
- `idle / ramp / steady / cooldown` 等工况自动分段
- 高优先级风险、证据、建议动作三元绑定
- 中文报告 Markdown 与分析证据 JSON 下载
- 证据约束报告助手：默认本地生成，配置 `H2_AI_ENDPOINT` 后可接 OpenAI-compatible 模型；远程输出经过 verdict/证据锚点 guard
- 远程模型只接收 KPI、数据质量、分段和风险证据，不接收原始行；API key 只在服务端读取
- `npm run eval:ai` 提供 4 类离线 grounding 安全评估
- `npm run check:submission` 检查 T02 提交材料、测试和 AI 评估是否齐全
- `npm run package:submission` 在自检通过后生成可交付 zip
- 打包同时生成 `.sha256` 校验文件
- `npm run smoke:api` 验证 loopback CSV→结构化分析 API 且确认不返回原始行
- 当前批次与演示基线的 KPI 差值、判定变化、新增/消除风险
- 设备类型 profile：电解槽/燃料电池演示模板与当前会话自定义阈值
- 当前会话可导入企业 profile/字段映射 JSON 配置包
- 测试流程完成度清单：设备/方法、仪器与校准、数据质量、计算追溯、风险处置、人工签核
- 测试元数据可记录测试计划、数据采集计划、试验前检查、环境/安全条件、不确定度策略和原始数据引用/哈希；企业 profile 还可强制结构化采集记录（采样频率/同步/通道）与逐项前检查状态/证据引用
- 性能指标：产氢量（流量梯形积分）、电能消耗、单位制氢电耗、最低氢气纯度；profile 可强制要求纯度等测量字段
- 阶段指标：按 profile 对冷/热启动、稳态、动态、停机分别计算持续时间、电能、产氢量、单位电耗、功率范围和最大加/减载速率；存在原始 `power_w` 时优先使用并与电压×电流交叉核算；缺段或缺指标时系统阻断正式性能结论
- GB/T 46104-2025 流程模板可按冷启动、热启动、稳态、动态、停机别名核对工况覆盖；正式 profile 仍需提供企业批准的时长、速率、精度和验收规则
- 标准方法 profile 可独立要求测试系统组成、环境条件和阶段结果证据；这些门控不猜标准数值，不把通用 KPI 直接写成标准结果
- 标准方法 profile 可声明顺序化 `workflowSequence`，按阶段 id 逐项门控；报告字段可把执行者与资质/授权依据分开要求，测量方法可声明具体 `measurementFields`
- 正式 profile 需要设备适用范围、结构化仪器记录（id/类别/精度/校准引用）、验收规则和报告字段；缺任一项不能进入人工复核包
- `npm run profile:audit -- config/enterprise-profile.example.json` 可在接入前审计企业 profile 的标准、测量、测试段和不确定度配置
- enterprise profile 可声明适用数据集、车辆目标电流/持续时间和耐久预警规则；profile 与数据集不匹配时系统阻断分析
- 报告交付门控：`ANALYSIS_DRAFT` 表示资料/数据仍不完整；完整的公开标准流程证据可标记 `STANDARD_EVIDENCE_PACKAGE`；只有 profile 明确声明 `FULL_METHOD_IMPLEMENTED`、提交完整方法实施证据（标准来源、条款/步骤覆盖、逐项证据、验证人/日期、验证引用且无未关闭缺口），并同时绑定企业验收规则、仪器类别和有效不确定度模型、通过人工签核门控时才标记 `HUMAN_REVIEW_PACKAGE`
- 数据质量证据：记录实际采样间隔、计划/实际频率、时间缺口、时间轴正序性和阶段有效覆盖率；只有企业 profile 声明的规则才会阻断，不猜标准采样率或缺口限值
- 上传或载入 CSV 时浏览器自动计算 SHA-256，并写入当前会话的原始数据引用字段；哈希随报告/JSON 保存，原始行不上传
- 可展开查看每个 canonical 字段、原始表头和单位换算证据
- 本地批次历史：只保存 KPI、判定、profile 和风险摘要，刷新后仍可复核
- 键盘可操作的按钮、响应式布局、减少动效支持

## 重要边界

这是比赛原型，不把演示阈值当作企业安全标准，也不替代工程师签核。内置设备 profile 是演示模板，正式版必须替换为企业审批后的设备标准。本地历史只保存摘要，不保存原始测试行。没有配置模型服务时，报告初稿仍由本地结构化证据生成；配置远程模型时，建议使用企业内网或已审批的模型网关。

企业资料的本机盘点、真实字段适配和未完成项见 [`docs/ENTERPRISE_DATA_INTEGRATION.md`](docs/ENTERPRISE_DATA_INTEGRATION.md)。当前页面已经支持参数工作簿读取、Excel 报告导出、原生 OOXML 图表路径和耐久告警；仍需企业批准阈值、企业批次声明、跨文件时序验收、自动每日增量调度、企业 Feishu 凭据/策略、服务端审计和 Excel/WPS 视觉验收。

企业需求逐项验收矩阵见 [`docs/T02_REQUIREMENTS_MATRIX.md`](docs/T02_REQUIREMENTS_MATRIX.md)。

AI 网关配置与证据边界见 [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md)。
企业应用边界和逐项标准审计见 [`docs/ENTERPRISE_READINESS.md`](docs/ENTERPRISE_READINESS.md)。
输入解析器风险和工作簿大小边界见 [`docs/SECURITY_BOUNDARIES.md`](docs/SECURITY_BOUNDARIES.md)。
公开官方页面核对的完整测试流程与产品映射见 [`docs/STANDARD_WORKFLOW.md`](docs/STANDARD_WORKFLOW.md)。
参赛口径与现场演示顺序见 [`docs/SUBMISSION_BRIEF.md`](docs/SUBMISSION_BRIEF.md)；配置包示例见 [`config/enterprise-profile.example.json`](config/enterprise-profile.example.json)。
打包说明见 [`docs/SUBMISSION_PACKAGE.md`](docs/SUBMISSION_PACKAGE.md)。

## 真实企业数据回归验证

项目已用真实企业资料完成回归验证，不依赖演示样本替代证据。

- 青川科技电堆时序：**38,257 行**真实数据成功识别 **61 个**电流平台候选；**127 列**字段映射已完整闭环，温度/压力/电流/电压等核心通道全部命中 canonicals。
- 压力语义统一：`kPa` / `bar` 等不同压力单位已完成语义对齐，统计与告警口径保持一致，不因单位差异造成重复或遗漏判定。
- 功率转换验证：原始 `kW` 已按企业 profile 要求转换到 `W`，与电流×电压交叉核算通过，不把未经溯源的原始功率直接写进正式 KPI。
- 氢质氢离车辆数据：**212/345 车**识别出 **29/13 个**绝缘窗口，边界仍标记为 `descriptive_only`，不自动升级为标准符合性或企业放行结论。
- 相关证据保留在真实 T02 覆盖/参考审计与 `.research` 目录，供人工复核原始文件语义和字段映射。

## Profile 合规边界

当前版本对 profile 合规边界做了显式分层，避免把演示模板或未审批配置当成企业放行依据：

- `example_unapproved`：内置演示 profile 仅用于功能验证与现场评审，不替代企业批准的测试标准、仪器溯源、不确定度预算或签核。
- `ENTERPRISE_PROFILE_REQUIRED`：接入真实企业数据前，必须提供企业批准的 `profile`、`fieldMapping`、`target工况`、`instrument` 与 `editLog`；缺少任一项保持 `NOT_READY`，不生成正式符合性声明。
- 公共输出、Markdown、Excel 与 JSON 证据包均执行脱敏；操作者姓名、旧/新值摘要、原始行和企业敏感标识不会自动外发。

## 使用真实企业数据

接入真实企业资料时，建议按以下顺序执行，确保可追溯、fail-closed 且不泄露原始行：

1. 准备企业批准资料：`profile`、`fieldMapping`、参数工作簿、目标工况表、仪器校准引用、不确定度模型和授权人员签核记录。
2. 运行字段映射审计：`npm run profile:audit -- config/enterprise-profile.example.json` 检查标准、测量、测试段和 uncertainy 配置。
3. 本地导入与分析：在浏览器或 `npm start` 本地服务中导入 CSV/TXT/XLSX/DOCX；核心解析在本地完成，原始行不上传。
4. 复核证据包：检查 `metricTrace`、`fieldMapping`、单位换算证据和 `editLog`；缺失时保持 `descriptive_only` 或 `NOT_READY`。
5. 导出报告：Markdown、Excel 或 JSON 证据包仅包含脱敏摘要、KPI 和边界代码；正式放行必须附加企业人工签核。

> 注意：所有企业资料接入仍保持 `descriptive_only` 分析边界；标准符合性、安全认证、放行签核和最终验收需由授权机构独立完成。

## 计算准确性改进

本轮重点修复了数值鲁棒性和边界容差问题，降低浮点噪声和异常分段误判：

- 电流平台识别加入分箱容差，减少微小抖动造成的伪平台。
- 稳定窗口加入浮点容差，避免相邻候选在数值边界反复切换。
- 绝缘阻值过滤改为显式谓词，确保边界条件一致可解释。
- 性能趋势升级为 **Theil-Sen 鲁棒回归**，对异常点不敏感，斜率估计更稳定。
- 回归测试同步扩展，覆盖异常点、零值边界、单点区间和跨会话隔离场景。

## 边界测试覆盖

- 当前测试套件共 **210 条**测试，覆盖常规用例、边界条件和鲁棒性场景。
- 运行方式：`npm test`。
- 持续集成与提交检查会一起验证测试、AI grounding、Pages 构建和打包完整性。

## 企业级边界测试

本轮新增 **7 条**企业级边缘用例，进一步锁定真实企业数据中的异常文件与解析退化路径：

- 青川 **127 列**样本缺失单片电压列时，系统执行降级处理，不阻断整体分析，同时在报告中标记缺失证据。
- 氢质氢离样本中 `FC_MainSts` **全为同一有效状态**时，绝缘窗口统计仍按会话边界输出候选区间，不伪造额外状态变化。
- 极大压力值 **9999** 的峰值统计与告警：保留描述性峰值证据，按企业默认阈值输出警告，不自动升级为合规判定。
- **负电流值**处理与 `peakPowerW` 计算：对负电流执行显式过滤/标记，功率计算仅使用有效区间，避免符号错误污染 KPI。
- **时间戳乱序**时的 `nonMonotonicCount` 与 `TIME_SEQUENCE` 警告：识别乱序事件并计入质量证据，正式阶段判定仍保持 fail-closed。
- **重复表头名**的后列覆盖前列处理：同一列名出现多次时保留最后有效声明，并在字段映射与报告中显式记录覆盖关系。
- **混合逗号/制表符分隔**的解析容错：单文件内分隔符不一致时逐块识别并保留原始文本证据，不因格式噪声丢失整批记录。

## Python 增强版

配套 Python 增强实现位于独立仓库，提供 FastAPI 后端与更完整的工程分析骨架，当前测试门为 **114/114**：

[![Python Enhanced](https://img.shields.io/badge/Python%20Enhanced-t02--equipment--test--report--assistant-20bfa5)](https://github.com/lghui12138/t02-equipment-test-report-assistant) [![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688)](https://github.com/lghui12138/t02-equipment-test-report-assistant) [![CI](https://github.com/lghui12138/t02-equipment-test-report-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/lghui12138/t02-equipment-test-report-assistant/actions/workflows/ci.yml)

- 仓库地址：`https://github.com/lghui12138/t02-equipment-test-report-assistant`
- 包含电流平台/稳定窗口/极化/绝缘/耐久/异常检测引擎、多源解析器、Markdown+Excel 报告生成与 CI。

配套 Python 增强实现位于独立仓库，提供 FastAPI 后端与更完整的工程分析骨架：

[![Python Enhanced](https://img.shields.io/badge/Python%20Enhanced-t02--equipment--test--report--assistant-20bfa5)](https://github.com/lghui12138/t02-equipment-test-report-assistant) [![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688)](https://github.com/lghui12138/t02-equipment-test-report-assistant) [![CI](https://github.com/lghui12138/t02-equipment-test-report-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/lghui12138/t02-equipment-test-report-assistant/actions/workflows/ci.yml)

- 仓库地址：`https://github.com/lghui12138/t02-equipment-test-report-assistant`
- 包含电流平台/稳定窗口/极化/绝缘/耐久/异常检测引擎、多源解析器、Markdown+Excel 报告生成与 CI。

## 前端易用性

- 拖放上传：支持 CSV/TXT/Excel/DOCX 直接拖入浏览器窗口，自动触发解析与会话隔离。
- 快速启动引导覆盖层：首次打开时提供步骤提示，降低企业用户上手成本。
- 加载状态指示器：大文件导入、批次聚合和报告生成时展示进度与可回退状态。
- ARIA 标签：关键操作区域补全可访问性标签，保证键盘导航与屏幕阅读器可用。
- 移动端 44px 按钮：触控目标统一到 44px 以上，适配手机/平板现场评审场景。

## 贡献指南

欢迎以 issue、PR 或文档补遗的方式参与。建议流程：

1. 先阅读 [`docs/STANDARD_BOUNDARY_MATRIX.md`](docs/STANDARD_BOUNDARY_MATRIX.md) 和 [`docs/SUBMISSION_BRIEF.md`](docs/SUBMISSION_BRIEF.md)，确认边界口径。
2. 提交前运行 `npm test`、`npm run check:submission` 和 `npm run eval:ai`。
3. 若涉及企业资料、真实数据或测试门槛，请同步更新 `.research` 证据与 README 验证结果。
4. 标准/法规引用、企业 profile 配置或阈值变更，需要附上来源文件、版本号和审计记录。

## 许可证

本仓库当前未检出 `LICENSE` 文件；如后续补充开源协议，建议在根目录添加 `LICENSE` 并在本段引用文件名与适用范围。

## 标准化工作流边界

界面中的流程清单把公开标准资料转成可审计的输入/复核顺序，但不复制标准全文，也不自动宣称符合标准。只有企业批准的 profile、明确的方法版本、仪器/校准记录、计算引用和授权人员签核齐全后，系统才允许进入 `READY_FOR_HUMAN_REVIEW`；异常数据仍然需要工程师处置和必要的复测。
