/**
 * 設備目錄。玩家購買的是規格，模擬只讀取這些數值。
 */

export interface TankSpec {
  id: string;
  name: string;
  volumeL: number;
  /** 水面面積（cm²），影響氣體交換速度。 */
  surfaceCm2: number;
  /** 外尺寸（cm）：寬 × 高 × 深。畫面依此決定鏡頭遠近（大缸魚看起來比較小）。舊存檔可能沒有。 */
  sizeCm?: { w: number; h: number; d: number };
}

export interface FilterSpec {
  id: string;
  name: string;
  flowLPerHour: number;
  /** 濾材能養的硝化菌上限，以「每小時可處理的氨氮 mg」表示。 */
  bacteriaCapacityMgPerHour: number;
  /** 水面擾動程度 0–1，影響氣體交換。 */
  surfaceAgitation: number;
}

export interface HeaterSpec {
  id: string;
  name: string;
  watts: number;
}

export interface AirPumpSpec {
  id: string;
  name: string;
  /** 額外的氣體交換倍率。 */
  aeration: number;
}

export interface LightSpec {
  id: string;
  name: string;
  /** 水草高度處的光照強度（PAR，μmol/m²/s）。 */
  par: number;
  /** 開燈時讓 40L 缸的水溫比室溫高多少（°C）。燈本身會發熱；舊存檔沒有這個欄位時視為 0。 */
  heatC?: number;
}

export interface Co2Spec {
  id: string;
  name: string;
  /** 開啟時每小時注入的 CO₂（mg）。 */
  mgPerHour: number;
}

export const TANKS = {
  nano20: { id: 'nano20', name: '20L 小缸', volumeL: 20, surfaceCm2: 900, sizeCm: { w: 36, h: 22, d: 26 } },
  std40: { id: 'std40', name: '40L 標準缸', volumeL: 40, surfaceCm2: 1350, sizeCm: { w: 45, h: 30, d: 30 } },
  std90: { id: 'std90', name: '90L 中型缸', volumeL: 90, surfaceCm2: 2700, sizeCm: { w: 60, h: 38, d: 40 } },
} satisfies Record<string, TankSpec>;

export const FILTERS = {
  sponge: { id: 'sponge', name: '水妖精（海綿過濾）', flowLPerHour: 120, bacteriaCapacityMgPerHour: 3, surfaceAgitation: 0.5 },
  hangOn: { id: 'hangOn', name: '外掛過濾器', flowLPerHour: 300, bacteriaCapacityMgPerHour: 6, surfaceAgitation: 0.4 },
  canister: { id: 'canister', name: '圓桶過濾器', flowLPerHour: 600, bacteriaCapacityMgPerHour: 15, surfaceAgitation: 0.2 },
} satisfies Record<string, FilterSpec>;

export const HEATERS = {
  h25: { id: 'h25', name: '25W 加熱棒', watts: 25 },
  h50: { id: 'h50', name: '50W 加熱棒', watts: 50 },
  h100: { id: 'h100', name: '100W 加熱棒', watts: 100 },
} satisfies Record<string, HeaterSpec>;

export const AIR_PUMPS = {
  small: { id: 'small', name: '小型打氣機', aeration: 1.5 },
} satisfies Record<string, AirPumpSpec>;

export const LIGHTS = {
  basic: { id: 'basic', name: '基本 LED 燈', par: 35, heatC: 0.5 },
  planted: { id: 'planted', name: '水草燈', par: 120, heatC: 1.2 },
} satisfies Record<string, LightSpec>;

export const CO2_KITS = {
  diy: { id: 'diy', name: 'CO₂ 鋼瓶組', mgPerHour: 100 },
} satisfies Record<string, Co2Spec>;

/** 缸的外尺寸；舊存檔沒有記錄時依水量推估（標準缸比例約 1.5 : 1 : 1）。 */
export function tankSize(tank: TankSpec): { w: number; h: number; d: number } {
  if (tank.sizeCm) return tank.sizeCm;
  const known = Object.values(TANKS).find((t) => t.id === tank.id);
  if (known) return known.sizeCm;
  const unit = Math.cbrt((tank.volumeL * 1000) / 1.5);
  return { w: Math.round(unit * 1.5), h: Math.round(unit), d: Math.round(unit) };
}
