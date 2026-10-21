import { FISH_SPECIES } from '../species';
import { BACTERIA_SEED, type TankState } from '../state';
import { CYCLED_BACTERIA } from './nitrogen';

/**
 * 新缸症候群（design/polish-to-9.md §6.3「P6 的新缸氨數值」、§6「P6 實作確認」）：
 * 剛運來的魚有運輸緊迫，頭幾天排氨是平常的好幾倍，還帶進袋水；新缸的硝化菌又還不夠，水裡冒出一波氨。
 * 每個缸第一次放魚時都會發生（第二缸也一樣），總量照魚數算：3 尾約 60 mg，40L 約 1.5 mg/L，水少濃度就高。
 * 放魚當下菌越多這一波越小，分舊缸濾材、倒硝化菌液把菌補到「養好」的量就不會出現（這兩樣東西的價值）。
 * 平常的排泄量不變：一公兩母、一天一小撮在 40L 一天才約 0.02 mg/L，光靠牠們測試劑一直讀 0；
 * 加上這一波，基準玩法第 1 天早上讀 0.25、第 2 天 0.5，硝化菌長起來後第 5 天回到 0。
 */
/** 每尾魚帶來的氨（mg）。 */
export const SYNDROME_MG_PER_FISH = 20;
/** 放魚後幾小時排得最多（先升後降，一週後幾乎沒了）。 */
export const SYNDROME_PEAK_HOURS = 36;
/** 水草泥缸多這麼多倍：新土本來就在漏氨，魚的廢物也多一層養分（first-10-minutes.md 的水草泥取捨）。 */
export const SYNDROME_SOIL_FACTOR = 1.2;
/** 第一次放魚後這段時間內陸續放進來的魚，算同一批（在店裡一尾一尾挑也算）。 */
const STOCKING_WINDOW_H = 6;
/** 新缸症候群在報告、畫面上算「這幾天」的長度。 */
export const SYNDROME_DAYS = 7;

export type NewTankSyndromeStatus = 'active' | 'prevented_by_bacteria' | 'none';

/** 放魚當下的菌量對應的比例：只有空氣裡帶來的少量菌是 1，菌養到「養好」的量是 0。 */
function unprotected(state: TankState): number {
  const pop = Math.min(state.bacteria.aob, state.bacteria.nob);
  return Math.min(1, Math.max(0, 1 - (pop - BACTERIA_SEED) / (CYCLED_BACTERIA - BACTERIA_SEED)));
}

function fishCount(state: TankState): number {
  return state.fish.filter((f) => f.alive && !FISH_SPECIES[f.species].invertebrate).length;
}

/** 每個 tick：第一次有魚時開始新缸症候群，然後照時間把氨放進水裡。 */
export function updateNewTank(state: TankState, dt: number): void {
  const s = state.newTankSyndrome;
  if (!s) return;
  const n = fishCount(state);
  if (s.startedHours === undefined) {
    if (n === 0) return;
    s.startedHours = state.hours;
    s.fish = 0;
    s.totalMg = 0;
  }
  // 同一批陸續放進來的魚也算（各自照放進來當下的菌量）
  if (state.hours - s.startedHours < STOCKING_WINDOW_H && n > (s.fish ?? 0)) {
    const soil = state.equipment.substrate?.spec.ammoniaLeach ? SYNDROME_SOIL_FACTOR : 1;
    s.totalMg = (s.totalMg ?? 0) + (n - (s.fish ?? 0)) * SYNDROME_MG_PER_FISH * soil * unprotected(state);
    s.fish = n;
    s.prevented = s.totalMg < SYNDROME_MG_PER_FISH * 0.1;
  }
  state.water.tan += (newTankAmmoniaRate(state) * dt) / state.equipment.tank.volumeL;
}

/** 新缸症候群這時每小時冒出多少氨（mg）。 */
export function newTankAmmoniaRate(state: TankState): number {
  const s = state.newTankSyndrome;
  if (s?.startedHours === undefined || s.prevented || !s.totalMg) return 0;
  const x = (state.hours - s.startedHours) / SYNDROME_PEAK_HOURS;
  // x·e^(1−x) 從 0 積到無限大是 e，所以總量正好是 totalMg
  return x > 0 ? (s.totalMg / (SYNDROME_PEAK_HOURS * Math.E)) * x * Math.exp(1 - x) : 0;
}

/**
 * 這缸的新缸症候群（給早上報告說原因）：active 是正在冒氨、prevented_by_bacteria 是放魚時菌已經夠了
 * （菌液、分濾材的功勞），none 是還沒放過魚、已經過了，或舊存檔。
 */
export function newTankSyndrome(state: TankState): NewTankSyndromeStatus {
  const s = state.newTankSyndrome;
  if (s?.startedHours === undefined || state.hours - s.startedHours >= SYNDROME_DAYS * 24) return 'none';
  return s.prevented ? 'prevented_by_bacteria' : 'active';
}
