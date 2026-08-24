# GitHub 发布轮次记录

## 2026-08-24 · 跨会话 steady 与 phase alias 门修复轮

- approved 稳态 KPI 只接受同一会话内连续的 `steady`/中文稳态/显式 alias 窗口；跨会话各一条、无 steady 阶段和不足窗口不再回退活动数据。
- 阶段覆盖无正跨度时返回 0/不可用，不再把两条单点记录当成 100% 覆盖；批准原始功率完整性门继续有效。
- 回归门：`npm test` 164/164、`npm run check:submission` 127/127、typecheck、Vinext build 5/5、package smoke 全通过。

## 2026-08-24 · 批准功率与稳态样本门修复轮

- approved profile 要求原始 `power_w` 时，部分记录缺失不再通过“至少两条非空”门；新增 partial raw-power regression。
- approved analysis 遇到只有一条显式稳态样本时不再回退活动窗口，返回阻断状态；多会话阶段覆盖按各会话跨度求和。
- 回归门：`npm test` 163/163、`npm run check:submission` 127/127、typecheck、Vinext build 5/5、package smoke 全通过。

## 2026-08-24 · 单位电耗、多会话覆盖与发布 receipt 轮

- 修复单位制氢电耗 1000 倍错误：`Wh/NL` 与 `kWh/Nm³` 数值等价；两点样例锁定 `1/18`。
- 阶段覆盖率按各独立会话的时间跨度求和，避免文件时间从 0 重置后生成虚假的 200% 覆盖率。
- 新增版本化 release receipt：包含 gate 状态、T02 198 文件边界、提交包 SHA-256；Pages/App 首屏显示 receipt 是否已绑定公开 commit。
- 回归门：`npm test` 161/161、`npm run check:submission` 127/127、typecheck、Vinext build 5/5、package smoke 和 Pages 静态准备通过。

## 2026-08-24 · 混合功率与公开页面边界修复轮

- 部分原始功率通道不再显示为完整的“原始功率 + 交叉核算”；分析输出 `mixed`、原始/派生/缺失计数和覆盖率，并给出 `POWER_SOURCE_MIXED` 复核提示。
- 关键数值字段出现缺失单元格时生成 `DATA_GAP` 复核提示，保留原始缺失，不使用插值或默认值替代。
- T02 页面把 `blocked_binary` 与 `declared_no_upload` 分成两个计数和两种解释；Next 与静态入口统一流程导航、GitHub Pages canonical/OG URL、初始化错误态，并对导入 profile 名称做 HTML 转义。
- 梯形积分不确定度按采样点敏感系数累计后再做 RSS，避免中间采样点被两个相邻区间重复按完整端点计权；新增 3 点边界回归。
- 回归门：`npm test` 159/159、`npm run check:submission` 124/124、`npm run typecheck`、`npm run eval:ai` 4/4、API smoke、Pages 静态准备和干净克隆 Vinext 生产构建 5/5 阶段通过。

## 2026-08-24 · T02 车辆单位强制门轮

- T02 车辆描述性 profile 新增 `vehicleUnitEvidenceRequired: true`；没有企业明确的 `V/mV` 字典时，单体电压和方差不进入电压 KPI/趋势，原始值和复核计数仍保留。
- 浏览器、API、`batch-watch` 和 source/public T02 profile parity 同步该门控；显式声明单位的 profile 仍可换算并进入描述性 KPI。

## 2026-08-24 · 车辆绝缘与耐久不可比趋势门控轮

- 车辆绝缘结果拆分状态外记录、状态内缺失、非正值、量程上限/哨兵和有效进入 10 分钟最小值统计的数量，避免把不同排除原因混成一个“无效值”计数。
- 耐久跨报告可比性不通过时，首末电压/离均差变化量改为 `suppressed_not_comparable`，页面、Excel 处理日志和报告不再展示容易误读的衰减 Δ。
- 回归新增绝缘排除分层和耐久不可比 Δ 抑制；标准 URL/日期与车辆单位证据门保持有效。

## 2026-08-24 · 标准引用真实性门控轮

- profile 包校验已知 GB/T/ISO 的 canonical HTTPS URL、真实 ISO 日期和审批日期；伪造标准 URL 或非法日期会在导入前拒绝。
- `vehicleSignalUnits` 通过 profile/API/batch-watch 传递，未声明单位时不按数值大小猜测车辆单体电压单位。

## 2026-08-24 · XLSX 检测字段与耐久图表语义修复轮

- 出厂报告 XLSX 解析改为按真实表头定位“标准/测试结果/是否合格”，并保留 `measuredValues[]`；真实包 01 检测项目现在把 `0.2` 作为测量值、`是` 作为原报告结果。
- 耐久 Excel `图表数据` 增加报告/来源、点序和目标功率列；不同 DOCX 报告之间插入空分组行，原生 OOXML 图表标题和类别改为按报告/来源标识，不再绘制伪造的跨报告连续趋势。
- API 对无 profile 包却请求 `approved/acceptance/standardRefs` 的配置返回 422 `profile_package_required`，未知 profile ID 继续 422；避免未经验证的标准/审批配置进入分析。
- 本轮针对性验证：XLSX/图表回归通过，API smoke 通过；完整 `npm test` 151/151、提交检查 124/124、AI 4/4、Pages 发布门将在提交前重跑。

## 2026-08-24 · 全包证据深度与电堆口径修复轮

- 全量重放 198 个 T02 文件后，审计新增逐文件证据深度：143 `descriptive_interval`、13 `dynamic_event_only`、34 `generic_metrics_only`、8 `reference_boundary`、0 `formal_kpi`；全包字段值复核为 176 个文件/2,759 次提示。
- 修复真实青川电堆的功率交叉核算：有“实际电压”时优先于“总电压”；按逐行“片数”排除零填充单片列，计量比改用逐行片数；非正单片值不进入派生统计但保留原始值。
- 车辆适配新增单位未确认、65535 方差哨兵、多会话趋势阻断、空窗口不回退全量；未知 profile ID 不再静默回退第一个 profile。
- App 运行时公开复制 `public/src` 模块与 vendor 资源；移动端新增导航，报告/XLSX/JSON 未分析时不再尝试下载。

## 2026-08-24 · 字段值分布诊断轮

- 车辆/电堆适配器新增字段级诊断：有效率、负值、零值集中、常量值、非数值混合和复核原因；原始值不静默裁剪。
- 真实 T02 抽查写入 `docs/T02_FIELD_DIAGNOSTICS.md`：青川电堆 38,257 行/127 列、14 个核心字段待复核、37,600 个重复时间戳；车辆样例 5,310 行/46 列、5 个字段待复核。
- 企业数据面板新增字段值分布可视化摘要，显示待复核字段、含负值字段、零值集中字段和常量字段，并保留“不是标准判定”的边界说明。
- 回归门：`npm test` 409/409、`npm run check:submission` 124/124、`npm run eval:ai` 4/4、Pages 静态准备、Node 语法检查、公开站点 HTTP smoke 和 `git diff --check` 通过；Vinext `npm run build` 在本轮 150 秒内无输出，已停止，未宣称构建通过。

## 2026-08-24 · GitHub Pages 视觉与入口轮

- 公开网页改为深色测试控制室视觉：指标、趋势图、风险和流程使用统一的海军蓝/薄荷绿/琥珀色语义层。
- 趋势区域增加网格背景和更清晰的图表容器，不改变画布数据、采样规则或分析结果。
- 静态 GitHub Pages 与 Vinext App 共用 `src/styles.css`；页面顶部增加分析台、数据视图/流程和 GitHub 入口。
- README 明确列出 GitHub 仓库、Actions 和 Pages 地址；新增网页/App 分离边界说明。
- 发布前门控：`npm test` 399/399；`npm run check:submission` 119/119；T02 源资料完整性 198/198 unchanged。

## 2026-08-24 · 计算口径与字段误映射修复轮

- 修复通用 CSV 字段解析：`功率设定值`、`target_power`、`command_power` 不再被误映射为原始 `power_w`。
- 没有原始功率通道时，系统继续明确标记为 `derived_only`，电能只按电压×电流派生；正式 profile 仍不会把派生功率当作原始验收通道。
- 新增回归测试锁定该边界，并在测试总览增加功率来源、时间轴、单位映射和不确定度状态摘要，方便工程师复核计算口径。

## 2026-08-24 · 时间轴缺口感知积分轮

- 当企业 profile 明确配置最大采样间隔时，产氢量、电能和不确定度传播会跳过超限时间段，不再跨未知时间段做梯形积分。
- 阶段覆盖、阶段持续时间和阶段积分同步识别该缺口；原始缺值和非正时间间隔继续跳过，不进行插值。
- 新增通用积分与阶段积分回归测试，确保配置缺口示例从 4 秒跨度只使用 0–1 秒有效段。

## 2026-08-24 · 多文件会话边界轮

- 通用分析现在按 `session_id/source_file` 计算重复时间戳、单调性、采样间隔、阶段摘要、积分和不确定度传播。
- 文件切换不再被当作一条连续时间轴；跨文件积分段会记录为 `skippedSessionBoundaryCount`。
- 新增两文件同相位回归测试，确认各文件的 0–1 秒记录分别计算，未产生跨文件负时间或伪重复时间戳。

## 2026-08-24 · T02 接入范围公开轮

- GitHub Pages 和 Vinext App 新增 “T02 资料接入范围” 卡片，公开展示 198 文件、190 处理、6 参考、1 阻断、1 未上传、2,262,283 行/功率点和 0 正式符合性声明。
- 卡片链接到版本化覆盖审计 JSON，明确“已处理”不等于“已满足标准”，让评审可以直接核对资料使用边界。

## 2026-08-24 · 多文件总时长口径轮

- 多会话结果的总观测时长改为各会话时长之和；页面同时显示会话数，不再用全局 max(timestamp)-min(timestamp) 掩盖文件重启。
- 新增回归断言：两个 0–1 秒文件的总观测时长为 2 秒，积分仍不跨文件。

## 2026-08-24 · 标准实施矩阵公开轮

- 新增 `docs/STANDARD_BOUNDARY_MATRIX.md`，逐项列出 GB/T 45541、GB/T 46104、ISO 22734-1 和 ISO/IEC 17025 的产品映射、缺失证据和当前状态。
- GitHub Pages/App 的适用标准卡片新增矩阵入口；提交门把矩阵列为必备交付文件。

## 2026-08-24 · 阶段积分 fail-closed 轮

- 阶段计算遇到采样缺口、文件边界或中断时，能耗/产氢/单位电耗不再保留为“已计算”正式阶段结果，页面改显示“缺口阻断/需复核”。
- 新增 `partial_gap`、`partial_session_boundary` 等阶段状态和缺口回归，避免把部分积分误读为完整测试阶段结果。

## 2026-08-24 · 阶段指标独立输入轮

- 阶段能耗和产氢量改为独立完整性门控：功率/时间完整时，缺流量不会误清空能耗；单位制氢电耗仍要求能耗和产氢同时完整。
- 新增缺流量回归，阶段状态显示为 `partial_input`，不会被误标为完整阶段结果。

## 2026-08-24 · 报告阶段证据轮

- Markdown 自动报告的阶段摘要现在直接输出 `integrationStatus`、跳过缺口段数和文件边界数，与页面“缺口阻断/需复核”口径一致。
- 新增报告回归，锁定 `partial_gap` 不会只显示为普通数值缺失。

## 2026-08-24 · blocked_binary 边界公开轮

- 核实唯一 blocked_binary 文件为真实二进制/不可读文本，不是可安全转换的 UTF-16 或 GB18030 表格。
- T02 覆盖卡片现在明确显示：保留哈希、不生成测试结论；阻断原因也保留在 versioned audit 和报告中。

## 2026-08-24 · binaryReason 机器证据轮

- 输入安全层新增 `binaryReason`：`nul_byte`、`control_byte_ratio`、`decoded_control_bytes`、`unsupported_bom_encoding`。
- 浏览器、batch-watch 和 T02 coverage audit 共享并保留该原因，阻断处理仍不进入解析器。

## 2026-08-24 · 损坏编码 fail-closed 轮

- 输入文本出现 Unicode replacement character（`�`）时现在阻断为 `decode_replacement_character`，不再用替换字符继续解析 KPI。
- 新增 malformed UTF-8 回归，确保损坏字节不会静默进入 CSV/TSV 分析。

## 2026-08-24 · Pages HTTPS 状态核查轮

- GitHub Pages API 确认站点 public，但 HTTPS 强制开启因证书尚未配置返回 404；未修改 DNS、代理或网络设置。
- 部署文档现在明确区分 GitHub Pages 项目地址、当前公开渲染域名和证书外部依赖，避免把 HTTP 路由写成已强制 HTTPS。

## 2026-08-24 · GitHub 分享预览轮

- 静态 Pages 和 Vinext App 新增 description、canonical、Open Graph、Twitter card 和 `og-card.svg` 分享图。
- Pages 准备脚本复制分享图到 `_site/`，提交门和输入面测试确认公开资源存在；分享预览只说明项目用途，不生成标准符合性宣传。
- 因自定义域 HTTPS 证书尚未配置，OG/Twitter 图片改用 GitHub raw HTTPS 资源；canonical/url 与当前公开 HTTP 域名保持一致，避免分享爬虫遇到证书阻断。

## 2026-08-24 · T02 覆盖卡动态摘要轮

- 覆盖卡不再以 198/190/6/1/1 作为唯一来源；coverage audit 生成小型 `t02-coverage-summary.json`，静态页和 App 启动时读取并更新数字、进度条和阻断原因。
- `config/` 与 `public/config/` 摘要做 parity 检查，避免 T02 重放后页面数字漂移。

## 2026-08-24 · 历史门控数字同步轮

- 历史测试门控曾同步为 `npm test 408/408`、`npm run check:submission 124/124`；当前轮次已更新为 `npm test 409/409`。

## 使用边界

视觉和导航轮次不改变标准边界：T02 示例 profile 仍是 `descriptive_only`，标准参考仍不是完整方法执行证明，缺少企业批准 profile、仪器溯源、不确定度和人工签核时不进入正式放行结论。
