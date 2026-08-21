# Implementation Plan

## Source of truth

`src/analyzer.mjs` 是信息面和判定面唯一事实源：CSV 解析、数据质量、指标计算、阈值、异常和报告正文均从这里产生。`src/ai-draft.mjs` 只接收结构化证据，负责本地草稿和可选 OpenAI-compatible 适配；`src/app.mjs` 只负责交互和展示，不在 UI 中重复计算。

## Surfaces

- User surface：CSV 上传、总览卡片、趋势图、风险清单、批次对比、报告下载。
- System interface：本地静态服务器和浏览器 Blob 下载接口。
- Information surface：CSV 字段、profile/阈值配置、判定枚举 `PASS/WARN/FAIL`。
- Operational surface：README、路线、测试报告、企业标准边界说明、本地历史清除入口。
- AI safety surface：证据最小化、模型可选、服务端 key、判定不可被草稿覆盖。

## Demo sequence

1. 载入演示样本，展示自动分段和首轮 `未通过`。
2. 讲解压力、泄漏两个异常的证据与建议动作。
3. 调低/调高阈值并重新分析，证明规则可配置。
4. 点击“载入演示基线并对比”，展示 `PASS → FAIL`、KPI 差值和新增风险。
5. 切换燃料电池演示 profile，展示阈值变化和报告来源；手工改值后确认进入当前会话模式。
6. 保存当前批次，换一份样本再保存，展示上一批自动对比和刷新后历史摘要仍在。
7. 下载 Markdown 报告和 JSON 证据包。
8. 点击“生成报告初稿”，说明结构化证据回退与可选企业模型服务。
9. 强调正式部署接入企业标准，人工签核保留。

## Next optimization candidates

- 接入企业提供的真实字段字典和设备类型模板，替换当前通用别名；
- 对单位换算增加企业标准确认和异常单位阻断；
- 支持 XLSX、时间戳缺失修复和批次版本审计；
- 接入真实历史批次、异常相似案例检索和报告版本审计。
