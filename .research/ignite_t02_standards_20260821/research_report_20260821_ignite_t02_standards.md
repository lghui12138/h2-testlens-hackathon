# T02 标准与完整测试流程核查报告

## Executive Summary

本次核查的目标不是给演示数据套一个“通过”标签，而是确认 H₂ TestLens 以后拿到企业资料包时，能否按适用设备、标准版本和测试方法生成可复核报告。用户提供的赛事公告明确选择 T02“设备测试数据分析与自动报告”，但公开检索没有得到可直接导入的企业脱敏资料包，因此本报告把用户公告作为赛道输入，把 ISO、IEC 和中国国家标准公共服务平台作为标准事实源。

核查结果显示，不能存在一套跨电解槽、燃料电池和不同应用场景通用的安全阈值。ISO 22734-1:2025针对水电解制氢系统的安全要求[1]；中国现行 GB/T 45541-2025针对 PEM 电解槽性能测试[4]；GB/T 27748.2-2022则针对固定式燃料电池发电系统性能试验[5]；IEC 62282 系列又按燃料电池模块或固定式系统区分安全范围[6][7]。因此，TestLens 的正确产品姿势是“标准/方法 profile + 可解释分析 + 人工签核”，而不是把演示阈值包装成安全认证。

中国标准平台对 GB/T 46104-2025 的技术内容进一步给出了一条可落地的完整链路：测试计划、数据采集计划、试验前检查、仪器、测量方法、稳态/动态/启停测试，以及包含测试目的、仪器设备、执行者姓名与资质、计算方法、图表和结论的试验报告。[8] 这直接决定了下一版产品应增加“合规准备度”门控：缺少适用标准、方法版本、仪器/校准、操作人员、环境与测试计划时，只能输出“分析结果”，不能输出“标准符合性结论”。

AI 部分也必须有边界。ISO/IEC 42001:2023把 AI 管理系统定义为需要建立、实施、维护和持续改进的组织性管理体系；ISO/IEC 23894:2023提供 AI 风险管理指导。[10][11] 当前产品已有证据最小化、verdict/锚点 guard、本地 fallback 和离线 fixture，但这些是风险控制原型，不是 ISO 认证。这个区分会保留在产品和参赛材料中。

## 1. Scope and Methodology

本核查覆盖五个问题：赛事赛道输入、氢能设备适用标准、测试执行过程、报告/实验室可信度、AI 风险治理。资料优先级为官方 ISO 页面、官方 IEC 页面、全国标准信息公共服务平台；用户提供的赛事公告作为输入，不据此推断没有给出的评审细则。所有源、证据和 claim 均持久化在同目录的 `sources.jsonl`、`evidence.jsonl` 和 `claims.jsonl` 中。

当前报告不购买或复制标准全文，不把搜索结果摘要当作标准全文，也不从标准名称推导具体安全限值。具体阈值、测量不确定度、仪器准确度和接受准则必须由企业批准的标准版本/测试方法 profile 提供。

## 2. Verified Standards Landscape

ISO 22734-1:2025是水电解制氢设备/系统的安全标准，适用范围本身就限定了设备类型。[1] ISO 22734:2019保留为历史参考，当前 profile 应以适用的现行版本为准。[2] 中国 GB/T 29729-2022则提供氢系统安全的基本要求，官方平台标注为现行，并列出2022年发布、2023年实施。[3] 这两者适合作为安全语境和 profile 引用，但不能替代某个企业的设备专项验收标准。

性能测试也不是一个通用方法。GB/T 45541-2025是现行的 PEM 电解槽性能测试方法，官方平台列出仪器、测试条件、操作、应急、功率、产氢量、纯度、单位制氢电耗和耐压测试计算等内容。[4] GB/T 46104-2025进一步面向电解水制氢系统的功率波动适应性测试，包含稳态、动态、冷/热启动、停机等测试类型和试验报告要求。[8] 这说明当前 H₂ TestLens 的温度/压力/泄漏/电压字段只是分析底座，不足以单独宣称 PEM 电解槽性能符合标准。

燃料电池必须分开处理。GB/T 27748.2-2022是固定式燃料电池发电系统性能试验方法；IEC 62282-2-100:2020针对燃料电池模块安全；IEC 62282-3-100:2019针对固定式燃料电池发电系统安全。[5][6][7] 这些标准的对象和应用范围不同，所以产品中“燃料电池演示 profile”只能是配置演示，不能共用电解槽的阈值或测试结论。

## 3. Complete Standard-Aligned Workflow

### 3.1 Test definition and applicability

测试开始前，系统应记录设备家族、型号、用途/应用场景、测试目的、适用标准编号、版本/发布日期、企业测试方法编号与版本、验收准则来源。适用标准必须通过企业审批；如果只有通用演示 profile，状态应为 `DEMO_ONLY`，不能进入合规判定。

### 3.2 Test plan and pre-check

测试计划应明确工况序列、采样频率、同步时钟、稳态判定、动态/启停段、异常中止条件、应急措施和需要采集的信号。试验前检查应确认设备、传感器、采集系统、气路/液路、环境条件和安全状态；仪器需要记录型号、序列号、量程、精度、校准证书/有效期。

### 3.3 Data acquisition

每个原始样本应带时间戳、单位、信号名、来源通道和数据质量状态。当前产品可以自动处理常见中文表头与单位换算，但正式 profile 还要提供企业字段字典；显式映射未命中时已经产生 `MAPPING_OVERRIDE_MISSING`，不能静默假装匹配。原始行应留在企业授权边界内，API 只返回结构化结果。

### 3.4 Analysis and calculation

分析阶段应固定计算方法、稳态窗口、过滤/缺失值规则、单位换算、派生量公式和不确定度/误差说明。TestLens 当前能给出数据完整率、功率、电压稳定性、峰值温度/压力/泄漏、压力漂移、时间引用和批次差值；这些是可解释分析，不是自动替代企业标准计算的合规判定。

### 3.5 Review and report

报告应包含测试目的、设备/仪器、方法版本、执行者与资质、原始数据引用/哈希、计算方法、图表、异常证据、结论和人工签核。AI 只负责把结构化证据整理成草稿；verdict、阈值、时间证据和风险动作由规则引擎控制，模型冲突时回退本地草稿。

### 3.6 Archive and continual improvement

归档应保存报告版本、profile 版本、标准版本、数据质量、模型路由、fallbackReason、人工签核和批次对比。ISO/IEC 17025关注测试/校准实验室的能力、公正性和一致运行[9]；ISO/IEC 42001强调持续改进[10]，产品当前用本地历史摘要、离线 AI eval 和 readiness check 形成原型闭环；正式部署需接企业审计/工单系统。

## 4. Product Gap Matrix

| 标准/流程要求 | 当前产品 | 下一步门控 |
|---|---|---|
| 设备与应用范围 | demo profile 有设备名 | 企业 profile 必须增加 applicationScope/intendedUse |
| 标准与方法版本 | profile source 可显示 | 增加 standardRefs、methodId、revision、approvalStatus |
| 测试计划/采集计划 | UI 分析已有工况 | 增加 testPlan 元数据和采样/同步字段 |
| 仪器/校准/执行者 | 当前示例未覆盖 | compliance readiness 缺失即禁止标准符合性结论 |
| 计算方法/不确定度 | 规则引擎可解释 | profile 提供 formulaRefs、uncertaintyPolicy |
| AI 风险控制 | guard、fallback、offline eval | 企业网关真实模型评估与审计日志 |
| 报告归档 | Markdown/JSON/历史摘要 | 企业系统接入、签核和版本留存 |

## 5. Recommendations

第一，拿到企业资料包后不要先改阈值，而是先填写标准 profile：设备家族、适用范围、标准/方法编号与版本、字段字典、仪器与校准要求、验收准则。第二，把当前 `DEMO_ONLY` 与未来 `APPROVED_PROFILE` 分开，只有后者允许生成“符合/不符合”类语言。第三，将 GB/T 46104 所列的测试计划、数据采集、试验前检查和报告字段转为 UI checklist，缺一项就显示“报告可生成、合规准备度未完成”。第四，在企业批准网关上用真实脱敏数据运行 AI grounding、延迟、拒答和人工复核评估。

## Limitations and Caveats

本报告使用公开标准页面的摘要/登记信息，没有购买或读取标准全文；不能据此生成具体安全限值或声称认证。赛事官方企业资料包和正式评审细则尚未提供，用户公告是当前赛道输入而非官方标准全文。真实工程部署前必须由企业标准负责人、测试负责人和安全/质量人员共同确认 profile。

## Bibliography

[1] ISO (2025). “ISO 22734-1:2025 Hydrogen generators using water electrolysis — Part 1: Safety.” https://www.iso.org/standard/82766.html?browse=ics (Retrieved: 2026-08-21)
[2] ISO (2019). “ISO 22734:2019 Hydrogen generators using water electrolysis — Industrial, commercial, and residential applications.” https://www.iso.org/standard/69212.html?browse=ics (Retrieved: 2026-08-21)
[3] 国家市场监督管理总局、国家标准化管理委员会 (2022). “GB/T 29729-2022 氢系统安全的基本要求.” https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=CD2CACD6BCF1403D48EF0508798A01A9 (Retrieved: 2026-08-21)
[4] 国家市场监督管理总局、国家标准化管理委员会 (2025). “GB/T 45541-2025 PEM电解槽性能测试方法.” https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB (Retrieved: 2026-08-21)
[5] 国家市场监督管理总局、国家标准化管理委员会 (2022). “GB/T 27748.2-2022 固定式燃料电池发电系统 第2部分：性能试验方法.” https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=2D7DA5B2D9F4D55AB5E627A41BCDFA2D (Retrieved: 2026-08-21)
[6] IEC (2020). “IEC 62282-2-100:2020 Fuel cell technologies — Fuel cell modules — Safety.” https://webstore.iec.ch/en/publication/59780 (Retrieved: 2026-08-21)
[7] IEC (2019). “IEC 62282-3-100:2019 Fuel cell technologies — Stationary fuel cell power systems — Safety.” https://webstore.iec.ch/en/publication/59566 (Retrieved: 2026-08-21)
[8] 国家市场监督管理总局、国家标准化管理委员会 (2025). “GB/T 46104-2025 电解水制氢系统功率波动适应性测试方法.” https://std.samr.gov.cn/gb/search/gbDetailed?id=3DBA213287120D16E06397BE0A0A8119 (Retrieved: 2026-08-21)
[9] ISO (2017). “ISO/IEC 17025:2017 General requirements for the competence of testing and calibration laboratories.” https://www.iso.org/standard/66912.html (Retrieved: 2026-08-21)
[10] ISO (2023). “ISO/IEC 42001:2023 Artificial intelligence — Management system.” https://www.iso.org/standard/42001 (Retrieved: 2026-08-21)
[11] ISO (2023). “ISO/IEC 23894:2023 Artificial intelligence — Guidance on risk management.” https://www.iso.org/standard/77304.html (Retrieved: 2026-08-21)

## Methodology Appendix

The research used a standard-mode evidence loop: scope → official-source retrieval → source registry → claim/evidence ledger → cross-reference → product gap matrix. Official ISO/IEC and China National Standards Public Service Platform pages were prioritized. The research explicitly separates official standard facts from product-design inference and records the absence of an organizer-provided public data package as a limitation.
