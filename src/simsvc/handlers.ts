import { catchUp, parseSave, serializeSave, type SaveFile } from '../game/save';
import { arrivalStatus, carriedDiseases, DEFAULT_TIME_SCALE, earnCap, economy, forgedGenomes, marketItem, type ArrivalStatus, type Fish, type TankState } from '../sim';

/**
 * 伺服器權威模擬（L2）：Spring Boot 把存檔丟過來，這裡用跟遊戲同一份模擬程式計算。
 * - advance：離線補算到伺服器的現在時間（玩家改裝置時鐘也沒用）
 * - verify：上傳的存檔跟伺服器上一份比，遊戲時間不能跑得比現實快，已經存在的魚身分（基因、品種、性別）不能被改，
 *   已經在市場出貨的魚不能又出現，錢不能多出單機賺不到的數目（earn-cap.ts）
 * - inspect：找出存檔裡的某一條魚（市場上架用伺服器這份的資料，不信任遊戲端送來的）
 * - arrivals：買家存檔裡市場買來的魚到貨後的狀況（賣家 30 天存活率，arrivals.ts）
 */

export interface Problem {
  code: 'time_ahead' | 'identity_changed' | 'gift_removed' | 'shipped_fish' | 'coins_jump' | 'genome_forged';
  message: string;
}

/** 遊戲時間可以比現實 × 7 多跑一點：存檔、上傳之間的延遲，加上 2% 的誤差。 */
export const TIME_SLACK_HOURS = 1;
export const TIME_SLACK_RATIO = 1.02;

export class BadSave extends Error {}

function load(raw: unknown): SaveFile {
  const res = parseSave(JSON.stringify(raw));
  if (!res.ok) throw new BadSave(res.reason === 'newer' ? '存檔版本比伺服器的模擬新' : '讀不出這份存檔');
  return res.file;
}

function tanksOf(file: SaveFile): TankState[] {
  return [file.state, ...(file.tanks ?? [])];
}

function allFish(file: SaveFile): Fish[] {
  return tanksOf(file).flatMap((t) => [...t.fish, ...(t.quarantine?.fish ?? [])]);
}

export interface AdvanceResult {
  save: unknown;
  /** 補了幾個遊戲小時。 */
  hours: number;
  capped: boolean;
  /** 離開期間死掉幾條魚、生了幾尾小魚（給通知或日誌用）。 */
  deaths: number;
  births: number;
}

/** 把存檔補算到 now（現實毫秒），回傳新的存檔（savedAt 改成 now）。 */
export function advance(raw: unknown, now: number): AdvanceResult {
  const file = load(raw);
  const off = catchUp(file, now);
  const events = off.byTank.flat();
  const extra = file.tanks?.length ? { tanks: file.tanks, active: file.active ?? 0 } : undefined;
  const save = JSON.parse(serializeSave(file.state, file.timeScale, now, file.backedUpAt, extra));
  return {
    save,
    hours: off.hours,
    capped: off.capped,
    deaths: events.filter((e) => e.type === 'fish_died').length,
    births: events.filter((e) => e.type === 'fry_born').reduce((n, e) => n + (e.count ?? 0), 0),
  };
}

/**
 * 檢查上傳的存檔：previous 是伺服器上一份，elapsedMs 是伺服器收到上一份到現在的現實時間，
 * shipped 是這個玩家已經在市場出貨的魚（市場用的魚資料；拿出貨前的舊存檔上傳，魚會又回來，#75）。
 * received 是這個玩家在市場買到、已經到貨的魚的基因（和牠們肚子裡的精子）：新出現的魚是這些就不用照店魚的範圍查。
 * 回傳發現的問題（空的代表沒問題）。
 */
export function verify(previousRaw: unknown, nextRaw: unknown, elapsedMs: number, shipped: readonly ShippedFish[] = [], received: readonly unknown[] = []): Problem[] {
  const prev = load(previousRaw);
  const next = load(nextRaw);
  const problems: Problem[] = [];

  // 遊戲時鐘由伺服器統一：遊戲時間最多比現實 × 7 多一點（暫停時會少，沒關係）
  const allowed = (Math.max(0, elapsedMs) / 3_600_000) * DEFAULT_TIME_SCALE * TIME_SLACK_RATIO + TIME_SLACK_HOURS;
  const ran = next.state.hours - prev.state.hours;
  if (ran > allowed) {
    problems.push({
      code: 'time_ahead',
      message: `遊戲時間跑得比伺服器快（多了約 ${Math.round(ran - allowed)} 個遊戲小時），可能是裝置的時間不對`,
    });
  }

  // 已經存在的魚：身分不會變（基因、品種、性別、第幾代）；老闆送的魚不能變成可以賣的
  const before = new Map(allFish(prev).map((f) => [f.id, f]));
  for (const f of allFish(next)) {
    const old = before.get(f.id);
    if (!old) continue;
    if (!sameIdentity(old, f)) problems.push({ code: 'identity_changed', message: `#${f.id} 這條魚的身分（品種、性別或基因）跟伺服器上的不一樣` });
    if (old.gift && !f.gift) problems.push({ code: 'gift_removed', message: `#${f.id} 是老闆送的魚，不能改成可以賣` });
  }

  // 錢的範圍（#76）：市場的收支伺服器帳本已經寫進上一份了，多出來的只能是單機賺的
  const coins = economy(next.state).coins;
  const gained = coins - economy(prev.state).coins;
  if (!Number.isFinite(coins)) problems.push({ code: 'coins_jump', message: '存檔裡的錢不是正常的數字' });
  else if (gained > 0) {
    const cap = earnCap(tanksOf(prev), tanksOf(next)).total;
    if (gained > cap) problems.push({ code: 'coins_jump', message: `錢比伺服器上一份多了 ${Math.round(gained)}，這段時間最多只賺得到約 ${cap}` });
  }

  // 新出現的魚、母魚換了的精子：基因要生得出來、買得到（#76，genome-check.ts）
  const known = [...shipped.map((f) => f.genome), ...received];
  for (const f of forgedGenomes(tanksOf(prev), tanksOf(next), known)) problems.push({ code: 'genome_forged', message: f.reason });

  // 編號和身分都一樣才是同一條：新遊戲或換裝置從頭玩，編號會重來，同編號的是另一條魚
  for (const f of allFish(next)) {
    if (shipped.some((s) => s.id === f.id && sameIdentity(s, f))) problems.push({ code: 'shipped_fish', message: `#${f.id} 這條魚已經在市場賣出了，存檔裡不該還有` });
  }
  return problems;
}

/** 已經出貨的魚：編號＋身分（市場用的魚資料，多的欄位不看）。 */
export interface ShippedFish {
  id?: unknown;
  species?: unknown;
  sex?: unknown;
  generation?: unknown;
  genome?: unknown;
}

type Identity = Pick<ShippedFish, 'species' | 'sex' | 'generation' | 'genome'>;

/** 魚的身分：品種、性別、第幾代、基因（基因不看欄位順序）。 */
function sameIdentity(a: Identity, b: Identity): boolean {
  return a.species === b.species && a.sex === b.sex && (a.generation ?? 0) === (b.generation ?? 0) && canonical(a.genome ?? null) === canonical(b.genome ?? null);
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export interface InspectResult {
  found: boolean;
  alive?: boolean;
  /** 市場用的魚資料（跟遊戲端 marketItem 同一個格式）。 */
  item?: Record<string, unknown>;
}

/** 在存檔的所有缸（含檢疫盒）裡找某一條魚。 */
export function inspect(raw: unknown, fishId: number): InspectResult {
  const fish = allFish(load(raw)).find((f) => f.id === fishId);
  if (!fish) return { found: false };
  return { found: true, alive: fish.alive, item: marketItem(fish) };
}

/** 一筆要查的市場訂單：訂單編號＋伺服器出貨時存的魚資料（帶不帶病看這份，不看買家存檔）。 */
export interface ArrivalQuery {
  order: number;
  item: Record<string, unknown>;
}

/** 買家存檔裡這幾筆市場訂單的魚現在怎麼樣（到貨後 30 天存活、死因算不算賣家的）。 */
export function arrivals(raw: unknown, orders: readonly ArrivalQuery[]): ArrivalStatus[] {
  return arrivalStatus(tanksOf(load(raw)), orders.map((o) => ({ order: o.order, carried: carriedDiseases(o.item) })));
}
