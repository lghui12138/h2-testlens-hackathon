# 网页与 App 分离说明

## 公开入口

- GitHub 仓库：<https://github.com/lghui12138/h2-testlens-hackathon>
- GitHub Pages：<https://lghui12138.github.io/h2-testlens-hackathon/>
- 当前公开渲染域名：<https://lghui12138.github.io/projects/h2-testlens.html>
- 页面入口：`src/index.html`
- 发布产物：`_site/`，由 `npm run prepare:github-pages` 生成

GitHub Pages 用于今晚提交、评审和公开演示。页面直接加载浏览器分析器、演示样本和配置模板；原始测试行只留在当前浏览器会话，不上传到 GitHub。

## App 入口

- Vinext/React 页面：`app/page.tsx`
- 共享样式：`src/styles.css`
- 共享分析内核：`src/analyzer.mjs`、`src/enterprise-adapters.mjs`、`src/standard-evidence.mjs` 等
- 本地启动：`npm run dev` 或 `npm start`

App 入口用于后续接入企业认证、服务端 API、工单和审计系统；当前仍保持和静态页面相同的计算口径与 fail-closed 标准边界。

## 每轮发布顺序

1. 修改 `src/` 与 `app/` 的对应内容，保持公开网页和 App parity。
2. 运行 `npm test`、`npm run typecheck`、`npm run check:submission`。
3. 运行 `npm run prepare:github-pages`，确认 `_site/index.html` 和相对资源存在。
4. 提交到 `main`；GitHub Actions 自动构建并发布 Pages。

视觉改动只改变呈现层，不改变 KPI、单位换算、数据质量门控、证据引用或标准符合性边界。任何缺少企业批准参数、方法实施证据、仪器溯源或人工签核的结果，仍保持描述性或 `NOT_READY`。
