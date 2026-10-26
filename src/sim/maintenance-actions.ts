import { co2Equilibrium, oxygenSaturation } from './chemistry';
import { filterBacteriaShare } from './processes/nitrogen';
import { roomTemperature } from './processes/thermal';
import type { FilterSpec, SubstrateSpec } from './equipment';
import { noteAct, type TankState } from './state';
import { fillUp, type WaterChangeOptions } from './actions';

// 換水、換底沙、洗濾材、換過濾器：只有延後載入的面板用得到，跟原檔分開，不進開機必載（docs/performance-budget.md）。
/**
 * 換水：用自來水（已除氯）取代 fraction 比例的缸水。
 * 會稀釋氨、亞硝酸鹽、硝酸鹽與藥物，補回 KH；新水溫度與缸水差太多會讓魚緊迫。
 */
export function waterChange(state: TankState, fraction: number, options: WaterChangeOptions = {}): void {
  // 換水時順便補滿水位（不算每日小事的「補水」）
  fillUp(state, options.tempC);
  const f = Math.min(1, Math.max(0, fraction));
  const { water, environment } = state;
  const tap = environment.tap;
  const newTemp = options.tempC ?? roomTemperature(state);
  const mix = (oldValue: number, newValue: number) => oldValue * (1 - f) + newValue * f;

  water.tempC = mix(water.tempC, newTemp);
  water.tan = mix(water.tan, 0);
  water.no2 = mix(water.no2, 0);
  water.no3 = mix(water.no3, tap.no3);
  water.kh = mix(water.kh, tap.kh);
  water.gh = mix(water.gh ?? tap.gh ?? 6, tap.gh ?? 6);
  water.o2 = mix(water.o2, oxygenSaturation(newTemp));
  water.co2 = mix(water.co2, Math.max(tap.co2, co2Equilibrium(newTemp)));
  water.medication = mix(water.medication, 0);
  water.antibiotic = mix(water.antibiotic ?? 0, 0);
  water.dewormer = mix(water.dewormer ?? 0, 0);
  if (water.copper) water.copper = mix(water.copper, 0);
  // 粗鹽療程中換水照換掉的量補鹽（同一包粗鹽），療程結束了才沖淡
  if (water.salt && !state.saltTreat) water.salt = mix(water.salt, 0);
  water.ichPathogen = mix(water.ichPathogen, 0);
  water.ichCysts *= 1 - f * 0.3;
  // 換水時順便虹吸底砂，帶走部分殘餌與髒污。
  water.foodMg *= 1 - f * 0.8;
  water.organicMg *= 1 - f * 0.5;
  state.lastWaterChangeHours = state.hours;
}

/**
 * 換底材：要把魚撈出來、拆缸重鋪。底砂裡的細菌和髒污跟著翻出來，魚也會很緊迫。
 */
export function replaceSubstrate(state: TankState, spec: SubstrateSpec): void {
  const share = 0.15;
  state.bacteria.aob *= 1 - share;
  state.bacteria.nob *= 1 - share;
  state.water.organicMg += 30 * (state.equipment.tank.volumeL / 40);
  for (const f of state.fish) if (f.alive) f.stress = Math.max(f.stress, 0.6);
  state.equipment.substrate = { spec, sinceHours: state.hours, buffer: 1 };
}

/**
 * 清洗濾材。用自來水洗會讓氯殺死大部分硝化菌（新手常犯的錯）；用換出來的缸水洗才安全。
 */
export function rinseFilterMedia(state: TankState, withWater: 'tap' | 'tank'): void {
  const share = filterBacteriaShare(state);
  const survival = withWater === 'tap' ? 0.05 : 0.9;
  if (withWater === 'tank') noteAct(state, 'rinse');
  const keep = 1 - share * (1 - survival);
  state.bacteria.aob *= keep;
  state.bacteria.nob *= keep;
}

/** 更換過濾器：新濾材是空的，舊濾材上的細菌全部失去。 */
export function replaceFilter(state: TankState, spec: FilterSpec | null): void {
  const keep = 1 - filterBacteriaShare(state);
  state.bacteria.aob *= keep;
  state.bacteria.nob *= keep;
  state.equipment.filter = spec ? { spec, on: true } : null;
}
