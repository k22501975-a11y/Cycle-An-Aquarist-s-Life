import { describe, expect, it } from 'vitest';
import { addFish, simulate } from '../sim';
import { newGameState } from '../game/game';
import { catchUp, parseSave, serializeSave } from '../game/save';
import { advance, BadSave, inspect, verify } from './handlers';

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

  it('上傳檢查：把裝置時間往後調、遊戲時間跑得比伺服器快，會被擋下', () => {
    const { state, raw } = saveAt(T0);
    simulate(state, 24 * 7);
    const problems = verify(raw, JSON.parse(serializeSave(state, 7, T0 + 24 * HOUR_MS)), HOUR_MS);
    expect(problems.map((p) => p.code)).toEqual(['time_ahead']);
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

  it('上傳檢查：已經在市場出貨的魚又出現在存檔裡（拿出貨前的舊存檔上傳），會被擋下', () => {
    const { state, raw } = saveAt(T0);
    const sold = state.fish[0];
    // 出貨後遊戲已經把魚撈走；拿出貨前的存檔來上傳，魚又回來了
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0)), 0, [sold.id]).map((p) => p.code)).toEqual(['shipped_fish']);
    state.fish.splice(0, 1);
    expect(verify(raw, JSON.parse(serializeSave(state, 7, T0)), 0, [sold.id])).toEqual([]);
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
});
