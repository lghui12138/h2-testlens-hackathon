# H₂ TestLens｜氢能测试智报

浦发·IGNITE 未来能源黑客松 · T02「设备测试数据分析与自动报告」作品原型。

## 一句话

把设备测试 CSV 变成工程师可以复核、可以行动的中文报告：自动识别工况分段，计算关键 KPI，给出异常证据和建议动作，并保留原始数据到结论的追溯关系。

## 运行

```bash
npm test
npm start
```

然后打开 <http://127.0.0.1:4173>。项目不依赖外部服务或第三方包，演示数据位于 `sample-data/`：标准样本、中文单位样本和基线样本分别覆盖单次分析、字段适配和批次对比。

## 当前输入约定

标准 CSV 字段为：`timestamp_s, phase, current_a, voltage_v, temperature_c, pressure_bar, flow_slpm, leak_ppm`；也支持常见中文/别名表头，并自动换算 `ms/mA/mV/kPa/MPa/ppb`。`phase` 可选，缺失时使用活动窗口回退。阈值在界面中可调整；当前值是演示用默认值，正式接入时应从企业测试标准或工单配置读取。

## 当前已实现

- 本地 CSV 导入和演示样本加载
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
- 测试元数据可记录测试计划、数据采集计划、试验前检查、环境/安全条件、不确定度策略和原始数据引用/哈希
- 可展开查看每个 canonical 字段、原始表头和单位换算证据
- 本地批次历史：只保存 KPI、判定、profile 和风险摘要，刷新后仍可复核
- 键盘可操作的按钮、响应式布局、减少动效支持

## 重要边界

这是比赛原型，不把演示阈值当作企业安全标准，也不替代工程师签核。内置设备 profile 是演示模板，正式版必须替换为企业审批后的设备标准。本地历史只保存摘要，不保存原始测试行。没有配置模型时，报告助手仍使用本地证据模板；配置远程模型时，建议使用企业内网或已审批的 OpenAI-compatible 网关。

AI 网关配置与证据边界见 [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md)。
参赛口径与现场演示顺序见 [`docs/SUBMISSION_BRIEF.md`](docs/SUBMISSION_BRIEF.md)；配置包示例见 [`config/enterprise-profile.example.json`](config/enterprise-profile.example.json)。
打包说明见 [`docs/SUBMISSION_PACKAGE.md`](docs/SUBMISSION_PACKAGE.md)。

## 标准化工作流边界

界面中的流程清单把公开标准资料转成可审计的输入/复核顺序，但不复制标准全文，也不自动宣称符合标准。只有企业批准的 profile、明确的方法版本、仪器/校准记录、计算引用和授权人员签核齐全后，系统才允许进入 `READY_FOR_HUMAN_REVIEW`；异常数据仍然需要工程师处置和必要的复测。
