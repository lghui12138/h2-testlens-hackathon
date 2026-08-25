import { readFileSync, existsSync } from 'node:fs';
import { DEVICE_PROFILES, getProfile } from '../src/profiles.mjs';

const profiles = DEVICE_PROFILES.filter((p) => p.fieldMapping && Object.keys(p.fieldMapping).length > 0);

const packageHeaders = {
  'qingchuan-stack': [
    '测试时间', '阳极气源压力（kPa）', '阳极减压后压力（kPa）', '阳极喷淋压力（kPa）',
    '阳极入堆压力（kPa）', '阳极出堆压力（kPa）', '阴极气源压力（kPa）', '阴极减压后压力（kPa）',
    '阴极入堆压力（kPa）', '阴极出堆压力（kPa）', '循环水入堆压力（kPa）', '循环水出堆压力（kPa）',
    '循环水入堆温度（℃）', '循环水出堆温度（℃）', '冷却水入口温度（℃）', '冷却水出口温度（℃）',
    '实际电流（A）', '实际电压（V）', '功率（kW)', '功率密度', '电流密度（mA/cm2）',
    '平均电压（V）', '最小电压（V）', '最大电压（V）', '极差（mV）', '离均差（mV）',
    '标准差（mV）', '总电压（V）', '片数', '柜内氢气浓度（ppm）', '测试区氢气浓度（ppm）',
    '循环水流量（L/min）', '循环水电导率（μS/cm）', '阳极流量（SLPM）', '阴极流量（SLPM）',
    '电压设定值（V）', '电流设定值（A）', '电流密度设定值（mA/cm2）', '单片电压1（V）',
    '单片电压2（V）', '单片电压3（V）', '单片电压4（V）', '单片电压5（V）'
  ],
  'qingzhihuli-vehicle': [
    'Timestamp', 'FC_MainSts', 'FC_CurrOut', 'FC_VoltOut', 'FC_NetPwrOut',
    'FC_MinCellVoltage', 'FC_MinVoltageChannel', 'FC_AvgCellVoltage', 'FC_AvgCellDev',
    'FC_VARVoltage', 'FC_VehicleIsolationR', 'FC_RunTime_Hours', 'FC_SysLoadCurr',
    'FC_AirSysSts', 'FC_H2SysSts', 'FC_TMSysSts', 'RollingCount_0x101',
    'FC_MaxCurrAllow', 'FC_MaxPwrAllow', 'FC_HVLockVoltage', 'FC_MaxCellVoltage',
    'FC_MaxVoltageChannel', 'TotalVoltage', 'FC_PurgeTgtEIS', 'FC_RealEISValue',
    'FC_PurgeTime', 'FC_AirPreCPOut', 'FC_ACPPwr', 'FC_AuxFANEn', 'FC_AuxFANRpm',
    'FC_H2SupplyReq', 'FC_HSSFltRnk', 'FC_HSSSysSts', 'FC_HSSErrorCode',
    'FC_HSSHighPreu', 'FC_HSSMidPre', 'FC_HSSH2SOC', 'FC_HSSTripRefuelMass',
    'FC_VehicleSpd', 'FC_VehicleKM', 'FC_HydCmPerHundred', 'FC_HydCmInstts',
    'FC_RunTime_Min', 'FC_StartTimes'
  ],
  'hypu-durability': [
    '时间', '电堆电压', '电堆电流', '电堆功率', '电流密度', '功率密度',
    '阳极气源压力(kpa)', '阳极减压压力(kpa)', '阴极气源压力(kpa)', '阴极减压压力(kpa)',
    '电堆循环水出堆压力(kpa)', '氢回流泵进口压力(kpa)', '氢回流泵出口压力(kpa)',
    '阳极气源温度(℃)', '阴极气源温度(℃)', '冷却水入口温度(℃)', '冷却水出口温度(℃)',
    '氢气浓度', '电导率', '单片电压最大值', '单片电压最大位置', '单片电压最小值',
    '单片电压最小位置', '平均电压', '离均差', '氢气累计流量', '电子负载设定值'
  ],
  'hypu-stack': [
    '时间', '电堆电压', '电堆电流', '电堆功率', '电流密度', '功率密度',
    '阳极气源压力(kpa)', '阳极减压压力(kpa)', '阴极气源压力(kpa)', '阴极减压压力(kpa)',
    '电堆循环水出堆压力(kpa)', '电堆循环水进堆压力(kpa)', '电堆循环水流量(L/Min)',
    '电堆循环水进堆温度(℃)', '电堆循环水出堆温度(℃)', '氢气浓度', '电导率',
    '单片电压最大值', '平均电压', '离均差', '氢气累计流量', '电子负载设定值',
    '氢气回流泵转速', '阳极相对湿度', '阴极相对湿度', '尾排浓度'
  ]
};

for (const profile of profiles) {
  const id = profile.id;
  console.log(`\n=== ${id} ===`);
  const mapping = profile.fieldMapping || {};
  const headers = packageHeaders[id] || [];
  for (const [field, source] of Object.entries(mapping)) {
    const exists = headers.includes(source);
    console.log(`  ${field} -> ${source} : ${exists ? 'OK' : 'MISSING in real data'}`);
  }
  for (const header of headers) {
    if (!Object.values(mapping).includes(header) && ['时间', '电堆电流', '电堆电压', '实际电流', '实际电压'].some((k) => header.includes(k))) {
      console.log(`  UNMAPPED real header: ${header}`);
    }
  }
}
