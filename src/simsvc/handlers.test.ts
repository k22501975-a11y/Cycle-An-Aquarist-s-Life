import { describe, expect, it } from 'vitest';
import { addFish, economy, marketItem, receiveFish, simulate } from '../sim';
import { newGameState } from '../game/game';
import { catchUp, parseSave, serializeSave } from '../game/save';
import { advance, arrivals, BadSave, inspect, verify } from './handlers';

const HOUR_MS = 3_600_000;
const T0 = 1_700_000_000_000;

function saveAt(now: number, mutate?: (s: ReturnType<typeof newGameState>) => void) {
  const state = newGameState(42);
  addFish(state, 'guppy', { carriesIch: false, sex: 'male' });
  mutate?.(state);
  return { state, raw: JSON.parse(serializeSave(state, 7, now)) };
}

describe('模擬小服務（L2）', () => {
  it('離線補算：伺服器算出來的跟遊戲自己補算的一模一樣（同一份模擬）', () => {
    const { raw } = saveAt(T0);
    const server = advance(raw, T0 + 2 * HOUR_MS);
    expect(server.hours).toBeCloseTo(14);
    expect((server.save as { savedAt: number }).savedAt).toBe(T0 + 2 * HOUR_MS);

    const local = parseSave(JSON.stringify(raw));
    if (!local.ok) throw new Error('parse');
    catchUp(local.file, T0 + 2 * HOUR_MS);
    expect((server.save as { state: unknown }).state).toEqual(JSON.parse(JSON.stringify(local.file.state)));
  });

  it('上傳檢查：正常玩的存檔沒有問題', () => {
    const { state, raw } = saveAt(T0);
    simulate(state, 7);
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0 + HOUR_MS)), HOUR_MS)).toEqual([]);
  });

  it('上傳檢查：把存檔裡的錢改大會被擋下，正常花錢、賺一點不會（錢的範圍，#76）', () => {
    const { state, raw } = saveAt(T0);
    simulate(state, 7);
    economy(state).coins -= 300;
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0 + HOUR_MS)), HOUR_MS)).toEqual([]);
    economy(state).coins += 400;
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0 + HOUR_MS)), HOUR_MS)).toEqual([]);
    economy(state).coins += 99_999;
    const problems = verify(raw, JSON.parse(serializeSave(state, 7, T0 + HOUR_MS)), HOUR_MS);
    expect(problems.map((p) => p.code)).toEqual(['coins_jump']);
    economy(state).coins = Number.NaN;
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0 + HOUR_MS)), HOUR_MS).map((p) => p.code)).toEqual(['coins_jump']);
  });

  it('上傳檢查：把裝置時間往後調、遊戲時間跑得比伺服器快，會被擋下', () => {
    const { state, raw } = saveAt(T0);
    simulate(state, 24 * 7);
    const problems = verify(raw, JSON.parse(serializeSave(state, 7, T0 + 24 * HOUR_MS)), HOUR_MS);
    expect(problems.map((p) => p.code)).toEqual(['time_ahead']);
  });

  it('上傳檢查：另一缸自己跑得比伺服器快、或拿更舊的存檔回來，都會被擋下（#76）', () => {
    const { state, raw } = saveAt(T0, (s) => simulate(s, 24));
    const extra = newGameState(7);
    extra.hours = state.hours + 24 * 7;
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0 + HOUR_MS, undefined, { tanks: [extra], active: 0 })), HOUR_MS).map((p) => p.code)).toEqual(['time_ahead']);
    state.hours -= 12;
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0 + HOUR_MS)), HOUR_MS).map((p) => p.code)).toEqual(['time_back']);
  });

  it('上傳檢查：改了已經存在的魚的基因或性別會被擋下，老闆送的魚不能改成可以賣', () => {
    const { state, raw } = saveAt(T0, (s) => {
      addFish(s, 'guppy', { carriesIch: false, sex: 'female' }).gift = true;
    });
    const [male, gift] = state.fish;
    male.genome = { ...male.genome!, tail: 100 };
    male.sex = 'female';
    gift.gift = undefined;
    const codes = verify(raw, JSON.parse(serializeSave(state, 7, T0)), 0).map((p) => p.code);
    expect(codes).toEqual(['identity_changed', 'gift_removed']);
  });

  it('上傳檢查：新生的魚、死掉的魚不算問題', () => {
    const { state, raw } = saveAt(T0);
    addFish(state, 'zebrafish', { carriesIch: false });
    state.fish[0].alive = false;
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0)), 0)).toEqual([]);
  });

  it('上傳檢查：憑空多出一條店裡買不到的好魚會被擋下；市場買到的（伺服器知道這份基因）照收（#76）', () => {
    const { state, raw } = saveAt(T0);
    const f = addFish(state, 'guppy', { carriesIch: false, sex: 'male' });
    f.genome = { ...f.genome!, tail: 99 };
    const next = JSON.parse(serializeSave(state, 7, T0));
    expect(verify(raw, next, 0).map((p) => p.code)).toEqual(['genome_forged']);
    expect(verify(raw, next, 0, [], [f.genome])).toEqual([]);
  });

  it('上傳檢查：媽媽不在存檔裡的小魚查不到來歷，存檔照收但標 lineage_unknown；牠生的小魚也跟著標（#76）', () => {
    // 架構的探針：第一次上傳，假的媽媽編號＋完美基因
    const { state } = saveAt(T0, (s) => (s.hours = 2000));
    const fake = addFish(state, 'guppy', { carriesIch: false, sex: 'female' });
    fake.genome = { ...fake.genome!, tail: 100, fins: 100, albino: [1, 1], red: [1, 1] };
    fake.generation = 3;
    fake.motherId = 424242;
    fake.bornHours = 10;
    const raw = JSON.parse(serializeSave(state, 7, T0));
    const alone = verify(null, raw, 0);
    expect(alone.map((p) => p.code)).toEqual(['lineage_unknown']);
    expect(alone[0].fish).toEqual({ id: fake.id, genome: fake.genome });

    // 伺服器記住了；之後這尾生的小魚也查不到
    const kid = addFish(state, 'guppy', { carriesIch: false, sex: 'male' });
    kid.genome = { ...fake.genome!, y: kid.genome!.y };
    kid.motherId = fake.id;
    kid.bornHours = state.hours;
    kid.generation = 4;
    const next = JSON.parse(serializeSave(state, 7, T0));
    const later = verify(raw, next, 0, [], [], [alone[0].fish!]);
    expect(later.map((p) => p.code)).toEqual(['lineage_unknown']);
    expect(later[0].fish!.id).toBe(kid.id);
  });

  it('上傳檢查：兩次上傳隔 20 天以上、媽媽不在了的小魚，不擋但標 lineage_unknown（#301 留下的洞）', () => {
    const { state, raw } = saveAt(T0);
    state.hours += 24 * 25;
    const fry = addFish(state, 'guppy', { carriesIch: false, sex: 'male' });
    fry.genome = { ...fry.genome!, tail: 100 };
    fry.motherId = 999;
    fry.bornHours = state.hours - 24;
    const problems = verify(raw, JSON.parse(serializeSave(state, 7, T0 + 4 * 24 * HOUR_MS)), 4 * 24 * HOUR_MS);
    expect(problems.map((p) => p.code)).toEqual(['lineage_unknown']);
  });

  it('上傳檢查：已經在市場出貨的魚又出現在存檔裡（拿出貨前的舊存檔上傳），會被擋下', () => {
    const { state, raw } = saveAt(T0);
    const sold = inspect(raw, state.fish[0].id).item!;
    // 出貨後遊戲已經把魚撈走；拿出貨前的存檔來上傳，魚又回來了
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0)), 0, [sold]).map((p) => p.code)).toEqual(['shipped_fish']);
    state.fish.splice(0, 1);
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0)), 0, [sold])).toEqual([]);
  });

  it('上傳檢查：出貨後開新遊戲，同編號但是不同的魚，不算已出貨', () => {
    const { state, raw } = saveAt(T0);
    const sold = inspect(raw, state.fish[0].id).item!;
    // 新遊戲的魚編號從頭開始：同一個編號，基因（或性別、品種）不一樣就是另一條魚
    const fresh = saveAt(T0, (s) => {
      s.fish[0].genome = { ...s.fish[0].genome!, tail: (s.fish[0].genome!.tail ?? 0) === 100 ? 0 : 100 };
    });
    expect(fresh.state.fish[0].id).toBe(sold.id);
    expect(verify(fresh.raw, fresh.raw, 0, [sold])).toEqual([]);
    expect(verify(fresh.raw, fresh.raw, 0, [{ ...sold, sex: 'female' }])).toEqual([]);
  });

  it('查魚：找得到就回傳市場用的資料，找不到回 found=false', () => {
    const { state, raw } = saveAt(T0);
    const fish = state.fish[0];
    const res = inspect(raw, fish.id);
    expect(res.found).toBe(true);
    expect(res.alive).toBe(true);
    expect(res.item).toMatchObject({ id: fish.id, species: 'guppy', genome: fish.genome });
    expect(inspect(raw, 999_999)).toEqual({ found: false });
  });

  it('壞掉的存檔丟 BadSave', () => {
    expect(() => advance({ version: 3 }, T0)).toThrow(BadSave);
  });

  it('到貨追蹤：回傳買家這邊的魚還活著沒、死因算不算賣家的（帶病看伺服器的出貨資料）', () => {
    const { state } = saveAt(T0);
    const seller = newGameState(7);
    const sold = addFish(seller, 'guppy', { carriesIch: false, sex: 'male' });
    sold.ich = { stage: 'incubating', progress: 0 };
    const item = marketItem(sold);
    receiveFish(state, item, { stress: 0.3, bagTemp: state.water.tempC, bagPh: state.water.ph, drip: true }, 31);
    const raw = JSON.parse(serializeSave(state, 7, T0));
    const [got, missing] = arrivals(raw, [
      { order: 31, item },
      { order: 32, item: {} },
    ]);
    expect(got).toMatchObject({ order: 31, status: 'alive', sellerFault: false, survived: false });
    expect(missing.status).toBe('unknown');
  });
});
