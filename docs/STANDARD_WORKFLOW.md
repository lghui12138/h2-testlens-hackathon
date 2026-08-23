# H₂ TestLens 标准化测试流程映射

本文件记录产品当前可以从公开官方页面核对的流程要求，以及这些要求如何进入 profile、数据门控和报告。它不是标准全文，也不产生标准限值。

## 已核对的官方事实

| 来源 | 当前状态与范围 | 对产品的要求 |
|---|---|---|
| [GB/T 45541-2025](https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB) 及[官方解读课程](https://cc.sacinfo.org.cn/course?id=8a6dd87195662f6d01967c30f4685ed0) | 现行，2025-07-01 实施；官方解读公开描述基本检查、基础测试、性能测试和测试报告，并给出额定产氢压力 ≤10 MPa、单槽额定产氢量 1–500 m³/h 的适用范围；具体技术条款仍需标准全文或企业批准资料 | profile 必须声明设备家族、额定范围、方法版本和企业验收规则；超出范围不能自动形成符合性结论 |
| [GB/T 46104-2025](https://std.samr.gov.cn/gb/search/gbDetailed?id=3DBA213287120D16E06397BE0A0A8119) 及[国家标准项目技术内容](https://std.samr.gov.cn/gb/search/gbDetailed?id=FADA553B002CB31CE05397BE0A0A25A5) | 现行，2025-12-01 实施；适用于碱性和 PEM 电解水制氢系统功率波动适应性评价与测试；公开技术内容列出测试条件、试验计划、数据采集计划、试验前检查、仪器精度、电输入/气体输出/环境测量、冷/热启动、稳态、变功率动态、停机和报告字段 | 功率波动流程模板要求工况覆盖、测试计划、采集计划、前检查、结构化仪器证据、性能测量和报告字段；具体时间、精度、速率和验收值必须来自企业批准 profile/标准全文 |
| [ISO 22734-1:2025](https://www.iso.org/standard/82766.html?browse=ics) | 水电解制氢设备/系统安全要求；2025-07 发布 | TestLens 只能记录安全前置条件和风险证据，不能替代安全设计、联锁、危险分析或验证 |
| [GB/T 29729-2022](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=CD2CACD6BCF1403D48EF0508798A01A9) | 氢系统安全基本要求，现行 | 作为企业安全 profile 的引用来源，不把摘要转成默认阈值 |
| [ISO/IEC 17025:2017](https://www.iso.org/standard/66912.html) | 测试和校准实验室能力、公正性和一致运行；ISO 页面显示 2023 年复核确认仍为现行 | 产品保存仪器、校准、执行者、计算和签核证据，但不声称实验室认可或替代质量体系 |

## 产品执行顺序

1. 选择设备家族、适用标准和企业方法版本。
2. 核对设备范围；缺少或超出额定范围时进入 `NOT_READY`。
3. 记录测试目的、测试计划/工况序列、数据采集计划、试验前检查、环境/安全条件和原始数据引用。
4. 如果 profile 声明 `acquisitionRequirements`，再提供结构化 `testMetadata.acquisitionRecord`：采样频率、同步状态/时钟引用、通道 `field/channelId/unit` 和证据引用；系统只核对证据是否齐全，不猜测标准采样率或精度。
5. 如果 profile 声明 `preCheckRequirements`，再提供结构化 `testMetadata.preCheckItems`：每个项目的 `id/status/evidenceRef`；缺项、非通过状态或缺证据引用会阻断正式门控。
6. 如果 profile 声明 `requiredTestStages`、`testConditionRequirements`、`measurementMethodRequirements` 或 `efficiencyRequirement`，再提供结构化 `testMetadata.testStages`、`testConditions`、`measurementMethodRecords` 和 `efficiencyRecord`/`efficiency_pct`。缺少测试阶段、测试场所/环境/系统配置/异常处置、方法引用或批准效率结果时进入 `NOT_READY`；系统不猜标准条件、仪器精度、效率公式或限值。
7. 提供结构化仪器记录：`id`、`category`、`accuracy`、`calibrationRef`；缺少 profile 要求的仪器类别时阻断正式门控。
8. 导入原始数据，核对时间轴、字段映射、单位、数据完整率和工况覆盖；功率波动 profile 还会硬性核对官方公开技术内容列出的电输入（电压、电流、电功率）、气体输出（流量、纯度、温度、压力）和环境条件（温度、湿度、气压）测量字段，并对冷启动、热启动、稳态、动态和停机分别计算阶段证据。原始 `power_w` 通道存在时，电功率和能耗优先使用该通道，并与电压×电流独立交叉核算；普通演示数据无原始通道时才使用明确标记的派生功率。46104 profile 缺失原始功率通道时进入 `NOT_READY`，不会仅凭采集计划放行。
9. 按 profile 计算 KPI、企业验收规则和不确定度。阶段 KPI 使用时间序列梯形积分：持续时间、电能、产氢量、单位制氢电耗、功率范围和最大加/减载速率；没有企业批准的验收规则时不得把演示阈值当作符合性判断。效率只能采用实测 `efficiency_pct` 或企业批准的效率结果记录，不从已有 KPI 反推。
10. 如果 profile 声明 `FULL_METHOD_IMPLEMENTED`，必须同时提供 `methodImplementationEvidence`：标准/方法来源、条款或步骤覆盖项、每项实施证据、验证人、验证日期、验证引用和 `openGaps: []`；对于带标准引用的完整方法 profile，还必须声明企业验收规则、仪器类别要求、`uncertaintyModelRequired: true` 和有效的不确定度模型。任一项缺失时降为 `NOT_READY`/分析草稿。`PUBLIC_SCOPE_MAPPING` 和 `ENTERPRISE_PROFILE_REQUIRED` 不要求伪造完整实施证据，并保持标准流程证据包边界。
11. 生成包含目的、仪器/设备、执行者、执行者资质/授权依据、计算方法、图表、异常证据、结论和人工签核字段的报告初稿。
12. 只有 `approved profile + scope + instrument evidence + acquisition evidence + pre-check evidence + acceptance rules + usable data + complete workflow + method implementation evidence when FULL + full-method prerequisites when FULL + human signoff` 全部满足，才生成 `HUMAN_REVIEW_PACKAGE`；完整方法前置证据包括企业验收规则、仪器类别和不确定度模型；它仍然需要授权测试负责人最终签核。

数据质量证据还会保留实际采样间隔统计、计划/实际频率差异、时间缺口和阶段有效覆盖率。缺口上限、采样一致性和阶段连续性只有在企业 profile 明确声明时才进入阻断门控；系统不会从公开标准摘要推导这些数值。

`workflowSequence` 会把公开流程逐项展示为顺序门控；其中测试阶段步骤按自己的 `id` 查找 `testMetadata.testStages`，不会因为其他阶段齐全而被整体聚合状态误标为已完成。报告中的 `operator` 与 `operatorQualification` 也是独立字段。

标准引用 profile 还必须声明方法执行边界：`PUBLIC_SCOPE_MAPPING` 仅表示公开范围/流程映射，`ENTERPRISE_PROFILE_REQUIRED` 表示等待企业批准方法资料，`FULL_METHOD_IMPLEMENTED` 才表示产品实现了对应完整方法执行器。交付级别 `STANDARD_EVIDENCE_PACKAGE` 不能写成标准符合或产品放行。

## 当前明确不做的事情

- 不复制或猜测标准全文中的仪器精度、动态速率、稳态时间、温压基准或安全限值。
- 不把 `PASS` 自动写成“符合 GB/T/ISO”或产品放行。
- 不用 AI 生成的判断覆盖规则引擎、原始证据或人工签核。
- 不把 ISO 22734-1 安全设计验证、ISO/IEC 17025 实验室认可或企业质量体系伪装成 CSV 分析功能。
