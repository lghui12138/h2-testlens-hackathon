# Standards alignment and compliance gate

这份说明把公开官方标准信息映射到 H₂ TestLens 的产品边界。它不是标准全文，也不是认证声明；正式部署必须由企业标准负责人确认适用范围、版本、测量方法和验收准则。

## Verified references

| 领域 | 官方参考 | 产品含义 |
|---|---|---|
| 水电解制氢安全 | [ISO 22734-1:2025](https://www.iso.org/standard/82766.html?browse=ics)；[GB/T 29729-2022](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=CD2CACD6BCF1403D48EF0508798A01A9) | 适用范围/安全 profile 不能与燃料电池共用 |
| PEM 电解槽性能 | [GB/T 45541-2025](https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB)；[官方解读](https://std.samr.gov.cn/search/videoDetailed?id=33D629C63896064EE06397BE0A0A07F1) | 现行；2025-07-01 实施。官方解读明确覆盖基本检查、基础测试、性能测试和测试报告；产品通过参数/profile/元数据/报告门控承接，不能代替完整试验方法 |
| 电解水制氢系统功率波动 | [GB/T 46104-2025](https://std.samr.gov.cn/gb/search/gbDetailed?id=3DBA213287120D16E06397BE0A0A8119) | 现行；2025-12-01 实施。测试计划、采集计划、试验前检查、稳态/动态/启停和报告字段进入 readiness 清单；功率波动执行器仍未接入 |
| 固定式燃料电池性能 | [GB/T 27748.2-2022](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=2D7DA5B2D9F4D55AB5E627A41BCDFA2D) | 燃料电池 profile 使用独立方法，不复用电解槽阈值 |
| 燃料电池安全 | [IEC 62282-2-100:2020](https://webstore.iec.ch/en/publication/59780)；[IEC 62282-3-100:2019](https://webstore.iec.ch/en/publication/59566) | 模块安全与固定式系统安全按对象区分 |
| 测试实验室可信度 | [ISO/IEC 17025:2017](https://www.iso.org/standard/66912.html) | 报告保留实验室/组织、仪器校准、执行者、计算和签核 provenance |
| AI 治理/风险 | [ISO/IEC 42001:2023](https://www.iso.org/standard/42001)；[ISO/IEC 23894:2023](https://www.iso.org/standard/77304.html) | grounding guard、fallback、评估和持续监测是风险控制，不等于认证 |

## Product gate

- `DEMO_ONLY`：内置/未审批 profile，只能输出规则分析和“需人工复核”，不能写“符合标准”。
- `NOT_READY`：profile 有标准引用但缺少审批状态、方法版本或测试元数据。
- `READY_FOR_HUMAN_REVIEW`：profile 已标记 approved，标准/方法/版本和测试元数据齐全；仍不替代人工签核。

## Complete workflow

1. 确定设备家族、应用范围、测试目的和适用标准/方法版本。
2. 准备测试计划、数据采集计划、仪器/校准、环境/安全条件和试验前检查；TestLens 现在将这些作为可填写、可门控的元数据字段。
3. 采集带时间戳、单位、通道来源和质量状态的原始数据。
4. 固定字段映射、单位换算、参数工作簿、平台/稳定窗口、公式、不确定度策略和原始数据引用/哈希。
5. 生成带峰值时间、图表数据、异常动作、标准引用和人工签核位的报告；企业批准模板可继续引用 14 个工作表生成正式图表。
6. 归档 profile、标准版本、数据摘要、模型路由、fallbackReason、测试元数据和批次对比；远程 AI 只接收元数据存在性，不接收人员/校准/原始数据引用值。

## Current implementation boundary

- 已实现：测试计划、数据采集、试验前检查、仪器、仪器精度/量程、校准、环境/安全、执行者、公式、不确定度、原始数据引用/哈希、人工签核字段及 `requiredMetadata` profile 校验。
- 已实现：完整 profile + 完整 provenance + PASS 运行可进入 `READY_FOR_HUMAN_REVIEW`；异常运行仍进入 `REVIEW_REQUIRED`。
- 已实现：对流量进行时间梯形积分得到产氢量，对电功率进行时间积分得到电能，并给出单位制氢电耗；纯度字段缺失时明确显示缺失，不用默认值填充。
- 已实现：企业 profile 可声明 `requiredMeasurements` 和 `acceptanceCriteria`；缺失测量或超过企业准则时阻断正式性能结论。
- 已实现：企业 profile 可声明 `requiredPhases`；输入数据缺少计划要求的稳态、动态或启停段时进入 `NOT_READY`。
- 已实现：浏览器对当前 CSV/TXT 批次计算 SHA-256，并把哈希写入 provenance；远程 AI 不接收原始 CSV 或哈希以外的测试元数据值。
- 已实现：参数/目标工况 Excel 按工作表名、表头和参数代码读取；无效参数工作簿会阻断正式平台/稳定区间处理。
- 已实现：生成 14 个工作表的 Excel 报告，保留有效参数、字段映射、质量检查、平台/稳定区间、异常和处理日志；目标/实际偏差含 Excel 公式并已通过零公式错误复算检查；耐久/极化报告追加标准 OOXML chart/drawing 结构，仍需企业 Excel/WPS 视觉验收。
- 已实现：profile 可提供 `first_order_rss` 不确定度模型；系统仅在模型存在时传播峰值、产氢量、电能和单位能耗不确定度，未配置时明确显示未配置。
- 未实现：企业批准的具体验收限值、测量不确定度计算规则、Excel/WPS 视觉验收、实验室/工单系统和正式电子签章。这些必须由企业资料包提供，不能由演示模板推断。

完整来源、证据和 claim ledger 位于 `.research/ignite_t02_standards_20260821/`。
