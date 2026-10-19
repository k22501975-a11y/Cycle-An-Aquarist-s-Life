import { describe, expect, it } from 'vitest';
import { newGameState } from './game';
import { parseSave, serializeSave } from './save';
import { claimQuestReward, economy } from '../sim';

describe('新手任務獎勵只發一次（架構審查 #123）', () => {
  it('同一個任務領第二次是 0；匯出再匯入存檔、重跑教學也領不到', () => {
    const s = newGameState(1);
    const start = economy(s).coins;
    expect(claimQuestReward(s, 'plant', 50)).toBe(50);
    expect(claimQuestReward(s, 'plant', 50)).toBe(0);
    expect(economy(s).coins).toBe(start + 50);
    const res = parseSave(serializeSave(s, 1));
    if (!res.ok) throw new Error('存檔讀不回來');
    const loaded = res.file.state;
    expect(claimQuestReward(loaded, 'plant', 50)).toBe(0);
    expect(claimQuestReward(loaded, 'test', 50)).toBe(50);
  });
});
