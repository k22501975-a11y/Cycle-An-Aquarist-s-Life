import type { TankState } from '../state';

/**
 * 造景材料悄悄改變水質（hardscape.md §2）：含碳酸鈣的石頭和珊瑚砂把 KH 拉高，
 * 水草泥吸收 KH（緩衝力會慢慢耗盡），新土前幾週漏氨，沉木的單寧酸吃掉一點 KH。
 * pH 不直接改，仍由 KH 和 CO₂ 推算，所以 pH 會跟著 KH 走。
 */
export function updateHardscape(state: TankState, dt: number): void {
  const { water, equipment } = state;
  const volume = equipment.tank.volumeL;
  const amount = 40 / volume;
  // CO₂ 讓水變酸，碳酸鈣溶得更快（開 CO₂ 的草缸放青龍石，pH 降不下去）
  const acid = 1 + water.co2 / 30;
  const dissolve = (c: { khTarget: number; rate: number }, scale: number) => {
    if (water.kh < c.khTarget) water.kh += (c.khTarget - water.kh) * (1 - Math.exp(-c.rate * scale * acid * dt));
  };

  const sub = equipment.substrate;
  if (sub) {
    const spec = sub.spec;
    // 底材鋪滿整個缸底，大缸用量也跟著變多，所以濃度效果不隨水量變
    if (spec.carbonate) dissolve(spec.carbonate, 1);
    if (spec.khAbsorb && sub.buffer > 0) {
      const absorbed = water.kh * (1 - Math.exp(-spec.khAbsorb.rate * sub.buffer * dt));
      water.kh -= absorbed;
      sub.buffer = Math.max(0, sub.buffer - (absorbed * volume) / (spec.khAbsorb.capacity * (volume / 40)));
    }
    if (spec.ammoniaLeach) {
      const age = state.hours - sub.sinceHours;
      water.tan += ((spec.ammoniaLeach.mgPerHour * (volume / 40) * Math.exp(-age / spec.ammoniaLeach.decayHours)) / volume) * dt;
    }
  }

  for (const item of equipment.hardscape ?? []) {
    if (item.carbonate) dissolve(item.carbonate, amount);
    if (item.tanninKhPerHour) water.kh = Math.max(0.5, water.kh - item.tanninKhPerHour * amount * dt);
  }
}

/** 水草泥的腐植酸、沉木的單寧酸讓 pH 比只看 KH 算出來的再低一點。 */
export function hardscapePhOffset(state: TankState): number {
  const sub = state.equipment.substrate;
  let offset = sub?.spec.khAbsorb ? 0.9 * sub.buffer : 0;
  const wood = (state.equipment.hardscape ?? []).filter((x) => x.tanninKhPerHour).length;
  offset += Math.min(0.3, 0.1 * wood * (40 / state.equipment.tank.volumeL));
  return offset;
}

/** 底材與造景石增加的硝化菌附著容量（mg/小時）。 */
export function hardscapeBacteriaCapacity(state: TankState): number {
  const volume = state.equipment.tank.volumeL;
  let perLiter = state.equipment.substrate?.spec.bacteriaSurface ?? 0;
  for (const item of state.equipment.hardscape ?? []) perLiter += (item.bacteriaSurface ?? 0) * (40 / volume);
  return perLiter * volume;
}

/** 底土養分對根部吸收型水草的生長加成（1 = 沒有加成）。 */
export function substrateNutrientBoost(state: TankState): number {
  const sub = state.equipment.substrate;
  return 1 + (sub?.spec.plantNutrients ?? 0) * (sub?.buffer ?? 0);
}
