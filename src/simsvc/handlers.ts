import { catchUp, parseSave, serializeSave, type SaveFile } from '../game/save';
import { DEFAULT_TIME_SCALE, ID_BLOCK, marketItem, type Fish, type TankState } from '../sim';
import { canonical, unexplainedFish, type ReceivedFish } from './provenance';

/**
 * 伺服器權威模擬（L2）：Spring Boot 把存檔丟過來，這裡用跟遊戲同一份模擬程式計算。
 * - advance：離線補算到伺服器的現在時間（玩家改裝置時鐘也沒用）
 * - verify：上傳的存檔跟伺服器上一份比，每一缸的遊戲時間不能跑得比現實快、也不能倒退，
 *   已經存在的魚身分（基因、品種、性別）不能被改，新出現的魚要說得出從哪裡來（provenance.ts），
 *   已經在市場出貨的魚不能又出現
 * - inspect：找出存檔裡的某一條魚（市場上架用伺服器這份的資料，不信任遊戲端送來的）
 */

export interface Problem {
  code: 'time_ahead' | 'time_behind' | 'identity_changed' | 'unknown_fish' | 'gift_removed' | 'shipped_fish';
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

/** 缸的編號區段：每一缸的魚、水草編號從自己的區段發（household.ts）。 */
function tankKey(t: TankState): number {
  return Math.floor(t.nextId / ID_BLOCK);
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
 * shipped 是這個玩家已經在市場出貨的魚（市場用的魚資料；拿出貨前的舊存檔上傳，魚會又回來，#75），
 * received 是在市場買到、已經到貨的魚（新出現的魚可以是這些）。
 * 回傳發現的問題（空的代表沒問題）。
 */
export function verify(
  previousRaw: unknown,
  nextRaw: unknown,
  elapsedMs: number,
  shipped: readonly ShippedFish[] = [],
  received: readonly ReceivedFish[] = [],
): Problem[] {
  const prev = load(previousRaw);
  const next = load(nextRaw);
  const problems: Problem[] = [];

  // 遊戲時鐘由伺服器統一：遊戲時間最多比現實 × 7 多一點（暫停時會少，沒關係）
  const allowed = (Math.max(0, elapsedMs) / 3_600_000) * DEFAULT_TIME_SCALE * TIME_SLACK_RATIO + TIME_SLACK_HOURS;
  // 每一缸都看（缸用編號區段認，賣掉一缸後面的缸不會錯位）；新買的缸從主缸的時間算起
  const prevTanks = new Map(tanksOf(prev).map((t) => [tankKey(t), t]));
  let ahead = 0;
  let behind = 0;
  for (const t of tanksOf(next)) {
    const old = prevTanks.get(tankKey(t));
    ahead = Math.max(ahead, t.hours - (old ?? prev.state).hours - allowed);
    if (old) behind = Math.max(behind, old.hours - t.hours);
  }
  if (ahead > 0) {
    problems.push({
      code: 'time_ahead',
      message: `遊戲時間跑得比伺服器快（多了約 ${Math.round(ahead)} 個遊戲小時），可能是裝置的時間不對`,
    });
  }
  // 時間倒退：拿比雲端舊的存檔蓋上去（回溯）
  if (behind > TIME_SLACK_HOURS) {
    problems.push({ code: 'time_behind', message: `這份存檔比雲端上的舊（早了約 ${Math.round(behind)} 個遊戲小時）` });
  }
  const ran = next.state.hours - prev.state.hours;

  // 已經存在的魚：身分不會變（基因、品種、性別、第幾代）；老闆送的魚不能變成可以賣的
  const before = new Map(allFish(prev).map((f) => [f.id, f]));
  for (const f of allFish(next)) {
    const old = before.get(f.id);
    if (!old) continue;
    if (!sameIdentity(old, f)) problems.push({ code: 'identity_changed', message: `#${f.id} 這條魚的身分（品種、性別或基因）跟伺服器上的不一樣` });
    if (old.gift && !f.gift) problems.push({ code: 'gift_removed', message: `#${f.id} 是老闆送的魚，不能改成可以賣` });
  }

  // 新出現的魚：店裡買的、市場到貨的、缸裡生的才說得通（#76）
  for (const f of unexplainedFish(allFish(prev), allFish(next), ran, received)) {
    problems.push({ code: 'unknown_fish', message: `#${f.id} 這條魚不是店裡買的、市場買的，也對不上缸裡哪條母魚生的` });
  }

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
