# Standards alignment and compliance gate

这份说明把公开官方标准信息映射到 H₂ TestLens 的产品边界。它不是标准全文，也不是认证声明；正式部署必须由企业标准负责人确认适用范围、版本、测量方法和验收准则。

## Verified references

| 领域 | 官方参考 | 产品含义 |
|---|---|---|
| 水电解制氢安全 | [ISO 22734-1:2025](https://www.iso.org/standard/82766.html?browse=ics)；[GB/T 29729-2022](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=CD2CACD6BCF1403D48EF0508798A01A9) | 适用范围/安全 profile 不能与燃料电池共用 |
| PEM 电解槽性能 | [GB/T 45541-2025](https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB) | 仪器、条件、操作、功率、产氢量、纯度、能耗、压力测试需由方法 profile 定义 |
| 电解水制氢系统功率波动 | [GB/T 46104-2025](https://std.samr.gov.cn/gb/search/gbDetailed?id=3DBA213287120D16E06397BE0A0A8119) | 测试计划、采集计划、试验前检查、稳态/动态/启停和报告字段进入 readiness 清单 |
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
2. 准备测试计划、数据采集计划、仪器/校准和试验前检查。
3. 采集带时间戳、单位、通道来源和质量状态的原始数据。
4. 固定字段映射、单位换算、稳态窗口、公式和不确定度策略。
5. 生成带峰值时间、图表、异常动作、标准引用和人工签核位的报告。
6. 归档 profile、标准版本、数据摘要、模型路由、fallbackReason 和批次对比。

完整来源、证据和 claim ledger 位于 `.research/ignite_t02_standards_20260821/`。
