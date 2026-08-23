# T02 设备测试数据分析与自动报告助手 · 全资料包自动接入报告

- 证据版本：3.5.37
- 覆盖审计：`.research/ignite_t02_standards_20260821/t02_coverage_audit_v3.5.37.json`
- 参考审计：`.research/ignite_t02_standards_20260821/t02_reference_audit_v3.5.37.json`
- 原始企业文件：未复制进仓库；本报告只使用哈希、解析统计、字段角色、指标名称和边界证据。

## 结论

本报告逐项列出 198 个源文件的实际状态和使用台账。190 个文件进入配置的解析器/适配器，6 个文件只作为需求或参考边界，1 个文件因二进制内容被阻断，1 个文件只记录企业明确的未上传声明。

- 已进入适配器的行/功率点：2,262,283
- 使用台账完整性：198/198
- 重复 processed SHA-256：0
- 正式符合性声明：0
- 参考文件解析错误：0
- 参考声明关键词证据：21/21 完整（机器抽取证据，不等于标准全文复核）
- 参考内容审计交叉链接：7/7；独立参考审计文件：7

## 包级结构化汇总

| 资料包 | processed 文件 | 行/功率点 | 数据类型 | 字段使用角色 | 业务汇总 | 跨文件连续 KPI 合并 |
|---|---:|---:|---|---|---|---|
| 企业资料包01_氢璞创能 | 11 | 62,913 | stack | analysis_input=323；catalog_only=68；context_or_cross_check=31 | 电堆 11 文件、62,913 行、422 列信号、299 个单片通道、0 个正式稳定点、26 个描述性候选区间 | 否 |
| 企业资料包02_氢质氢离 | 178 | 2,161,113 | durability、vehicle | analysis_input=13；context_or_cross_check=33 | 车辆 170 文件、2,160,633 行、0 个正式性能点、827 个描述性候选区间、15,281 个动态设定变化事件（完成保持 3,727）；耐久 8 文件、480 个功率点、目标功率 33 kW、58.5 kW、117 kW、156 kW、175.5 kW、195 kW | 否 |
| 企业资料包03_青川易创与云汉达 | 1 | 38,257 | stack | analysis_input=68；catalog_only=34；context_or_cross_check=25 | 电堆 1 文件、38,257 行、127 列信号、40 个单片通道、0 个正式稳定点、61 个描述性候选区间 | 否 |

字段角色完整性：企业资料包01_氢璞创能: 未分类 0，多角色冲突 0；企业资料包02_氢质氢离: 未分类 0，多角色冲突 0；企业资料包03_青川易创与云汉达: 未分类 0，多角色冲突 0。字段角色只说明“进入核心分析、交叉核对或目录/描述性统计”的层级，不把目录字段升级为标准结论。

## 字段用途明细（不是每个字段都进入 KPI）

下表把车辆/电堆适配字段与耐久 DOCX 字段分开列出。`analysis_input` 进入结构化指标或阶段处理；`context_or_cross_check` 用于设定值/反馈/元数据核对；`catalog_only` 保留字段目录和描述性统计。未分类或多角色冲突必须为 0；这张表不产生标准符合性结论。

| 资料包 | 字段域 | 字段总数 | analysis_input | context_or_cross_check | catalog_only | 未分类 | 多角色冲突 |
|---|---|---:|---:|---:|---:|---:|---:|
| 企业资料包01_氢璞创能 | stack | 422 | 323 | 31 | 68 | 0 | 0 |
| 企业资料包02_氢质氢离 | vehicle | 46 | 13 | 33 | 0 | 0 | 0 |
| 企业资料包02_氢质氢离 | durability | 14 | 6 | 8 | 0 | 0 | 0 |
| 企业资料包03_青川易创与云汉达 | stack | 127 | 68 | 25 | 34 | 0 | 0 |

## 全包字段值分布诊断（复核提示，不是标准判定）

该汇总来自所有进入车辆/电堆适配器的真实时序文件。负值、零值集中、常量值和非数值混合只提示需要确认字段语义、设备状态和企业无效码；系统不自动删除原始值，也不把提示写成合格/不合格。

| 资料包 | 有诊断文件 | 有待复核文件 | 待复核字段出现次数 | 含负值文件 | 零值集中文件 | 常量字段文件 | 解析混合文件 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 企业资料包01_氢璞创能 | 11 | 10 | 2,257 | 10 | 10 | 10 | 0 |
| 企业资料包02_氢质氢离 | 178 | 165 | 488 | 165 | 170 | 170 | 0 |
| 企业资料包03_青川易创与云汉达 | 1 | 1 | 14 | 1 | 1 | 1 | 0 |

全包汇总：176 个文件出现字段值复核提示，2,759 次字段级提示；全包字段值诊断只汇总原始值分布复核点，不替代企业字段语义、无效码表、单位、校准或标准验收限值。

## 证据深度分层

`formal_kpi` 表示形成了正式性能点（仍受 profile/标准证据门控）；`descriptive_interval` 表示只形成描述性候选区间或耐久功率点；`dynamic_event_only` 表示只形成动态设定变化事件；`generic_metrics_only` 表示进入适配器并有通用统计，但没有上述业务证据；`reference_boundary` 表示未进入原始时序适配器。

| 资料包 | formal_kpi | descriptive_interval | dynamic_event_only | generic_metrics_only | reference_boundary |
|---|---:|---:|---:|---:|---:|
| 企业资料包01_氢璞创能 | — | 7 | — | 4 | — |
| 企业资料包02_氢质氢离 | — | 135 | 13 | 30 | — |
| 企业资料包03_青川易创与云汉达 | — | 1 | — | — | — |

全包分层：descriptive_interval=143；dynamic_event_only=13；generic_metrics_only=34；reference_boundary=8。

## 动态设定变化事件（描述性）

车辆 profile 已绑定设定值→实测值响应分析；表内为各源文件分别统计后的汇总，不跨文件拼接，不含标准限值，也不生成动态性能合格结论。

| 资料包 | 文件数 | 已计算文件 | 事件数 | 完成保持窗口 | 未稳定/数据不足 | 采样缺口 | 最大观测间隔（s） |
|---|---:|---:|---:|---:|---:|---:|---:|
| 企业资料包02_氢质氢离 | 170 | 139 | 15,281 | 3,727 | 11,554 | 0 | 1 |

## 耐久跨报告可比性筛查（描述性）

该筛查只比较报告元数据、功率点集合、表头集合和报告时间关系；它不是耐久方法等效、统计显著性或企业验收判定。
机器筛查边界：仅作跨报告元数据、功率集合和时间关系筛查；不证明耐久方法、循环等效性、统计显著性或企业验收限值。

| 资料包 | 审计状态 | 元数据/功率集合可比 | 结束时间证据完整 | 间隔数 | 重叠数 | 问题代码 |
|---|---|---|---|---:|---:|---|
| 企业资料包02_氢质氢离 | screened | 否 | 是 | 7 | 0 | DURABILITY_COMPARABILITY_STACK_MODEL_MISMATCH |

| 资料包 | 检查项 | 状态 | 报告数 | 缺失数 | 不同值数 |
|---|---|---|---:|---:|---:|
| 企业资料包02_氢质氢离 | system_name | consistent | 8 | 0 | 1 |
| 企业资料包02_氢质氢离 | stack_model | mismatch | 8 | 0 | 2 |
| 企业资料包02_氢质氢离 | step_count | consistent | 8 | 0 | 1 |
| 企业资料包02_氢质氢离 | point_count | consistent | 8 | 0 | 1 |
| 企业资料包02_氢质氢离 | target_power_set | consistent | 8 | 0 | 1 |
| 企业资料包02_氢质氢离 | header_set | consistent | 8 | 0 | 1 |

### 包 01 工作簿证据

| 证据项 | 数量 | 已解析 | 静态矩阵 | 有效点 | 缺失点 | 检测项目 |
|---|---:|---:|---:|---:|---:|---:|
| 工作表 | 8 | 8 | 4 | 185,089 | 590 | 24 |
| 静态矩阵通道 | 1,196 | — | — | — | — | — |
| 极化/稳定点 | 27 / 1 | — | — | — | — | — |
| 身份/参数目录 | 2 / 24 | — | — | — | — | — |
公式审计：6,572 个公式单元格；缓存值 6,572 个；未缓存 0 个；状态 review_required；宏 否；外部链接 否。SheetJS 不执行或重算公式，正式验收前必须绑定企业公式复核证据。

## 全文件使用台账

| # | 资料包 | 文件 | 状态 | 原始数据解析器 | 行/功率点 | 证据深度 | 用途层级 | 执行原始解析器 | 进入适配器 | 参考内容审计 | 参考声明数 | 正式符合性声明 |
|---:|---|---|---|---|---:|---|---|---|---:|---|---:|---|
| 1 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/00_企业资料说明.pdf | reference_only · 仅参考 | PDF reference inventory | 0 | reference_boundary | 参考边界 | 否 | 0 | extracted_reference · pdftotext layout text | 3 | 否 |
| 2 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-4-18-56-04.txt | processed · 已进入适配器 | GB18030 text → enterprise adapter → stack | 132 | generic_metrics_only | 已处理并汇总 | 是 | 132 | 不适用 | 0 | 否 |
| 3 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-4-19-00-50.txt | processed · 已进入适配器 | GB18030 text → enterprise adapter → stack | 3,671 | descriptive_interval | 已处理并汇总 | 是 | 3,671 | 不适用 | 0 | 否 |
| 4 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-4-20-02-03.txt | processed · 已进入适配器 | GB18030 text → enterprise adapter → stack | 5,922 | descriptive_interval | 已处理并汇总 | 是 | 5,922 | 不适用 | 0 | 否 |
| 5 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-4-21-40-48.txt | processed · 已进入适配器 | GB18030 text → enterprise adapter → stack | 23,974 | descriptive_interval | 已处理并汇总 | 是 | 23,974 | 不适用 | 0 | 否 |
| 6 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-5-11-32-54.txt | processed · 已进入适配器 | GB18030 text → enterprise adapter → stack | 543 | generic_metrics_only | 已处理并汇总 | 是 | 543 | 不适用 | 0 | 否 |
| 7 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-5-13-16-20.txt | blocked_binary · 二进制阻断 | GB18030/TSV 识别器 | 0 | reference_boundary | 二进制阻断边界 | 否 | 0 | 不适用 | 0 | 否 |
| 8 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-5-14-15-50.txt | processed · 已进入适配器 | GB18030 text → enterprise adapter → stack | 7,304 | descriptive_interval | 已处理并汇总 | 是 | 7,304 | 不适用 | 0 | 否 |
| 9 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-5-16-17-37.txt | processed · 已进入适配器 | GB18030 text → enterprise adapter → stack | 535 | generic_metrics_only | 已处理并汇总 | 是 | 535 | 不适用 | 0 | 否 |
| 10 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-5-4-20-31.txt | processed · 已进入适配器 | GB18030 text → enterprise adapter → stack | 14,647 | descriptive_interval | 已处理并汇总 | 是 | 14,647 | 不适用 | 0 | 否 |
| 11 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-5-8-24-45.txt | processed · 已进入适配器 | GB18030 text → enterprise adapter → stack | 58 | generic_metrics_only | 已处理并汇总 | 是 | 58 | 不适用 | 0 | 否 |
| 12 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/2026-4-5-8-25-50.txt | processed · 已进入适配器 | GB18030 text → enterprise adapter → stack | 786 | descriptive_interval | 已处理并汇总 | 是 | 786 | 不适用 | 0 | 否 |
| 13 | 企业资料包01_氢璞创能 | 企业资料包01_氢璞创能/299-001-D_出厂检测报告.xlsx | processed · 已进入适配器 | XLSX data-sheet selector → stack | 5,341 | descriptive_interval | 已处理并汇总 | 是 | 5,341 | 不适用 | 0 | 否 |
| 14 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/00_企业资料说明.pdf | reference_only · 仅参考 | PDF reference inventory | 0 | reference_boundary | 参考边界 | 否 | 0 | extracted_reference · pdftotext layout text | 3 | 否 |
| 15 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/01_耐久原始数据处理/耐久0-5-20260605211610.docx | processed · 已进入适配器 | DOCX → durability adapter | 60 | descriptive_interval | 已处理并汇总 | 是 | 60 | 不适用 | 0 | 否 |
| 16 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/01_耐久原始数据处理/耐久10-15-20260606081413.docx | processed · 已进入适配器 | DOCX → durability adapter | 60 | descriptive_interval | 已处理并汇总 | 是 | 60 | 不适用 | 0 | 否 |
| 17 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/01_耐久原始数据处理/耐久15-20-20260606133914.docx | processed · 已进入适配器 | DOCX → durability adapter | 60 | descriptive_interval | 已处理并汇总 | 是 | 60 | 不适用 | 0 | 否 |
| 18 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/01_耐久原始数据处理/耐久25-30-20260607051025.docx | processed · 已进入适配器 | DOCX → durability adapter | 60 | descriptive_interval | 已处理并汇总 | 是 | 60 | 不适用 | 0 | 否 |
| 19 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/01_耐久原始数据处理/耐久30-35-20260607103407.docx | processed · 已进入适配器 | DOCX → durability adapter | 60 | descriptive_interval | 已处理并汇总 | 是 | 60 | 不适用 | 0 | 否 |
| 20 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/01_耐久原始数据处理/耐久35-40-20260607160018.docx | processed · 已进入适配器 | DOCX → durability adapter | 60 | descriptive_interval | 已处理并汇总 | 是 | 60 | 不适用 | 0 | 否 |
| 21 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/01_耐久原始数据处理/耐久40-45-20260608020949.docx | processed · 已进入适配器 | DOCX → durability adapter | 60 | descriptive_interval | 已处理并汇总 | 是 | 60 | 不适用 | 0 | 否 |
| 22 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/01_耐久原始数据处理/耐久5-10-20260606024937.docx | processed · 已进入适配器 | DOCX → durability adapter | 60 | descriptive_interval | 已处理并汇总 | 是 | 60 | 不适用 | 0 | 否 |
| 23 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (1).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,294 | descriptive_interval | 已处理并汇总 | 是 | 20,294 | 不适用 | 0 | 否 |
| 24 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (10).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 2,477 | dynamic_event_only | 已处理并汇总 | 是 | 2,477 | 不适用 | 0 | 否 |
| 25 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (11).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 16,671 | descriptive_interval | 已处理并汇总 | 是 | 16,671 | 不适用 | 0 | 否 |
| 26 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (12).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 10,155 | descriptive_interval | 已处理并汇总 | 是 | 10,155 | 不适用 | 0 | 否 |
| 27 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (13).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 4,709 | descriptive_interval | 已处理并汇总 | 是 | 4,709 | 不适用 | 0 | 否 |
| 28 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (14).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 8,342 | descriptive_interval | 已处理并汇总 | 是 | 8,342 | 不适用 | 0 | 否 |
| 29 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (15).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 17,210 | descriptive_interval | 已处理并汇总 | 是 | 17,210 | 不适用 | 0 | 否 |
| 30 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (16).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,436 | descriptive_interval | 已处理并汇总 | 是 | 20,436 | 不适用 | 0 | 否 |
| 31 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (17).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 16,155 | descriptive_interval | 已处理并汇总 | 是 | 16,155 | 不适用 | 0 | 否 |
| 32 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (18).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 5,310 | generic_metrics_only | 已处理并汇总 | 是 | 5,310 | 不适用 | 0 | 否 |
| 33 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (19).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 8,613 | descriptive_interval | 已处理并汇总 | 是 | 8,613 | 不适用 | 0 | 否 |
| 34 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (2).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 10,378 | descriptive_interval | 已处理并汇总 | 是 | 10,378 | 不适用 | 0 | 否 |
| 35 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (20).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 4,344 | dynamic_event_only | 已处理并汇总 | 是 | 4,344 | 不适用 | 0 | 否 |
| 36 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (21).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,203 | descriptive_interval | 已处理并汇总 | 是 | 20,203 | 不适用 | 0 | 否 |
| 37 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (22).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 17,542 | descriptive_interval | 已处理并汇总 | 是 | 17,542 | 不适用 | 0 | 否 |
| 38 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (23).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 16,473 | descriptive_interval | 已处理并汇总 | 是 | 16,473 | 不适用 | 0 | 否 |
| 39 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (24).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,475 | descriptive_interval | 已处理并汇总 | 是 | 20,475 | 不适用 | 0 | 否 |
| 40 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (25).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 4,073 | generic_metrics_only | 已处理并汇总 | 是 | 4,073 | 不适用 | 0 | 否 |
| 41 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (26).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,922 | descriptive_interval | 已处理并汇总 | 是 | 20,922 | 不适用 | 0 | 否 |
| 42 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (27).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 9,916 | descriptive_interval | 已处理并汇总 | 是 | 9,916 | 不适用 | 0 | 否 |
| 43 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (28).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 2,599 | generic_metrics_only | 已处理并汇总 | 是 | 2,599 | 不适用 | 0 | 否 |
| 44 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (29).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 156 | generic_metrics_only | 已处理并汇总 | 是 | 156 | 不适用 | 0 | 否 |
| 45 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (3).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 19,271 | descriptive_interval | 已处理并汇总 | 是 | 19,271 | 不适用 | 0 | 否 |
| 46 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (30).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 47 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (31).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 17,873 | descriptive_interval | 已处理并汇总 | 是 | 17,873 | 不适用 | 0 | 否 |
| 48 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (32).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 12,092 | descriptive_interval | 已处理并汇总 | 是 | 12,092 | 不适用 | 0 | 否 |
| 49 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (33).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 4,646 | generic_metrics_only | 已处理并汇总 | 是 | 4,646 | 不适用 | 0 | 否 |
| 50 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (34).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 18,924 | descriptive_interval | 已处理并汇总 | 是 | 18,924 | 不适用 | 0 | 否 |
| 51 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (35).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 52 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (36).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 19,217 | descriptive_interval | 已处理并汇总 | 是 | 19,217 | 不适用 | 0 | 否 |
| 53 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (37).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 289 | generic_metrics_only | 已处理并汇总 | 是 | 289 | 不适用 | 0 | 否 |
| 54 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (38).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 9,867 | descriptive_interval | 已处理并汇总 | 是 | 9,867 | 不适用 | 0 | 否 |
| 55 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (39).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 15,101 | descriptive_interval | 已处理并汇总 | 是 | 15,101 | 不适用 | 0 | 否 |
| 56 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (4).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 15,504 | descriptive_interval | 已处理并汇总 | 是 | 15,504 | 不适用 | 0 | 否 |
| 57 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (40).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 15,758 | descriptive_interval | 已处理并汇总 | 是 | 15,758 | 不适用 | 0 | 否 |
| 58 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (41).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 7,209 | dynamic_event_only | 已处理并汇总 | 是 | 7,209 | 不适用 | 0 | 否 |
| 59 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (42).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 8,307 | descriptive_interval | 已处理并汇总 | 是 | 8,307 | 不适用 | 0 | 否 |
| 60 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (43).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,296 | descriptive_interval | 已处理并汇总 | 是 | 21,296 | 不适用 | 0 | 否 |
| 61 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (44).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 12,122 | descriptive_interval | 已处理并汇总 | 是 | 12,122 | 不适用 | 0 | 否 |
| 62 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (45).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 4,467 | generic_metrics_only | 已处理并汇总 | 是 | 4,467 | 不适用 | 0 | 否 |
| 63 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (46).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 13,010 | descriptive_interval | 已处理并汇总 | 是 | 13,010 | 不适用 | 0 | 否 |
| 64 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (47).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 10,636 | descriptive_interval | 已处理并汇总 | 是 | 10,636 | 不适用 | 0 | 否 |
| 65 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (48).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 18,944 | descriptive_interval | 已处理并汇总 | 是 | 18,944 | 不适用 | 0 | 否 |
| 66 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (49).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 6,242 | descriptive_interval | 已处理并汇总 | 是 | 6,242 | 不适用 | 0 | 否 |
| 67 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (5).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,416 | descriptive_interval | 已处理并汇总 | 是 | 20,416 | 不适用 | 0 | 否 |
| 68 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (50).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 5,674 | descriptive_interval | 已处理并汇总 | 是 | 5,674 | 不适用 | 0 | 否 |
| 69 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (51).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 17,661 | descriptive_interval | 已处理并汇总 | 是 | 17,661 | 不适用 | 0 | 否 |
| 70 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (52).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 90 | generic_metrics_only | 已处理并汇总 | 是 | 90 | 不适用 | 0 | 否 |
| 71 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (53).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 17,803 | descriptive_interval | 已处理并汇总 | 是 | 17,803 | 不适用 | 0 | 否 |
| 72 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (54).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | generic_metrics_only | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 73 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (55).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 10,768 | dynamic_event_only | 已处理并汇总 | 是 | 10,768 | 不适用 | 0 | 否 |
| 74 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (56).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 11,827 | descriptive_interval | 已处理并汇总 | 是 | 11,827 | 不适用 | 0 | 否 |
| 75 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (57).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 8,024 | descriptive_interval | 已处理并汇总 | 是 | 8,024 | 不适用 | 0 | 否 |
| 76 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (58).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 4,019 | generic_metrics_only | 已处理并汇总 | 是 | 4,019 | 不适用 | 0 | 否 |
| 77 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (59).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 78 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (6).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,279 | descriptive_interval | 已处理并汇总 | 是 | 20,279 | 不适用 | 0 | 否 |
| 79 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (60).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,278 | descriptive_interval | 已处理并汇总 | 是 | 21,278 | 不适用 | 0 | 否 |
| 80 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (61).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 11,618 | descriptive_interval | 已处理并汇总 | 是 | 11,618 | 不适用 | 0 | 否 |
| 81 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (62).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 14,599 | generic_metrics_only | 已处理并汇总 | 是 | 14,599 | 不适用 | 0 | 否 |
| 82 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (63).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 3,064 | generic_metrics_only | 已处理并汇总 | 是 | 3,064 | 不适用 | 0 | 否 |
| 83 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (64).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 13,062 | descriptive_interval | 已处理并汇总 | 是 | 13,062 | 不适用 | 0 | 否 |
| 84 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (65).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 13,388 | descriptive_interval | 已处理并汇总 | 是 | 13,388 | 不适用 | 0 | 否 |
| 85 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (66).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 17,298 | descriptive_interval | 已处理并汇总 | 是 | 17,298 | 不适用 | 0 | 否 |
| 86 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (67).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 155 | dynamic_event_only | 已处理并汇总 | 是 | 155 | 不适用 | 0 | 否 |
| 87 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (68).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 6,029 | descriptive_interval | 已处理并汇总 | 是 | 6,029 | 不适用 | 0 | 否 |
| 88 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (69).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 401 | generic_metrics_only | 已处理并汇总 | 是 | 401 | 不适用 | 0 | 否 |
| 89 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (7).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 10,398 | dynamic_event_only | 已处理并汇总 | 是 | 10,398 | 不适用 | 0 | 否 |
| 90 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (70).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 13,368 | descriptive_interval | 已处理并汇总 | 是 | 13,368 | 不适用 | 0 | 否 |
| 91 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (71).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 14,563 | descriptive_interval | 已处理并汇总 | 是 | 14,563 | 不适用 | 0 | 否 |
| 92 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (72).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 3,740 | descriptive_interval | 已处理并汇总 | 是 | 3,740 | 不适用 | 0 | 否 |
| 93 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (73).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 3,195 | dynamic_event_only | 已处理并汇总 | 是 | 3,195 | 不适用 | 0 | 否 |
| 94 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (74).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 16,773 | descriptive_interval | 已处理并汇总 | 是 | 16,773 | 不适用 | 0 | 否 |
| 95 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (75).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 10,920 | generic_metrics_only | 已处理并汇总 | 是 | 10,920 | 不适用 | 0 | 否 |
| 96 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (76).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 2,593 | descriptive_interval | 已处理并汇总 | 是 | 2,593 | 不适用 | 0 | 否 |
| 97 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (77).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 98 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (78).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 99 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (79).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 13,592 | descriptive_interval | 已处理并汇总 | 是 | 13,592 | 不适用 | 0 | 否 |
| 100 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (8).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,748 | descriptive_interval | 已处理并汇总 | 是 | 20,748 | 不适用 | 0 | 否 |
| 101 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (80).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 9,177 | descriptive_interval | 已处理并汇总 | 是 | 9,177 | 不适用 | 0 | 否 |
| 102 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (81).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 13,121 | descriptive_interval | 已处理并汇总 | 是 | 13,121 | 不适用 | 0 | 否 |
| 103 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (82).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 877 | dynamic_event_only | 已处理并汇总 | 是 | 877 | 不适用 | 0 | 否 |
| 104 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (83).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,552 | descriptive_interval | 已处理并汇总 | 是 | 20,552 | 不适用 | 0 | 否 |
| 105 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (84).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,314 | descriptive_interval | 已处理并汇总 | 是 | 21,314 | 不适用 | 0 | 否 |
| 106 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (85).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 107 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (86).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | generic_metrics_only | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 108 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (87).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 18,154 | descriptive_interval | 已处理并汇总 | 是 | 18,154 | 不适用 | 0 | 否 |
| 109 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (88).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 17,422 | descriptive_interval | 已处理并汇总 | 是 | 17,422 | 不适用 | 0 | 否 |
| 110 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (89).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 15,193 | descriptive_interval | 已处理并汇总 | 是 | 15,193 | 不适用 | 0 | 否 |
| 111 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/212/201480_202607071800_202607072359_CH0_20260807_225246 (9).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 18,455 | descriptive_interval | 已处理并汇总 | 是 | 18,455 | 不适用 | 0 | 否 |
| 112 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (1).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 12,945 | descriptive_interval | 已处理并汇总 | 是 | 12,945 | 不适用 | 0 | 否 |
| 113 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (10).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 124 | generic_metrics_only | 已处理并汇总 | 是 | 124 | 不适用 | 0 | 否 |
| 114 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (11).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 24 | generic_metrics_only | 已处理并汇总 | 是 | 24 | 不适用 | 0 | 否 |
| 115 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (12).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,631 | descriptive_interval | 已处理并汇总 | 是 | 20,631 | 不适用 | 0 | 否 |
| 116 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (13).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 18,766 | descriptive_interval | 已处理并汇总 | 是 | 18,766 | 不适用 | 0 | 否 |
| 117 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (14).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 13,551 | descriptive_interval | 已处理并汇总 | 是 | 13,551 | 不适用 | 0 | 否 |
| 118 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (15).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,143 | descriptive_interval | 已处理并汇总 | 是 | 20,143 | 不适用 | 0 | 否 |
| 119 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (16).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 12,310 | descriptive_interval | 已处理并汇总 | 是 | 12,310 | 不适用 | 0 | 否 |
| 120 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (17).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 17,454 | descriptive_interval | 已处理并汇总 | 是 | 17,454 | 不适用 | 0 | 否 |
| 121 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (18).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 115 | generic_metrics_only | 已处理并汇总 | 是 | 115 | 不适用 | 0 | 否 |
| 122 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (19).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 234 | generic_metrics_only | 已处理并汇总 | 是 | 234 | 不适用 | 0 | 否 |
| 123 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (2).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 124 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (20).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,960 | descriptive_interval | 已处理并汇总 | 是 | 20,960 | 不适用 | 0 | 否 |
| 125 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (21).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 15,776 | descriptive_interval | 已处理并汇总 | 是 | 15,776 | 不适用 | 0 | 否 |
| 126 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (22).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 1,006 | dynamic_event_only | 已处理并汇总 | 是 | 1,006 | 不适用 | 0 | 否 |
| 127 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (23).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 9,222 | descriptive_interval | 已处理并汇总 | 是 | 9,222 | 不适用 | 0 | 否 |
| 128 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (24).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 3,210 | descriptive_interval | 已处理并汇总 | 是 | 3,210 | 不适用 | 0 | 否 |
| 129 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (25).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 19,952 | descriptive_interval | 已处理并汇总 | 是 | 19,952 | 不适用 | 0 | 否 |
| 130 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (26).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 11,575 | descriptive_interval | 已处理并汇总 | 是 | 11,575 | 不适用 | 0 | 否 |
| 131 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (27).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,620 | descriptive_interval | 已处理并汇总 | 是 | 20,620 | 不适用 | 0 | 否 |
| 132 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (28).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,597 | descriptive_interval | 已处理并汇总 | 是 | 20,597 | 不适用 | 0 | 否 |
| 133 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (29).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 226 | generic_metrics_only | 已处理并汇总 | 是 | 226 | 不适用 | 0 | 否 |
| 134 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (3).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 19,450 | descriptive_interval | 已处理并汇总 | 是 | 19,450 | 不适用 | 0 | 否 |
| 135 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (30).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 279 | dynamic_event_only | 已处理并汇总 | 是 | 279 | 不适用 | 0 | 否 |
| 136 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (31).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 137 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (32).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 11,560 | descriptive_interval | 已处理并汇总 | 是 | 11,560 | 不适用 | 0 | 否 |
| 138 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (33).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 1,942 | descriptive_interval | 已处理并汇总 | 是 | 1,942 | 不适用 | 0 | 否 |
| 139 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (34).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 140 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (35).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,578 | descriptive_interval | 已处理并汇总 | 是 | 21,578 | 不适用 | 0 | 否 |
| 141 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (36).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 11,908 | descriptive_interval | 已处理并汇总 | 是 | 11,908 | 不适用 | 0 | 否 |
| 142 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (37).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 4,612 | generic_metrics_only | 已处理并汇总 | 是 | 4,612 | 不适用 | 0 | 否 |
| 143 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (38).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 19,203 | descriptive_interval | 已处理并汇总 | 是 | 19,203 | 不适用 | 0 | 否 |
| 144 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (39).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 145 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (4).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 12,062 | descriptive_interval | 已处理并汇总 | 是 | 12,062 | 不适用 | 0 | 否 |
| 146 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (40).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 15,560 | descriptive_interval | 已处理并汇总 | 是 | 15,560 | 不适用 | 0 | 否 |
| 147 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (41).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 6,444 | generic_metrics_only | 已处理并汇总 | 是 | 6,444 | 不适用 | 0 | 否 |
| 148 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (42).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 19,186 | descriptive_interval | 已处理并汇总 | 是 | 19,186 | 不适用 | 0 | 否 |
| 149 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (43).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 12,061 | descriptive_interval | 已处理并汇总 | 是 | 12,061 | 不适用 | 0 | 否 |
| 150 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (44).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 16,338 | descriptive_interval | 已处理并汇总 | 是 | 16,338 | 不适用 | 0 | 否 |
| 151 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (45).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 3,733 | generic_metrics_only | 已处理并汇总 | 是 | 3,733 | 不适用 | 0 | 否 |
| 152 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (46).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 12,810 | descriptive_interval | 已处理并汇总 | 是 | 12,810 | 不适用 | 0 | 否 |
| 153 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (47).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,180 | descriptive_interval | 已处理并汇总 | 是 | 21,180 | 不适用 | 0 | 否 |
| 154 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (48).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 15,905 | descriptive_interval | 已处理并汇总 | 是 | 15,905 | 不适用 | 0 | 否 |
| 155 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (49).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 277 | generic_metrics_only | 已处理并汇总 | 是 | 277 | 不适用 | 0 | 否 |
| 156 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (5).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,389 | descriptive_interval | 已处理并汇总 | 是 | 21,389 | 不适用 | 0 | 否 |
| 157 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (50).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 4,036 | descriptive_interval | 已处理并汇总 | 是 | 4,036 | 不适用 | 0 | 否 |
| 158 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (51).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 12,660 | descriptive_interval | 已处理并汇总 | 是 | 12,660 | 不适用 | 0 | 否 |
| 159 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (52).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 8,240 | descriptive_interval | 已处理并汇总 | 是 | 8,240 | 不适用 | 0 | 否 |
| 160 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (53).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 13,408 | descriptive_interval | 已处理并汇总 | 是 | 13,408 | 不适用 | 0 | 否 |
| 161 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (54).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 2,729 | descriptive_interval | 已处理并汇总 | 是 | 2,729 | 不适用 | 0 | 否 |
| 162 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (55).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 10,598 | descriptive_interval | 已处理并汇总 | 是 | 10,598 | 不适用 | 0 | 否 |
| 163 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (56).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 20,328 | descriptive_interval | 已处理并汇总 | 是 | 20,328 | 不适用 | 0 | 否 |
| 164 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (57).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 15,946 | descriptive_interval | 已处理并汇总 | 是 | 15,946 | 不适用 | 0 | 否 |
| 165 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (58).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 16,834 | generic_metrics_only | 已处理并汇总 | 是 | 16,834 | 不适用 | 0 | 否 |
| 166 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (59).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 167 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (6).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 14,934 | descriptive_interval | 已处理并汇总 | 是 | 14,934 | 不适用 | 0 | 否 |
| 168 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (60).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 169 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (61).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 170 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (62).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | dynamic_event_only | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 171 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (63).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 172 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (64).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 173 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (65).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 9,918 | descriptive_interval | 已处理并汇总 | 是 | 9,918 | 不适用 | 0 | 否 |
| 174 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (66).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 19,427 | descriptive_interval | 已处理并汇总 | 是 | 19,427 | 不适用 | 0 | 否 |
| 175 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (67).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 3,024 | descriptive_interval | 已处理并汇总 | 是 | 3,024 | 不适用 | 0 | 否 |
| 176 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (68).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,507 | descriptive_interval | 已处理并汇总 | 是 | 21,507 | 不适用 | 0 | 否 |
| 177 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (69).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 842 | dynamic_event_only | 已处理并汇总 | 是 | 842 | 不适用 | 0 | 否 |
| 178 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (7).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 797 | dynamic_event_only | 已处理并汇总 | 是 | 797 | 不适用 | 0 | 否 |
| 179 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (70).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 5,467 | generic_metrics_only | 已处理并汇总 | 是 | 5,467 | 不适用 | 0 | 否 |
| 180 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (71).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 102 | generic_metrics_only | 已处理并汇总 | 是 | 102 | 不适用 | 0 | 否 |
| 181 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (72).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 448 | descriptive_interval | 已处理并汇总 | 是 | 448 | 不适用 | 0 | 否 |
| 182 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (73).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 1 | generic_metrics_only | 已处理并汇总 | 是 | 1 | 不适用 | 0 | 否 |
| 183 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (74).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 1 | generic_metrics_only | 已处理并汇总 | 是 | 1 | 不适用 | 0 | 否 |
| 184 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (75).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 3,569 | generic_metrics_only | 已处理并汇总 | 是 | 3,569 | 不适用 | 0 | 否 |
| 185 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (76).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 18,566 | descriptive_interval | 已处理并汇总 | 是 | 18,566 | 不适用 | 0 | 否 |
| 186 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (77).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 19,211 | descriptive_interval | 已处理并汇总 | 是 | 19,211 | 不适用 | 0 | 否 |
| 187 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (78).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 14,445 | descriptive_interval | 已处理并汇总 | 是 | 14,445 | 不适用 | 0 | 否 |
| 188 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (79).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 15,392 | descriptive_interval | 已处理并汇总 | 是 | 15,392 | 不适用 | 0 | 否 |
| 189 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (8).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 21,600 | descriptive_interval | 已处理并汇总 | 是 | 21,600 | 不适用 | 0 | 否 |
| 190 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (80).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 19,372 | descriptive_interval | 已处理并汇总 | 是 | 19,372 | 不适用 | 0 | 否 |
| 191 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (81).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 2,688 | descriptive_interval | 已处理并汇总 | 是 | 2,688 | 不适用 | 0 | 否 |
| 192 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/02_整车数据处理/345/201487_202607070600_202607071159_CH0_20260807_225858 (9).csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → vehicle | 18,989 | descriptive_interval | 已处理并汇总 | 是 | 18,989 | 不适用 | 0 | 否 |
| 193 | 企业资料包02_氢质氢离 | 企业资料包02_氢质氢离/数据统计功能实现需求-20260807.docx | reference_only · 仅参考 | DOCX requirement/reference reader | 0 | reference_boundary | 参考边界 | 否 | 0 | extracted_reference · pandoc plain text | 4 | 否 |
| 194 | 企业资料包03_青川易创与云汉达 | 企业资料包03_青川易创与云汉达/00_企业资料说明.pdf | reference_only · 仅参考 | PDF reference inventory | 0 | reference_boundary | 参考边界 | 否 | 0 | extracted_reference · pdftotext layout text | 3 | 否 |
| 195 | 企业资料包03_青川易创与云汉达 | 企业资料包03_青川易创与云汉达/01 宽温域PEM制氢与氢燃料电池电堆技术开发与应用-青川科技(260314-FC).pdf | reference_only · 仅参考 | PDF reference inventory | 0 | reference_boundary | 参考边界 | 否 | 0 | extracted_reference · pdftotext layout text | 1 | 否 |
| 196 | 企业资料包03_青川易创与云汉达 | 企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv | processed · 已进入适配器 | UTF-8 text → enterprise adapter → stack | 38,257 | descriptive_interval | 已处理并汇总 | 是 | 38,257 | 不适用 | 0 | 否 |
| 197 | 企业资料包03_青川易创与云汉达 | 企业资料包03_青川易创与云汉达/03 青川科技-燃料电池电堆时序测试数据处理任务说明书.docx | reference_only · 仅参考 | DOCX requirement/reference reader | 0 | reference_boundary | 参考边界 | 否 | 0 | extracted_reference · pandoc plain text | 4 | 否 |
| 198 | 企业资料包04_海珀特 | 企业资料包04_海珀特/00_企业资料说明.pdf | declared_no_upload · 明确未上传 | 说明文件审计 | 0 | reference_boundary | 未上传边界 | 否 | 0 | extracted_reference · pdftotext layout text | 3 | 否 |

## 未进入时序适配器的文件

| 文件 | 状态 | 解析器 | 边界 |
|---|---|---|---|
| 企业资料包01_氢璞创能/00_企业资料说明.pdf | reference_only · 仅参考 | PDF reference inventory | 进入 T02 需求/标准边界人工映射，不进入原始时序 KPI |
| 企业资料包01_氢璞创能/2026-4-5-13-16-20.txt | blocked_binary · 二进制阻断 | GB18030/TSV 识别器 | 保留文件哈希和阻断原因；未伪造文本解析或测试结论。 |
| 企业资料包02_氢质氢离/00_企业资料说明.pdf | reference_only · 仅参考 | PDF reference inventory | 进入 T02 需求/标准边界人工映射，不进入原始时序 KPI |
| 企业资料包02_氢质氢离/数据统计功能实现需求-20260807.docx | reference_only · 仅参考 | DOCX requirement/reference reader | 进入 T02 需求矩阵人工映射，不进入原始时序 KPI |
| 企业资料包03_青川易创与云汉达/00_企业资料说明.pdf | reference_only · 仅参考 | PDF reference inventory | 进入 T02 需求/标准边界人工映射，不进入原始时序 KPI |
| 企业资料包03_青川易创与云汉达/01 宽温域PEM制氢与氢燃料电池电堆技术开发与应用-青川科技(260314-FC).pdf | reference_only · 仅参考 | PDF reference inventory | 进入 T02 需求/标准边界人工映射，不进入原始时序 KPI |
| 企业资料包03_青川易创与云汉达/03 青川科技-燃料电池电堆时序测试数据处理任务说明书.docx | reference_only · 仅参考 | DOCX requirement/reference reader | 进入 T02 需求矩阵人工映射，不进入原始时序 KPI |
| 企业资料包04_海珀特/00_企业资料说明.pdf | declared_no_upload · 明确未上传 | 说明文件审计 | 企业说明声明暂无实际资料文件；不把声明文件当作测试数据。 |

## 参考资料映射台账

| 来源文件 | 声明 | 状态 | 关键词证据完整 | 边界 |
|---|---|---|---|---|
| 企业资料包01_氢璞创能/00_企业资料说明.pdf | scope_and_boundary | used_as_boundary | 是 | 只用于产品范围和证据边界，不生成标准限值。 |
| 企业资料包01_氢璞创能/00_企业资料说明.pdf | source_inventory | implemented | 是 | 记录文件、哈希、解析器和状态；不把说明文件当作时序 KPI。 |
| 企业资料包01_氢璞创能/00_企业资料说明.pdf | data_use_boundary | implemented | 是 | 仓库只保存脱敏样例和派生审计，不复制原始企业资料。 |
| 企业资料包02_氢质氢离/00_企业资料说明.pdf | scope_and_boundary | used_as_boundary | 是 | 只用于产品范围和证据边界，不生成标准限值。 |
| 企业资料包02_氢质氢离/00_企业资料说明.pdf | source_inventory | implemented | 是 | 记录文件、哈希、解析器和状态；不把说明文件当作时序 KPI。 |
| 企业资料包02_氢质氢离/00_企业资料说明.pdf | data_use_boundary | implemented | 是 | 仓库只保存脱敏样例和派生审计，不复制原始企业资料。 |
| 企业资料包02_氢质氢离/数据统计功能实现需求-20260807.docx | vehicle_signal_dashboard | implemented | 是 | 双轴是展示/核对能力，不把不同量纲混入 KPI。 |
| 企业资料包02_氢质氢离/数据统计功能实现需求-20260807.docx | vehicle_target_segments | implemented | 是 | 目标、容差和最短持续时间由配置传入；不足时不形成正式性能点。 |
| 企业资料包02_氢质氢离/数据统计功能实现需求-20260807.docx | vehicle_insulation_forecast | implemented | 是 | 350/250 kΩ 来自企业功能需求，不是 ISO/GB 安全认证限值。 |
| 企业资料包02_氢质氢离/数据统计功能实现需求-20260807.docx | durability_alert_and_increment | partial | 是 | 功率点、dry-run/确认发送和受控 once/interval 扫描已实现；企业调度器、群策略和工单闭环未接入。 |
| 企业资料包03_青川易创与云汉达/00_企业资料说明.pdf | scope_and_boundary | used_as_boundary | 是 | 只用于产品范围和证据边界，不生成标准限值。 |
| 企业资料包03_青川易创与云汉达/00_企业资料说明.pdf | source_inventory | implemented | 是 | 记录文件、哈希、解析器和状态；不把说明文件当作时序 KPI。 |
| 企业资料包03_青川易创与云汉达/00_企业资料说明.pdf | data_use_boundary | implemented | 是 | 仓库只保存脱敏样例和派生审计，不复制原始企业资料。 |
| 企业资料包03_青川易创与云汉达/01 宽温域PEM制氢与氢燃料电池电堆技术开发与应用-青川科技(260314-FC).pdf | product_context_only | reference_only | 是 | 不把宣传材料中的性能描述当作测试验收限值或标准证据。 |
| 企业资料包03_青川易创与云汉达/03 青川科技-燃料电池电堆时序测试数据处理任务说明书.docx | configurable_parameters | implemented_with_boundary | 是 | 系统提供配置入口和默认模板；正式值必须来自企业批准参数表。 |
| 企业资料包03_青川易创与云汉达/03 青川科技-燃料电池电堆时序测试数据处理任务说明书.docx | platform_stability_rules | implemented_with_boundary | 是 | 数值作为任务说明书默认模板并可由参数表覆盖；不能当作国家标准通用限值。 |
| 企业资料包03_青川易创与云汉达/03 青川科技-燃料电池电堆时序测试数据处理任务说明书.docx | stack_metrics_and_quality | partial | 是 | 已有可映射字段的指标、目录和日志；未提供企业规则的扩展曲线不自动判定。 |
| 企业资料包03_青川易创与云汉达/03 青川科技-燃料电池电堆时序测试数据处理任务说明书.docx | excel_and_traceability | partial | 是 | 14 表、公式、图表结构、哈希和处理日志已实现；企业对象存储、人工签改系统和 Excel/WPS 视觉验收仍待接入。 |
| 企业资料包04_海珀特/00_企业资料说明.pdf | scope_and_boundary | used_as_boundary | 是 | 只用于产品范围和证据边界，不生成标准限值。 |
| 企业资料包04_海珀特/00_企业资料说明.pdf | source_inventory | implemented | 是 | 记录文件、哈希、解析器和状态；不把说明文件当作时序 KPI。 |
| 企业资料包04_海珀特/00_企业资料说明.pdf | no_upload_boundary | implemented | 是 | 记录 declared_no_upload；不把命题描述或虚构样例当作企业测试数据。 |

## 标准与企业应用边界

- 本报告证明资料被盘点、分类、解析或明确阻断；不证明 GB/T 45541-2025、GB/T 46104-2025、ISO 22734-1:2025 或 ISO/IEC 17025:2017 的完整符合。
- 缺少企业批准 profile、方法实施证据、仪器精度/校准、不确定度预算、验收限值、批次声明和人工平行验证时，结果只能作为 `ANALYSIS_DRAFT` 或描述性工程证据。
- 参考资料、二进制阻断文件和未上传声明不被伪装为测试数据；跨文件时序也不会自动拼接。

## 可复核入口

- processed 文件数：190；非 processed 边界文件数：8。
- 本报告由 `npm run t02:report` 生成；重新运行覆盖/参考审计后应重新生成同版本报告。

