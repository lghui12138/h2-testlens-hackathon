const METRIC_DEFINITIONS = Object.freeze([
  { field: 'peakPowerW', label: '峰值功率', unit: 'W', digits: 1 },
  { field: 'steadyVoltageStdV', label: '稳态电压波动', unit: 'V', digits: 3 },
  { field: 'peakTemperatureC', label: '峰值温度', unit: '°C', digits: 1 },
  { field: 'peakPressureBar', label: '峰值压力', unit: 'bar', digits: 1 },
  { field: 'peakLeakPpm', label: '峰值泄漏监测', unit: 'ppm', digits: 1 },
  { field: 'pressureDriftBarPerMin', label: '压力漂移', unit: 'bar/min', digits: 2 },
  { field: 'completenessPct', label: '数据完整率', unit: '%', digits: 1 }
]);

const statusLabel = (verdict) => verdict === 'PASS' ? '通过' : verdict === 'WARN' ? '需复核' : verdict === 'DESCRIPTIVE' ? '仅描述' : '未通过';

const rounded = (value, digits) => value === null || value === undefined || !Number.isFinite(value) ? null : Number(value.toFixed(digits));

export function compareResults(baseline, current, names = {}) {
  const baselineName = names.baselineName ?? '基线批次';
  const currentName = names.currentName ?? '当前批次';
  const changes = METRIC_DEFINITIONS.map((definition) => {
    const baselineValue = baseline.metrics[definition.field];
    const currentValue = current.metrics[definition.field];
    const delta = baselineValue !== null && currentValue !== null ? currentValue - baselineValue : null;
    const percent = delta !== null && baselineValue !== 0 ? (delta / Math.abs(baselineValue)) * 100 : null;
    return {
      ...definition,
      baseline: rounded(baselineValue, definition.digits),
      current: rounded(currentValue, definition.digits),
      delta: rounded(delta, definition.digits),
      percent: rounded(percent, 1),
      direction: delta === null || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down'
    };
  });
  const baselineCodes = new Set(baseline.issues.filter((item) => item.severity !== 'info').map((item) => item.code));
  const currentCodes = new Set(current.issues.filter((item) => item.severity !== 'info').map((item) => item.code));
  const newIssues = current.issues.filter((item) => item.severity !== 'info' && !baselineCodes.has(item.code));
  const resolvedIssues = baseline.issues.filter((item) => item.severity !== 'info' && !currentCodes.has(item.code));
  const verdictChanged = baseline.verdict !== current.verdict;
  const riskEscalated = current.verdict === 'FAIL' && baseline.verdict !== 'FAIL';
  const riskImproved = current.verdict === 'PASS' && baseline.verdict !== 'PASS';
  const summary = riskEscalated
    ? '当前批次相对基线出现判定升级，需要优先复核新增风险。'
    : riskImproved
      ? '当前批次相对基线恢复为通过，但仍需结合设备标准完成签核。'
      : newIssues.length
        ? '当前批次新增需要关注的趋势或数据质量问题。'
        : resolvedIssues.length
          ? '当前批次已消除基线中的部分风险，建议继续观察后续批次。'
          : '当前批次与基线的风险集合没有变化，需结合 KPI 差值判断趋势。';
  return {
    baseline: { name: baselineName, verdict: baseline.verdict, status: statusLabel(baseline.verdict), source: baseline.source, profileName: baseline.config.profileName ?? '未指定' },
    current: { name: currentName, verdict: current.verdict, status: statusLabel(current.verdict), source: current.source, profileName: current.config.profileName ?? '未指定' },
    verdictTransition: `${statusLabel(baseline.verdict)}（${baseline.verdict}） → ${statusLabel(current.verdict)}（${current.verdict}）`,
    verdictChanged,
    riskEscalated,
    riskImproved,
    changes,
    newIssues,
    resolvedIssues,
    summary
  };
}

export function comparisonMarkdown(comparison) {
  return `## 批次对比\n\n- 基线：${comparison.baseline.name}（${comparison.baseline.verdict}，${comparison.baseline.profileName}）\n- 当前：${comparison.current.name}（${comparison.current.verdict}，${comparison.current.profileName}）\n- 判定变化：**${comparison.verdictTransition}**\n- 结论：${comparison.summary}\n\n| 指标 | 基线 | 当前 | 差值 |\n|---|---:|---:|---:|\n${comparison.changes.map((change) => `| ${change.label} | ${change.baseline ?? '—'} ${change.unit} | ${change.current ?? '—'} ${change.unit} | ${change.delta === null ? '—' : `${change.delta > 0 ? '+' : ''}${change.delta} ${change.unit}`} |`).join('\n')}\n\n### 风险变化\n\n- 新增：${comparison.newIssues.length ? comparison.newIssues.map((item) => item.title).join('、') : '无'}\n- 已消除：${comparison.resolvedIssues.length ? comparison.resolvedIssues.map((item) => item.title).join('、') : '无'}\n`;
}
