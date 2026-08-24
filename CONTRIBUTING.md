# 贡献指南

欢迎以 issue、PR 或文档补遗的方式参与 H₂ TestLens 项目。提交前请仔细阅读本文件，确保改动符合项目边界与工程规范。

## 开发环境准备

```bash
# 1. 克隆仓库
git clone git@github.com:lghui12138/h2-testlens-hackathon.git
cd h2-testlens-hackathon

# 2. 安装依赖
npm install

# 3. 确认锁文件已同步
npm ci

# 4. 运行测试
npm test
```

当前测试套件包含 200+ 条 TAP 子测试，覆盖常规用例、边界条件和企业级边缘场景。本地开发时建议同时运行：

```bash
npm run typecheck
npm run check:submission
```

## 代码风格

- **语言**：前端/工具脚本使用 ES 模块（`type: module`），分析内核使用 `.mjs`。
- **缩进**：2 空格，不使用 Tab。
- **命名**： camelCase 用于变量/函数，PascalCase 用于类，文件名使用 kebab-case。
- **字符串**：优先使用单引号；模板字符串仅在需要插值时使用。
- **注释**：关键安全边界和 fail-closed 逻辑必须附注释，说明“为什么不猜/不降级”。
- **提交信息**：建议使用祈使句，如 `fix: block actual volumetric flow without standard-state unit`。

## 添加新的企业 Vendor Pack

项目通过 `src/parsers/field_mapper.mjs`（浏览器）和 `src/config/models.py`（Python）维护企业字段映射。新增 vendor pack 时：

1. 在 `FieldMapper` 中注册新 pack，提供 `name` 和 `aliases`。
2. 别名必须覆盖该企业当前已知的全部表头变体，包括中文、英文、带/不带单位后缀。
3. 若企业数据包含特殊状态码、单位换算或缺失值语义，请在对应 adapter 中显式声明，不得隐式猜测。
4. 在 `tests/` 中补充至少 3 条解析测试：标准表头映射、大小写/空白容错、未知字段保留。
5. 若涉及 T02 真实资料，同步更新 `.research` 目录中的覆盖审计与参考审计。

## 编写测试

- 测试文件放在项目根目录的 `tests/` 下，使用 Node.js 内置 test runner（`node --test`）。
- 每个测试模块应使用 `test('描述', async () => { ... })` 形式，避免深层嵌套。
- 企业数据和演示数据应分离：演示样本放入 `sample-data/`，真实企业数据不入库。
- 边界测试必须覆盖：空值、乱序时间戳、重复表头、混合分隔符、极大/极小数值、负值、缺失列、二进制文件阻断。
- 提交前必须通过：
  ```bash
  npm test           # 全量测试
  npm run eval:ai    # AI grounding 评估
  npm run check:submission  # 提交材料完整性检查
  ```

## 重要边界

- 本仓库是比赛原型，演示阈值不替代企业安全标准。
- 公共页面和分析 API 不返回原始数据行、文件路径哈希或企业敏感标识。
- 标准符合性、认证、放行签核等结论必须由具备资质的工程师在完整证据链下人工完成。
