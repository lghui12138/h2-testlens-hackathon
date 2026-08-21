"use client";

import { useEffect } from "react";
import "../src/styles.css";

const DASHBOARD_HTML = String.raw`
<div class="shell">
  <header class="topbar">
    <a class="brand" href="#top"><span class="brand-mark">H₂</span><span><b>TestLens</b><small>氢能测试智报</small></span></a>
    <div class="topbar-meta"><span class="live-dot"></span><span>ONLINE DEMO</span><span class="divider"></span><span id="last-run">等待数据</span></div>
  </header>
  <main id="top">
    <section class="hero">
      <div class="eyebrow">T02 · 设备测试数据分析与自动报告</div>
      <h1>把一份测试日志，<br><em>变成可执行的结论。</em></h1>
      <p class="hero-copy">面向氢能设备测试工程师的在线优先分析台。自动识别工况、计算关键 KPI、绑定异常证据，并生成一份可以继续复核的中文报告。</p>
      <div class="hero-actions"><label class="upload-button"><input id="file-input" type="file" accept=".csv,text/csv">导入测试 CSV</label><button id="load-demo" class="quiet-button">载入演示样本</button><button id="load-legacy" class="quiet-button">中文/单位样本</button></div>
      <div class="hero-note"><span class="signal-bars"><i></i><i></i><i></i><i></i></span><span id="file-name">等待数据文件</span><span class="muted">·</span><span id="source-count">—</span><span class="muted">·</span><span id="schema-notice" class="schema-notice">等待字段映射</span></div>
    </section>
    <section class="workspace-grid">
      <div class="main-column">
        <section class="section-block"><div class="section-label"><span>01</span><div><b>测试总览</b><small>从数据先看状态，再看原因</small></div><span id="verdict-chip" class="verdict-chip">—</span><span id="compliance-chip" class="compliance-chip">标准符合性未评估</span></div><div id="metric-grid" class="metric-grid"></div></section>
        <section class="section-block trend-section"><div class="section-label"><span>02</span><div><b>工况趋势</b><small>温度与压力沿时间轴的同屏证据</small></div><span class="legend-note">浏览器本地计算 · 可替换为真实 CSV</span></div><div class="chart-wrap"><canvas id="trend-chart" aria-label="温度与压力趋势图"></canvas></div></section>
        <section class="section-block"><div class="section-label"><span>03</span><div><b>风险清单</b><small>每一项都带证据与下一步动作</small></div><span id="issue-count" class="legend-note">—</span></div><div id="issue-list" class="issue-list"></div></section>
      </div>
      <aside class="side-column">
        <section class="side-card report-card"><div class="card-kicker">REPORT DRAFT <span id="report-status">—</span></div><h2>工程师报告草稿</h2><button id="generate-ai" class="ai-button">生成证据约束草稿</button><div id="report-preview" class="report-preview"></div><div class="button-row"><button id="download-report" class="primary-button">下载 Markdown 报告</button><button id="download-json" class="icon-button" title="下载分析证据 JSON">JSON</button></div></section>
        <section class="side-card"><div class="card-kicker">CONFIGURABLE RULES</div><h2>判定阈值</h2><p class="side-intro">按设备模板加载阈值；内置模板仅用于演示，正式部署时应替换为企业标准。</p><label class="profile-label">设备模板<select id="profile-select"></select></label><small id="profile-note" class="profile-note">等待模板</small><label class="profile-import">导入企业配置 JSON<input id="profile-file" type="file" accept="application/json,.json"></label><button id="load-profile-demo" class="quiet-button profile-demo-button">载入示例企业配置</button><small id="profile-import-status" class="profile-import-status">当前使用内置演示配置</small><details class="schema-details"><summary>查看字段映射证据</summary><div id="schema-table" class="schema-table"></div><div id="schema-warnings" class="schema-warnings"></div></details><details class="metadata-details"><summary>填写测试元数据 / 签核字段</summary><p class="metadata-intro">这些字段对应测试计划、仪器/校准、执行者、计算方法和人工签核；只在当前会话使用。</p><label>测试目的<textarea id="metadata-purpose" rows="2" placeholder="例如：PEM 电解槽稳态性能测试"></textarea></label><label>仪器/采集系统<textarea id="metadata-instruments" rows="2" placeholder="型号、序列号、采集通道"></textarea></label><label>校准/溯源记录<textarea id="metadata-calibration" rows="2" placeholder="证书编号或校准有效期"></textarea></label><label>执行者与资质<input id="metadata-operator" type="text" placeholder="姓名 / 资质编号"></label><label>公式/方法引用<textarea id="metadata-formulas" rows="2" placeholder="企业方法编号、公式版本"></textarea></label><label>人工签核<input id="metadata-signoff" type="text" placeholder="签核人 / 时间 / 工单号"></label></details><div class="thresholds"><label>温度上限 <input id="max-temperature" type="number" value="80" step="1"><span>°C</span></label><label>压力上限 <input id="max-pressure" type="number" value="30" step="0.5"><span>bar</span></label><label>泄漏监测上限 <input id="max-leak" type="number" value="10" step="1"><span>ppm</span></label><label>电压标准差 <input id="max-voltage-std" type="number" value="0.12" step="0.01"><span>V</span></label><label>压力漂移 <input id="max-pressure-drift" type="number" value="1.2" step="0.1"><span>bar/min</span></label></div><button id="reanalyze" class="outline-button">应用阈值并重新分析</button></section>
        <section class="side-card phase-card"><div class="card-kicker">AUTO SEGMENTATION</div><h2>工况分段</h2><div id="phase-list" class="phase-list"></div></section>
        <section class="side-card compare-card"><div class="card-kicker">BATCH COMPARISON <span id="compare-status">未加载基线</span></div><h2>当前 vs 基线</h2><p id="compare-summary" class="side-intro">载入演示基线，查看当前批次相对变化。</p><button id="compare-demo" class="outline-button">载入演示基线并对比</button><div id="compare-table" class="compare-table"></div><div id="compare-risks" class="compare-risks"></div></section>
        <section class="side-card history-card"><div class="card-kicker">LOCAL HISTORY <span id="history-status">0 条摘要</span></div><h2>本地批次</h2><p class="side-intro">保存后仅保留 KPI、判定和风险摘要，不保留原始测试行。</p><div class="button-row"><button id="save-history" class="primary-button">保存当前批次</button><button id="clear-history" class="icon-button" title="清除本地历史摘要">清除</button></div><div id="history-list" class="history-list"></div></section>
      </aside>
    </section>
  </main>
  <footer><span>H₂ TestLens · T02 online prototype</span><span>原始数据留在当前浏览器 · 结果可追溯 · 人工签核保留</span></footer>
</div>`;

export default function Home() {
  useEffect(() => {
    void import("../src/app.mjs").catch((error) => console.error("H2 TestLens failed to initialize", error));
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: DASHBOARD_HTML }} />;
}
