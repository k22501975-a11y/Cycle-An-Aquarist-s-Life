import { describe, expect, it } from 'vitest';
import { addFish } from '../sim';
import { newGameState } from './game';
import { catchUpSave, WORKER_MIN_HOURS } from './catchup-runner';
import { catchUp, parseSave, serializeSave } from './save';

const HOUR_MS = 3_600_000;

function savedTank(): string {
  const s = newGameState(3);
  addFish(s, 'guppy', { carriesIch: false });
  return serializeSave(s, 7, 0);
}

describe('開機補算（G6）', () => {
  it('沒有 Worker（測試環境、舊瀏覽器）就在主執行緒算，結果和 catchUp 一樣', async () => {
    const raw = savedTank();
    const a = parseSave(raw);
    const b = parseSave(raw);
    if (!a.ok || !b.ok) throw new Error('存檔讀不出來');
    const now = 8 * HOUR_MS;
    const { file, offline } = await catchUpSave(a.file, now);
    const direct = catchUp(b.file, now);
    expect(offline.hours).toBe(direct.hours);
    expect(offline.byTank.map((ev) => ev.map((e) => e.type))).toEqual(direct.byTank.map((ev) => ev.map((e) => e.type)));
    expect(JSON.stringify(file.state)).toBe(JSON.stringify(b.file.state));
  });

  it('離開不到 WORKER_MIN_HOURS 遊戲小時直接算', async () => {
    const res = parseSave(savedTank());
    if (!res.ok) throw new Error('存檔讀不出來');
    const now = ((WORKER_MIN_HOURS / 7) * HOUR_MS) / 2;
    const { file, offline } = await catchUpSave(res.file, now);
    expect(file).toBe(res.file);
    expect(offline.hours).toBeCloseTo(WORKER_MIN_HOURS / 2, 5);
  });
});
