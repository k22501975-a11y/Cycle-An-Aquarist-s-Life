import type { TankState } from '../state';

/**
 * 新缸症候群的氨（design/polish-to-9.md §6.3「P6 的新缸氨數值」）：新開的缸剛放魚的頭幾天，底砂、濾材裡
 * 還沒有分解殘餌和糞便的微生物，新水草、造景、運輸袋帶進來的雜質也集中在這幾天分解，水裡冒出一波氨：
 * 放魚後先慢慢變多，約 1.5 天時最多，之後一天天變少，一週後幾乎沒了（整段約 59 mg，40L 約 1.5 mg/L）。
 * 魚的排泄量不變：一公兩母、一天一小撮本身很少（40L 一天才約 0.02 mg/L），光靠牠們測試劑一直讀 0；
 * 加上這一波，基準玩法第 1 天早上讀 0.25、第 2 天 0.5，硝化菌長起來後第 5 天回到 0。
 * 跟水草泥漏氨一樣以 40L 為準，換算成濃度大小缸一樣。沒放魚的新缸（無魚養水）不會有。
 */
export const NEW_TANK_AMMONIA = { peakMgPerHour: 0.6, peakHours: 36 };

/** 新開的缸放魚後過了幾小時；還沒放魚、或不是新開的缸（直接建的缸、商城套缸、舊存檔）回傳 Infinity。 */
export function newTankAge(state: TankState): number {
  const stocked = state.newTank?.stockedHours;
  return stocked === undefined ? Infinity : state.hours - stocked;
}

/** 新缸這時每小時冒出多少氨（mg，以 40L 為準）：先升後降，peakHours 時最多。 */
export function newTankAmmoniaRate(state: TankState): number {
  const x = newTankAge(state) / NEW_TANK_AMMONIA.peakHours;
  return Number.isFinite(x) && x > 0 ? NEW_TANK_AMMONIA.peakMgPerHour * x * Math.exp(1 - x) : 0;
}

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
    const k = 1 - Math.exp(-c.rate * scale * acid * dt);
    if (water.kh < c.khTarget) water.kh += (c.khTarget - water.kh) * k;
    // 碳酸鈣溶出的鈣也讓 GH 上升（珊瑚砂缸的水偏硬）
    const gh = water.gh ?? state.environment.tap.gh ?? 6;
    if (gh < c.khTarget + 2) water.gh = gh + (c.khTarget + 2 - gh) * k;
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

  // 新開的缸第一次有魚：新缸症候群從這時開始算
  if (state.newTank && state.newTank.stockedHours === undefined && state.fish.some((f) => f.alive)) state.newTank.stockedHours = state.hours;
  water.tan += ((newTankAmmoniaRate(state) * (volume / 40)) / volume) * dt;

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
