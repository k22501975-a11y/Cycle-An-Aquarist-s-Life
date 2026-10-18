import { co2Equilibrium, oxygenSaturation, phFromCo2 } from './chemistry';
import type { AirPumpSpec, Co2Spec, FilterSpec, HeaterSpec, LightSpec, TankSpec } from './equipment';
import type { RngState } from './random';
import type { TestKitReading } from './readings';
import { FISH_SPECIES, type FishSpeciesId, type PlantSpeciesId } from './species';

/**
 * 一個水缸的完整模擬狀態。只用純資料（可 JSON 序列化），方便存檔與搬到伺服器。
 * 濃度單位 mg/L，時間單位為遊戲小時。
 */
export interface TankState {
  version: 1;
  /** 已模擬的遊戲小時數。 */
  hours: number;
  rng: RngState;
  nextId: number;
  environment: Environment;
  equipment: Equipment;
  water: Water;
  bacteria: Bacteria;
  fish: Fish[];
  plants: Plant[];
  /** 缸壁與造景上的藻類覆蓋率 0–1。 */
  algae: number;
  events: SimEvent[];
  /** 最近一次用測試劑測水（玩家只知道測過的數值）。 */
  lastTest?: { hours: number; reading: TestKitReading };
  /** 最近一次換水的時間（遊戲小時）。 */
  lastWaterChangeHours?: number;
}

export interface Environment {
  /** 室溫日平均（°C），一天內會上下波動。 */
  roomTempC: number;
  /** 停電時所有設備停止運作。 */
  powerOut: boolean;
  /** 自來水的水質（換水時加入的水）。 */
  tap: TapWater;
}

export interface TapWater {
  kh: number;
  no3: number;
  co2: number;
}

export interface Equipment {
  tank: TankSpec;
  filter: { spec: FilterSpec; on: boolean } | null;
  heater: {
    spec: HeaterSpec;
    targetC: number;
    broken: boolean;
    heating: boolean;
    /** 故障時卡在加熱狀態（恆溫器失靈），插著電就會一直加熱。舊存檔沒有這個欄位。 */
    stuckOn?: boolean;
  } | null;
  airPump: { spec: AirPumpSpec; on: boolean } | null;
  light: { spec: LightSpec; startHour: number; photoperiodHours: number } | null;
  /** CO₂ 跟著燈光的時程注入（夜間關閉）。 */
  co2: { spec: Co2Spec; on: boolean } | null;
}

export interface Water {
  tempC: number;
  /** 總氨氮 TAN。 */
  tan: number;
  no2: number;
  no3: number;
  kh: number;
  ph: number;
  o2: number;
  co2: number;
  /** 未被吃掉、正在腐敗的飼料（mg，整缸總量）。 */
  foodMg: number;
  /** 正在分解的有機廢物：糞便、腐爛的飼料、死魚、枯葉（mg，整缸總量）。 */
  organicMg: number;
  /** 白點蟲游走期的濃度指數（會感染魚，藥物殺得到）。 */
  ichPathogen: number;
  /** 底砂中的白點蟲包囊（藥物殺不到，破裂後變成游走期）。 */
  ichCysts: number;
  /** 白點藥濃度，1 = 一份標準劑量。 */
  medication: number;
  /** 用於偵測水溫、pH 驟變的移動平均（約數小時）。 */
  tempAvgC: number;
  phAvg: number;
}

/** 硝化菌族群，以「每小時可處理的 mg 數」表示其規模。 */
export interface Bacteria {
  /** 亞硝化菌：氨 → 亞硝酸鹽。 */
  aob: number;
  /** 硝化菌：亞硝酸鹽 → 硝酸鹽。 */
  nob: number;
}

export type IchStage = 'none' | 'incubating' | 'visible';

export interface Fish {
  id: number;
  species: FishSpeciesId;
  alive: boolean;
  /** 健康 0–1，歸零即死亡。 */
  health: number;
  /** 壓力 0–1。 */
  stress: number;
  /** 飢餓 0（飽）–1（餓）。 */
  hunger: number;
  /** 持續處於飢餓狀態的小時數。 */
  starvingHours: number;
  ich: { stage: IchStage; progress: number };
  /** 個體體質差異（約 0.85–1.15），乘在魚種體質上，讓同一缸的魚不會同時倒下。 */
  constitution: number;
  /** 近期（約一兩天內）各原因造成的健康損失，用來判斷死因與診斷。 */
  recentDamage: Record<string, number>;
  /** 屍體剩餘重量（mg），死後在缸內持續腐爛。 */
  corpseMg: number;
  sex: 'male' | 'female';
  /** 目前體長（cm），幼體會慢慢長大；決定吃不吃得下別人、會不會被吃。 */
  lengthCm: number;
  /** 鰭破損 0–1（被咬鰭），會慢慢長回來。 */
  finDamage: number;
  /** 懷孕／抱卵進度 0–1，0 表示沒有。 */
  pregnancy: number;
}

export interface Plant {
  id: number;
  species: PlantSpeciesId;
  biomassG: number;
  /** 葉面藻類 0–1（陰性草照太強的光時出現）。 */
  leafAlgae: number;
  /** 近一天的平均淨生長率（每小時）。負值代表正在溶葉。 */
  growthRate: number;
}

export type SimEventType =
  | 'fish_died'
  | 'ich_visible'
  | 'plant_died'
  | 'heater_broke'
  | 'heater_stuck'
  | 'power_out'
  | 'power_restored'
  | 'fry_born';

export interface SimEvent {
  hours: number;
  type: SimEventType;
  subjectId?: number;
  cause?: string;
  /** 數量（例如一胎生了幾尾）。 */
  count?: number;
}

export interface CreateTankOptions {
  tank: TankSpec;
  filter?: FilterSpec | null;
  heater?: { spec: HeaterSpec; targetC: number } | null;
  airPump?: AirPumpSpec | null;
  light?: { spec: LightSpec; startHour?: number; photoperiodHours?: number } | null;
  co2?: Co2Spec | null;
  roomTempC?: number;
  tap?: Partial<TapWater>;
  seed?: number;
  /** 直接放入成熟濾材（測試用，或玩家從朋友那拿到的成熟濾材）。 */
  matureMedia?: boolean;
}

/** 剛細菌接種前的最小族群（空氣、水中本來就有少量硝化菌）。 */
export const BACTERIA_SEED = 0.001;

export function createTank(options: CreateTankOptions): TankState {
  const roomTempC = options.roomTempC ?? 23;
  const tap: TapWater = { kh: 4, no3: 2, co2: 3, ...options.tap };
  const filter = options.filter ?? null;
  const mature = options.matureMedia && filter ? filter.bacteriaCapacityMgPerHour * 0.5 : BACTERIA_SEED;

  return {
    version: 1,
    hours: 0,
    rng: { seed: options.seed ?? 1 },
    nextId: 1,
    environment: { roomTempC, powerOut: false, tap },
    equipment: {
      tank: options.tank,
      filter: filter ? { spec: filter, on: true } : null,
      heater: options.heater ? { ...options.heater, broken: false, heating: false } : null,
      airPump: options.airPump ? { spec: options.airPump, on: true } : null,
      light: options.light
        ? {
            spec: options.light.spec,
            startHour: options.light.startHour ?? 10,
            photoperiodHours: options.light.photoperiodHours ?? 8,
          }
        : null,
      co2: options.co2 ? { spec: options.co2, on: true } : null,
    },
    water: {
      tempC: roomTempC,
      tan: 0,
      no2: 0,
      no3: tap.no3,
      kh: tap.kh,
      ph: phFromCo2(tap.kh, co2Equilibrium(roomTempC)),
      o2: oxygenSaturation(roomTempC),
      co2: co2Equilibrium(roomTempC),
      foodMg: 0,
      organicMg: 0,
      ichPathogen: 0,
      ichCysts: 0,
      medication: 0,
      tempAvgC: roomTempC,
      phAvg: phFromCo2(tap.kh, co2Equilibrium(roomTempC)),
    },
    bacteria: { aob: mature, nob: mature },
    fish: [],
    plants: [],
    algae: 0,
    events: [],
  };
}

export function recordEvent(state: TankState, event: Omit<SimEvent, 'hours'>): void {
  state.events.push({ hours: state.hours, ...event });
  if (state.events.length > 200) state.events.splice(0, state.events.length - 200);
}

export function hourOfDay(state: TankState): number {
  return ((state.hours % 24) + 24) % 24;
}

export function isLightOn(state: TankState): boolean {
  const light = state.equipment.light;
  if (!light || state.environment.powerOut) return false;
  const h = hourOfDay(state);
  const end = light.startHour + light.photoperiodHours;
  return end <= 24 ? h >= light.startHour && h < end : h >= light.startHour || h < end - 24;
}

/** CO₂ 在開燈前 2 小時開始注入、關燈時停止，讓水草一開燈就有足夠的 CO₂。 */
export function isCo2Injecting(state: TankState): boolean {
  const { co2, light } = state.equipment;
  if (!co2?.on || !light || state.environment.powerOut) return false;
  const h = hourOfDay(state);
  const start = (light.startHour - 2 + 24) % 24;
  const end = (light.startHour + light.photoperiodHours) % 24;
  return start < end ? h >= start && h < end : h >= start || h < end;
}

export function isFilterRunning(state: TankState): boolean {
  return !!state.equipment.filter?.on && !state.environment.powerOut;
}

/** 是否為幼體（還沒長到可以繁殖的大小）。 */
export function isJuvenile(fish: Fish): boolean {
  return fish.lengthCm < FISH_SPECIES[fish.species].adultLengthCm * 0.75;
}

/**
 * 補上舊存檔缺少的欄位（新增欄位時在這裡給預設值），讓存檔版本不用每次都升級。
 */
export function normalizeState(state: TankState): TankState {
  for (const fish of state.fish) {
    const sp = FISH_SPECIES[fish.species];
    fish.sex ??= fish.id % 2 === 0 ? 'female' : 'male';
    fish.lengthCm ??= sp.adultLengthCm;
    fish.finDamage ??= 0;
    fish.pregnancy ??= 0;
  }
  return state;
}
