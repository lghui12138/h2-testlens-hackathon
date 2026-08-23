# H₂ TestLens 标准实施边界矩阵

更新时间：2026-08-24 · 仓库版本：v3.5.37

这份矩阵只说明当前原型已经实现的产品映射和仍缺失的证据，不把字段覆盖、KPI 计算或 profile 门控写成标准符合性结论。

| 标准/规范 | 当前已实现的产品映射 | 当前仍缺失的正式证据 | 当前状态 |
|---|---|---|---|
| [GB/T 45541-2025](https://std.samr.gov.cn/gb/search/gbDetailed?id=31DA5F377BB68F08E06397BE0A0A4CFB) | PEM profile、基本检查/基础测试/性能测试/报告字段的产品结构映射；流量/纯度/能耗仅作为可追溯 KPI 字段入口 | 完整试验条件、仪器精度与量程、应急措施、企业验收计算、完整方法逐条实施证据 | 部分映射；不可宣称符合 |
| [GB/T 46104-2025](https://std.samr.gov.cn/gb/search/gbDetailed?id=3DBA213287120D16E06397BE0A0A8119) | 稳态/动态/启停/停机阶段 profile 门控、原始功率通道门、采样质量、阶段指标和结构化流程证据入口 | 功率波动试验控制器、完整动态/停机执行、企业批准的速率/精度/采样/验收规则 | 部分映射；不可替代试验 |
| [ISO 22734-1:2025](https://www.iso.org/standard/82766.html?browse=ics) | 保存安全标准引用和适用范围字段，页面明确安全边界 | 危险分析、联锁设计、保护功能验证、设备安全测试和安全责任签核 | 仅作参考；不具备安全认证能力 |
| [ISO/IEC 17025:2017](https://www.iso.org/standard/66912.html) | 记录仪器、校准、执行者、公式、不确定度、原始引用和签核 provenance | 实验室能力、公正性、授权、质量体系、审核记录和认可证书 | 记录辅助；不证明实验室认可 |

## T02 资料使用边界

版本化 T02 覆盖审计当前为 198 个文件：190 个进入对应解析器，6 个 reference-only，1 个 blocked-binary，1 个 declared-no-upload；处理数据进入适配器的记录/功率点为 2,262,283，正式符合性声明为 0。原始资料不提交到 GitHub。

证据入口：[t02_coverage_audit_v3.5.37.json](../.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.37.json)、[enterprise readiness](./ENTERPRISE_READINESS.md)、[standards alignment](./STANDARDS_ALIGNMENT.md)。

## 企业落地前置条件

企业必须提供批准的设备 profile、方法版本、目标/验收规则、仪器和校准证据、不确定度预算、真实脱敏数据、批次声明、并行人工复核和现有签核/审计系统验证。缺一项时，页面结果只能作为描述性分析、风险筛查或人工复核前草稿。
