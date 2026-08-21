# H₂ TestLens｜氢能测试智报

浦发·IGNITE 未来能源黑客松 · T02「设备测试数据分析与自动报告」作品原型。

## 一句话

把设备测试 CSV 变成工程师可以复核、可以行动的中文报告：自动识别工况分段，计算关键 KPI，给出异常证据和建议动作，并保留原始数据到结论的追溯关系。

## 运行

```bash
npm test
npm start
```

然后打开 <http://127.0.0.1:4173>。本地分析不依赖外部服务；托管构建依赖仓库锁定的 Node 包。演示数据位于 `sample-data/`：标准样本、中文单位样本和基线样本分别覆盖单次分析、字段适配和批次对比。

## GitHub Pages 独立部署

独立 GitHub 仓库为 `lghui12138/h2-testlens-hackathon`。`.github/workflows/deploy-pages.yml` 会在 `main` 推送后运行完整提交检查，并把 `_site/` 静态产物发布到 GitHub Pages；静态页面使用相对资源路径，适配项目站点 URL。GitHub Pages 版本使用本地证据草稿回退，不依赖 ChatGPT API。

## 当前输入约定

标准 CSV 字段为：`timestamp_s, phase, current_a, voltage_v, temperature_c, pressure_bar, flow_slpm, leak_ppm`；也支持常见中文/别名表头，并自动换算 `ms/mA/mV/kPa/MPa/ppb`。`phase` 可选，缺失时使用活动窗口回退。阈值在界面中可调整；当前值是演示用默认值，正式接入时应从企业测试标准或工单配置读取。

## 当前已实现

- 本地 CSV 导入和演示样本加载
- 企业资料结构适配：车辆 `FC_*` CSV、中文电堆 CSV、GB18030 制表符 TXT 和原始时序 XLSX；支持多文件 CSV/TXT 批次导入；原始企业数据不进入仓库
- 台架耐久 DOCX 报告解析：读取测试结果、目标功率点、平均单体电压、离均差、方差和冷却温度；可配置耐久预警阈值
- 飞书告警适配：默认 dry-run/JSON 预览，用户明确确认后才向企业批准的机器人 webhook 发送结构化文本
- 参数/目标工况 Excel 导入：按表头和参数代码读取“数据处理设定参数”“目标工况设定”，不依赖行号
- 企业 Excel 报告导出：测试信息、参数、目标工况、字段映射、质量检查、平台、稳定区间、极化数据、异常清单和处理日志等 14 个工作表
- 车辆运行态/上电态统计、目标电流段平均值、10 分钟绝缘最小值和 350/250 kΩ 趋势预警摘要
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
- 测试元数据可记录测试计划、数据采集计划、试验前检查、环境/安全条件、不确定度策略和原始数据引用/哈希
- 性能指标：产氢量（流量梯形积分）、电能消耗、单位制氢电耗、最低氢气纯度；profile 可强制要求纯度等测量字段
- profile 可声明必须出现的测试段（如稳态、动态、启停）；缺段时系统阻断正式性能结论
- `npm run profile:audit -- config/enterprise-profile.example.json` 可在接入前审计企业 profile 的标准、测量、测试段和不确定度配置
- 上传或载入 CSV 时浏览器自动计算 SHA-256，并写入当前会话的原始数据引用字段；哈希随报告/JSON 保存，原始行不上传
- 可展开查看每个 canonical 字段、原始表头和单位换算证据
- 本地批次历史：只保存 KPI、判定、profile 和风险摘要，刷新后仍可复核
- 键盘可操作的按钮、响应式布局、减少动效支持

## 重要边界

这是比赛原型，不把演示阈值当作企业安全标准，也不替代工程师签核。内置设备 profile 是演示模板，正式版必须替换为企业审批后的设备标准。本地历史只保存摘要，不保存原始测试行。没有配置模型服务时，报告初稿仍由本地结构化证据生成；配置远程模型时，建议使用企业内网或已审批的模型网关。

企业资料的本机盘点、真实字段适配和未完成项见 [`docs/ENTERPRISE_DATA_INTEGRATION.md`](docs/ENTERPRISE_DATA_INTEGRATION.md)。当前页面已经支持参数工作簿读取、Excel 报告导出和耐久告警；仍未接入企业批准阈值、自动每日增量调度、企业 Feishu 凭据/策略、服务端审计和 Excel 内嵌原生图表。

AI 网关配置与证据边界见 [`docs/AI_INTEGRATION.md`](docs/AI_INTEGRATION.md)。
企业应用边界和逐项标准审计见 [`docs/ENTERPRISE_READINESS.md`](docs/ENTERPRISE_READINESS.md)。
参赛口径与现场演示顺序见 [`docs/SUBMISSION_BRIEF.md`](docs/SUBMISSION_BRIEF.md)；配置包示例见 [`config/enterprise-profile.example.json`](config/enterprise-profile.example.json)。
打包说明见 [`docs/SUBMISSION_PACKAGE.md`](docs/SUBMISSION_PACKAGE.md)。

## 标准化工作流边界

界面中的流程清单把公开标准资料转成可审计的输入/复核顺序，但不复制标准全文，也不自动宣称符合标准。只有企业批准的 profile、明确的方法版本、仪器/校准记录、计算引用和授权人员签核齐全后，系统才允许进入 `READY_FOR_HUMAN_REVIEW`；异常数据仍然需要工程师处置和必要的复测。
