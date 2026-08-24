# 安全边界与第三方解析器说明

## 当前可确认的控制

- 默认分析在浏览器本地完成；远程 AI 只接收结构化证据和存在性信息，不接收原始数据行。
- /api/ai-draft 只使用服务端环境中的 AI endpoint/model/key；客户端提交的同名字段会被忽略。远程 endpoint 必须是 HTTPS 且 hostname 必须命中 H2_AI_ALLOWED_HOSTS，上游请求有 15 s deadline 和 1 MiB 响应字节上限，超限或超时回退本地证据草稿。
- CSV/TXT 入口在进入文本解析器前执行 BOM、控制字节和二进制检测；二进制或无法确认编码的文件进入 `blocked_binary`。
- 文件哈希、文件大小、记录数和批次边界进入 provenance/manifest；历史只保存摘要，不保存原始测试行。
- 公共 analysis projection 会递归移除 `sourceFile/source_file/sessionId/session_id` 等质量与数据集来源标识；本地 manifest/历史仍可能保存用户选择的文件名，Feishu 外发前仍需企业批准的脱敏策略。
- `descriptive_only` T02 profile 不执行阈值、验收、安全、符合性或放行结论。
- 服务端 API 仅提供显式 JSON/CSV 分析入口；没有把原始 XLSX 自动上传到远程模型的路径。
- 原始时序/参数 XLSX 在进入 SheetJS 前统一执行 ZIP 容器预检：64 MiB 压缩输入、256 MiB 声明展开大小、2048 个 ZIP 条目和 200:1 压缩比上限；损坏目录、ZIP64、加密条目和不支持的压缩方法均阻断，不进入解析器。这些是资源保护参数，不是 GB/T、ISO 或企业验收限值。
- XLSX/XLSM 在 ZIP 目录层还检查 VBA 宏、ActiveX/OLE 嵌入对象和外部链接；发现后在 SheetJS 前阻断。公式单元格只做计数、风险特征和缓存值 provenance 审计，不保存原始公式文本，也不执行或重算公式。
- `src/` 与 `public/src/` 的浏览器运行时 parity 门包含 `excel-workflow.mjs`；source/public drift 会阻断提交，避免静态 Pages 与 App 生成不同的 Excel 证据表。

## SheetJS 边界

浏览器和本地批处理器复用 `src/vendor/xlsx.full.min.js`，运行时版本为 SheetJS 0.18.5 兼容 bundle。项目已经移除未使用的 npm `xlsx` 直接依赖，因此 `npm audit --omit=dev` 不再报告 npm 依赖树中的该项；这不等于 vendored JavaScript 已被 npm audit 或第三方安全评估覆盖。

因此当前工作簿策略是：

1. 只在本地或企业内网受控试运行中使用；不把公开 Pages 当作生产 XLSX 安全服务。
2. 不执行工作簿宏；Excel/WPS 视觉和恶意工作簿测试仍是企业上线前置条件。
3. 公式缓存值不自动视为重新计算结果；企业 `acceptance` 或 `FULL_METHOD_IMPLEMENTED` 路径必须填写 `testMetadata.formulaReviewEvidence`，绑定复核人、日期、证据引用、源工作簿哈希和复核决定（`cached_values_reviewed` 或 `recalculated_externally`）。
4. 正式生产前替换为企业批准并持续更新的解析器，或把解析放入隔离的最小权限服务/Worker，并继续补充公式/宏、原型污染、ReDoS 和真实恶意工作簿测试。
5. 解析器安全闭环完成前，报告只能是 `ANALYSIS_DRAFT` 或企业批准 profile 下的人工复核包，不能成为放行或安全判定依据。

这份说明是风险边界，不是 ISO 22734-1、ISO/IEC 17025 或任何软件安全认证证据。
