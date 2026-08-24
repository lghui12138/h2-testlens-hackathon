import { readFile } from 'node:fs/promises';
import { parseCSV, analyzeRows } from '../src/analyzer.mjs';

const realDataPath = '/Users/kili/Downloads/T02_设备测试数据分析与自动报告助手/企业资料包03_青川易创与云汉达/02 样例数据-青川科技.csv';

function assertApprox(actual, expected, tolerance = 1e-6, label = '') {
  const pass = Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
  if (!pass) {
    console.error(`FAIL ${label}: expected ${expected}, got ${actual}`);
  }
  return pass;
}

async function validate() {
  const text = await readFile(realDataPath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const result = analyzeRows(parseCSV(lines.slice(0, 101).join('\n')));

  let passed = 0;
  let failed = 0;

  const check = (actual, expected, tolerance, label) => {
    if (assertApprox(actual, expected, tolerance, label)) {
      passed += 1;
    } else {
      failed += 1;
    }
  };

  // 1) Power kW->W conversion
  const firstRow = result.rows[0];
  check(firstRow.power_kw, 4.382, 1e-12, 'power_kw raw value');
  check(firstRow.raw_power_w, 4382, 1e-12, 'power_kw -> raw_power_w');
  check(firstRow.power_w, 4382, 1e-12, 'power_w from raw channel');
  check(firstRow.derived_power_w, 945.001 * 4.637, 1e-9, 'derived power_w from I*V');

  // 2) Pressure kPa/bar semantic reconciliation
  check(firstRow.pressure_kpa, 159.8, 1e-12, 'pressure_kpa canonical');
  const pressures = result.rows.map((r) => r.pressure_kpa).filter((v) => v !== null);
  const maxPressureKpa = Math.max(...pressures);
  check(result.metrics.peakPressureBar, maxPressureKpa / 100, 1e-12, 'peakPressureBar from kPa/100');

  // 3) Flow resistance = inlet - outlet in kPa
  check(firstRow.anode_flow_resistance_kpa, 159.8 - 148.5, 1e-9, 'anode flow resistance');
  check(firstRow.cathode_flow_resistance_kpa, 149.6 - 113.8, 1e-9, 'cathode flow resistance');
  check(firstRow.coolant_flow_resistance_kpa, 150.2 - 134.6, 1e-9, 'coolant flow resistance');

  // 4) Temperature difference = outlet - inlet
  check(firstRow.coolant_temperature_difference_c, 65.7 - 55.1, 1e-9, 'coolant temperature difference');

  // 5) Stoichiometry using Faraday/molar volume/cell count
  const expectedH2Stoich = 84.62 / (945.001 * 8 / (2 * 96485.33212) * 22.414 * 60);
  const expectedAirStoich = 187.55 / (945.001 * 8 / (4 * 96485.33212) / 0.2095 * 22.414 * 60);
  check(firstRow.h2_stoich, expectedH2Stoich, 1e-6, 'hydrogen stoich');
  check(firstRow.air_stoich, expectedAirStoich, 1e-6, 'air stoich');

  // 6) Summary means from 100 rows
  check(result.dataset.metrics.anodeFlowResistanceKpa.mean, 11.22, 1e-9, 'mean anode flow resistance');
  check(result.dataset.metrics.coolantFlowResistanceKpa.mean, 15.955, 1e-9, 'mean coolant flow resistance');
  check(result.dataset.metrics.coolantTemperatureDifferenceC.mean, 10.422, 1e-9, 'mean coolant dt');

  console.log(`\nValidation results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

validate().catch((error) => {
  console.error(error);
  process.exit(1);
});
