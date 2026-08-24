#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCSV, analyzeRows } from '../src/analyzer.mjs';
import { analyzeEnterpriseRows } from '../src/enterprise-adapters.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');

const T02_STACK_CSV = join(projectRoot, '..', 'T02_设备测试数据分析与自动报告助手', '企业资料包03_青川易创与云汉达', '02 样例数据-青川科技.csv');
const T02_VEHICLE_DIR = join(projectRoot, '..', 'T02_设备测试数据分析与自动报告助手', '企业资料包02_氢质氢离', '02 整车数据处理');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function run() {
  console.log('=== T02 Computation Accuracy Audit ===\n');

  // -------------------------------------------------------------------------
  // 1. Unit conversion validation
  // -------------------------------------------------------------------------
  console.log('1. Unit conversion validation');

  // 1a. kW -> W for generic power_w
  const kwRows = parseCSV('timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,功率（kW）\n0,10,20,30,10,6,1,5\n60,10,20,30,10,6,1,5');
  const kwResult = analyzeRows(kwRows);
  assert(kwResult.schema.conversions.power_w.factor === 1000, 'power_w kW->W factor should be 1000');
  assert(kwResult.schema.conversions.power_w.label === 'kW→W', 'power_w label should be kW→W');

  // 1b. kPa -> kPa for ambient_pressure_kpa (explicit recognition)
  const kpaHeaderRows = parseCSV('timestamp_s,current_a,voltage_v,temperature_c,环境压力（kPa）,flow_slpm,leak_ppm\n0,10,20,30,101,6,1\n60,10,20,30,101,6,1');
  const kpaResult = analyzeRows(kpaHeaderRows, { fieldMapping: { ambient_pressure_kpa: '环境压力（kPa）' } });
  console.log(`  ambient_pressure_kpa conversion: factor=${kpaResult.schema.conversions.ambient_pressure_kpa.factor}, label=${kpaResult.schema.conversions.ambient_pressure_kpa.label}`);
  assert(kpaResult.schema.conversions.ambient_pressure_kpa.factor === 1, 'ambient_pressure_kpa kPa->kPa factor should be 1');
  assert(kpaResult.schema.conversions.ambient_pressure_kpa.label === 'kPa→kPa', 'ambient_pressure_kpa label should recognize kPa');

  // 1c. bar -> kPa conversion
  const barToKpaRows = parseCSV('timestamp_s,current_a,voltage_v,temperature_c,环境压力（bar）,flow_slpm,leak_ppm\n0,10,20,30,1,6,1\n60,10,20,30,1,6,1');
  const barToKpaResult = analyzeRows(barToKpaRows, { fieldMapping: { ambient_pressure_kpa: '环境压力（bar）' } });
  console.log(`  bar->kPa conversion: factor=${barToKpaResult.schema.conversions.ambient_pressure_kpa.factor}, label=${barToKpaResult.schema.conversions.ambient_pressure_kpa.label}`);
  assert(barToKpaResult.schema.conversions.ambient_pressure_kpa.factor === 100, 'bar->kPa factor should be 100');
  assert(barToKpaResult.schema.conversions.ambient_pressure_kpa.label === 'bar→kPa', 'bar->kPa label should be bar→kPa');

  // 1d. MW -> W conversion for power_w (BUG FIX CHECK)
  const mwHeaderRows = parseCSV('timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm,功率（MW）\n0,10,20,30,10,6,1,5\n60,10,20,30,10,6,1,5');
  const mwResult = analyzeRows(mwHeaderRows, { fieldMapping: { power_w: '功率（MW）' } });
  console.log(`  MW->W conversion: factor=${mwResult.schema.conversions.power_w.factor}, label=${mwResult.schema.conversions.power_w.label}`);
  assert(mwResult.schema.conversions.power_w.factor === 1000000, 'MW->W factor should be 1000000');
  assert(mwResult.schema.conversions.power_w.label === 'MW→W', 'MW->W label should be MW→W');

  // 1e. MPa -> bar for gas_pressure_bar
  const mpaRows = parseCSV('timestamp_s,current_a,voltage_v,temperature_c,压力（MPa）,flow_slpm,leak_ppm\n0,10,20,30,10,6,1\n60,10,20,30,10,6,1');
  const mpaResult = analyzeRows(mpaRows, { fieldMapping: { gas_pressure_bar: '压力（MPa）' } });
  console.log(`  MPa->bar conversion: factor=${mpaResult.schema.conversions.gas_pressure_bar.factor}, label=${mpaResult.schema.conversions.gas_pressure_bar.label}`);
  assert(mpaResult.schema.conversions.gas_pressure_bar.factor === 10, 'MPa->bar factor should be 10');

  // 1f. Pa -> bar for pressure_bar
  const paRows = parseCSV('timestamp_s,current_a,voltage_v,temperature_c,压力（Pa）,flow_slpm,leak_ppm\n0,10,20,30,100000,6,1\n60,10,20,30,100000,6,1');
  const paResult = analyzeRows(paRows, { fieldMapping: { pressure_bar: '压力（Pa）' } });
  console.log(`  Pa->bar conversion: factor=${paResult.schema.conversions.pressure_bar.factor}, label=${paResult.schema.conversions.pressure_bar.label}`);
  assert(paResult.schema.conversions.pressure_bar.factor === 0.00001, 'Pa->bar factor should be 0.00001');

  // -------------------------------------------------------------------------
  // 2. Real T02 stack data validation
  // -------------------------------------------------------------------------
  console.log('\n2. Real T02 stack data validation');

  const stackCsv = await readFile(T02_STACK_CSV, 'utf8');
  const stackRows = parseCSV(stackCsv);
  assert(stackRows.length > 0, 'Stack CSV should have rows');
  console.log(`  Stack rows: ${stackRows.length}`);

  const stackResult = analyzeEnterpriseRows(stackRows, {});
  assert(stackResult !== null, 'Stack result should not be null');
  assert(stackResult.datasetType === 'stack', `Dataset type should be stack, got ${stackResult.datasetType}`);
  console.log(`  Dataset type: ${stackResult.datasetType}`);
  console.log(`  Quality usable: ${stackResult.quality.usable}`);

  // Validate a specific row's flow resistance calculation
  const firstRow = stackResult.rows[0];
  console.log(`  First row anode_in_pressure_kpa: ${firstRow.anode_in_pressure_kpa}`);
  console.log(`  First row anode_out_pressure_kpa: ${firstRow.anode_out_pressure_kpa}`);
  console.log(`  First row anode_flow_resistance_kpa: ${firstRow.anode_flow_resistance_kpa}`);

  if (firstRow.anode_in_pressure_kpa !== null && firstRow.anode_out_pressure_kpa !== null) {
    const expectedAnodeResistance = firstRow.anode_in_pressure_kpa - firstRow.anode_out_pressure_kpa;
    assert(Math.abs(firstRow.anode_flow_resistance_kpa - expectedAnodeResistance) < 1e-12, 'Anode flow resistance should be inlet - outlet');
  }

  // Validate cathode flow resistance
  if (firstRow.cathode_in_pressure_kpa !== null && firstRow.cathode_out_pressure_kpa !== null) {
    const expectedCathodeResistance = firstRow.cathode_in_pressure_kpa - firstRow.cathode_out_pressure_kpa;
    assert(Math.abs(firstRow.cathode_flow_resistance_kpa - expectedCathodeResistance) < 1e-12, 'Cathode flow resistance should be inlet - outlet');
  }

  // Validate coolant temperature difference
  if (firstRow.coolant_out_temp_c !== null && firstRow.coolant_in_temp_c !== null) {
    const expectedCoolantDt = firstRow.coolant_out_temp_c - firstRow.coolant_in_temp_c;
    assert(Math.abs(firstRow.coolant_temperature_difference_c - expectedCoolantDt) < 1e-12, 'Coolant temperature difference should be outlet - inlet');
  }

  // Validate power calculation: power_w = power_kw * 1000
  const firstRawPowerW = firstRow.raw_power_w;
  const firstPowerKw = firstRow.power_kw;
  if (firstPowerKw !== null && firstRawPowerW !== null) {
    assert(Math.abs(firstRawPowerW - firstPowerKw * 1000) < 1e-12, 'raw_power_w should be power_kw * 1000');
  }

  // Validate derived power: current * voltage
  const firstDerivedPowerW = firstRow.derived_power_w;
  const firstCurrentA = firstRow.current_a;
  const firstVoltageV = firstRow.voltage_v;
  if (firstCurrentA !== null && firstVoltageV !== null && firstDerivedPowerW !== null) {
    assert(Math.abs(firstDerivedPowerW - firstCurrentA * firstVoltageV) < 1e-12, 'derived_power_w should be current_a * voltage_v');
  }

  // Validate stoichiometry calculation manually
  // H2 stoich: anode_flow / (current * cellCount / (2 * F) * Vm * 60)
  // For the first row: current = 2100 A, cellCount = 8, anode_flow = 84.5 SLPM
  const faraday = 96485.33212;
  const molarVolume = 22.414;
  const cellCount = firstRow.cell_count || 8;
  const currentA = firstRow.current_a;
  const anodeFlow = firstRow.anode_flow_slpm;
  const cathodeFlow = firstRow.cathode_flow_slpm;

  if (currentA !== null && anodeFlow !== null && cellCount > 0) {
    const theoreticalH2 = currentA * cellCount / (2 * faraday) * molarVolume * 60;
    const expectedH2Stoich = anodeFlow / theoreticalH2;
    console.log(`  H2 stoich check: anode_flow=${anodeFlow}, theoretical_h2=${theoreticalH2.toFixed(4)}, expected_stoich=${expectedH2Stoich.toFixed(4)}, actual=${firstRow.h2_stoich}`);
    if (firstRow.h2_stoich !== null) {
      assert(Math.abs(firstRow.h2_stoich - expectedH2Stoich) < 1e-12, 'H2 stoich should match manual calculation');
    }
  }

  if (currentA !== null && cathodeFlow !== null && cellCount > 0) {
    const oxygenFraction = 0.2095;
    const theoreticalAir = currentA * cellCount / (4 * faraday) / oxygenFraction * molarVolume * 60;
    const expectedAirStoich = cathodeFlow / theoreticalAir;
    console.log(`  Air stoich check: cathode_flow=${cathodeFlow}, theoretical_air=${theoreticalAir.toFixed(4)}, expected_stoich=${expectedAirStoich.toFixed(4)}, actual=${firstRow.air_stoich}`);
    if (firstRow.air_stoich !== null) {
      assert(Math.abs(firstRow.air_stoich - expectedAirStoich) < 1e-12, 'Air stoich should match manual calculation');
    }
  }

  // Validate metrics
  console.log(`  Metrics peakPowerKw: ${stackResult.metrics.peakPowerKw}`);
  console.log(`  Metrics peakTemperatureC: ${stackResult.metrics.peakTemperatureC}`);
  console.log(`  Metrics peakPressureBar: ${stackResult.metrics.peakPressureBar}`);
  console.log(`  Cell channel count: ${stackResult.dataset.cellChannelCount}`);
  console.log(`  Missing headers: ${stackResult.quality.missingHeaders.join(', ') || 'none'}`);

  // -------------------------------------------------------------------------
  // 3. Real T02 vehicle data validation
  // -------------------------------------------------------------------------
  console.log('\n3. Real T02 vehicle data validation');

  const vehicleFiles = await readFile(join(T02_VEHICLE_DIR, '..', '..', '..', '..', '..', 'Downloads'), 'utf8').catch(() => '');
  
  // Find a vehicle CSV file
  let vehicleCsvPath = null;
  try {
    const { readdir } = await import('node:fs/promises');
    const subdirs = await readdir(T02_VEHICLE_DIR);
    for (const subdir of subdirs) {
      const fullPath = join(T02_VEHICLE_DIR, subdir);
      const files = await readdir(fullPath);
      for (const file of files) {
        if (file.endsWith('.csv')) {
          vehicleCsvPath = join(fullPath, file);
          break;
        }
      }
      if (vehicleCsvPath) break;
    }
  } catch (e) {
    console.error('Error finding vehicle files:', e.message);
  }

  if (!vehicleCsvPath) {
    console.log('  No vehicle CSV files found, skipping vehicle validation');
  } else {
    console.log(`  Vehicle file: ${vehicleCsvPath}`);
    const vehicleCsv = await readFile(vehicleCsvPath, 'utf8');
    const vehicleRows = parseCSV(vehicleCsv);
    assert(vehicleRows.length > 0, 'Vehicle CSV should have rows');
    console.log(`  Vehicle rows: ${vehicleRows.length}`);

    const vehicleResult = analyzeEnterpriseRows(vehicleRows, {});
    assert(vehicleResult !== null, 'Vehicle result should not be null');
    assert(vehicleResult.datasetType === 'vehicle', `Dataset type should be vehicle, got ${vehicleResult.datasetType}`);
    console.log(`  Dataset type: ${vehicleResult.datasetType}`);
    console.log(`  Session count: ${vehicleResult.dataset.sessionCount}`);
    console.log(`  Quality usable: ${vehicleResult.quality.usable}`);

    // Validate electrical power: net_power_kw * 1000 should match current * voltage when both available
    const vehicleFirstRow = vehicleResult.rows[0];
    console.log(`  First row net_power_kw: ${vehicleFirstRow.net_power_kw}`);
    console.log(`  First row current_a: ${vehicleFirstRow.current_a}`);
    console.log(`  First row voltage_v: ${vehicleFirstRow.voltage_v}`);

    const vehiclePower = vehicleFirstRow.net_power_kw !== null ? vehicleFirstRow.net_power_kw * 1000 : null;
    const vehicleDerivedPower = vehicleFirstRow.current_a !== null && vehicleFirstRow.voltage_v !== null ? vehicleFirstRow.current_a * vehicleFirstRow.voltage_v : null;

    if (vehiclePower !== null && vehicleDerivedPower !== null) {
      console.log(`  Vehicle power (net*1000): ${vehiclePower}`);
      console.log(`  Vehicle derived power (I*V): ${vehicleDerivedPower}`);
      // They might differ slightly due to rounding or net vs gross power
      assert(Math.abs(vehiclePower - vehicleDerivedPower) < 500, 'Vehicle net power and derived power should be close');
    }
  }

  // -------------------------------------------------------------------------
  // 4. Generic analyzer computation accuracy
  // -------------------------------------------------------------------------
  console.log('\n4. Generic analyzer computation accuracy');

  // Trapezoid energy integration for constant power
  const energyRows = parseCSV('timestamp_s,current_a,voltage_v,temperature_c,pressure_bar,flow_slpm,leak_ppm\n0,10,20,30,10,6,1\n60,10,20,30,10,6,1');
  const energyResult = analyzeRows(energyRows);
  const expectedEnergy = 200 * 60 / 3600; // 200W for 60s = 3.333... Wh
  console.log(`  Energy integration: actual=${energyResult.metrics.energyConsumedWh}, expected=${expectedEnergy}`);
  assert(Math.abs(energyResult.metrics.energyConsumedWh - expectedEnergy) < 1e-12, 'Energy integration should match hand calculation');

  const expectedVolume = 6 * 60 / 60; // 6 SLPM for 60s = 6 NL
  console.log(`  Volume integration: actual=${energyResult.metrics.hydrogenVolumeNl}, expected=${expectedVolume}`);
  assert(Math.abs(energyResult.metrics.hydrogenVolumeNl - expectedVolume) < 1e-12, 'Volume integration should match hand calculation');

  // Specific energy
  const expectedSpecific = expectedEnergy / expectedVolume;
  console.log(`  Specific energy: actual=${energyResult.metrics.specificEnergyKWhPerNm3}, expected=${expectedSpecific}`);
  assert(Math.abs(energyResult.metrics.specificEnergyKWhPerNm3 - expectedSpecific) < 1e-12, 'Specific energy should match hand calculation');

  // -------------------------------------------------------------------------
  // 5. Summary
  // -------------------------------------------------------------------------
  console.log('\n=== Audit Complete ===');
  if (process.exitCode === 1) {
    console.log('RESULT: FAIL - Bugs found (see above)');
  } else {
    console.log('RESULT: PASS - No bugs detected');
  }
}

run().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
