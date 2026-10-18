import { describe, expect, it } from 'vitest';
import { addFish, createTank, FILTERS, FISH_SPECIES, PLANT_SPECIES, TANKS } from '../sim';
import { CODEX, isUnlocked, loadCodexSeen, saveCodexSeen, unlockCodex } from './codex';

describe('圖鑑', () => {
  it('每個魚種、水草都有條目和說明', () => {
    for (const id of Object.keys(FISH_SPECIES)) expect(CODEX.find((e) => e.id === `fish:${id}`)?.text).toBeTruthy();
    for (const id of Object.keys(PLANT_SPECIES)) expect(CODEX.find((e) => e.id === `plant:${id}`)?.text).toBeTruthy();
    expect(new Set(CODEX.map((e) => e.id)).size).toBe(CODEX.length);
  });

  it('疾病一開始鎖著，遇到才解鎖，只解鎖一次', () => {
    const s = createTank({ tank: TANKS.std40, filter: FILTERS.sponge });
    const seen = new Set<string>();
    const ich = CODEX.find((e) => e.id === 'disease:ich')!;
    expect(isUnlocked(ich, seen)).toBe(false);
    expect(unlockCodex(seen, s)).toEqual([]);
    const fish = addFish(s, 'guppy');
    s.events.push({ hours: 1, type: 'ich_visible', subjectId: fish.id });
    expect(unlockCodex(seen, s).map((e) => e.id)).toContain('disease:ich');
    expect(isUnlocked(ich, seen)).toBe(true);
    expect(unlockCodex(seen, s)).toEqual([]);
  });

  it('測到氨就解鎖新缸症候群', () => {
    const s = createTank({ tank: TANKS.std40, filter: FILTERS.sponge });
    s.testLog = [{ hours: 0, reading: { ammonia: 0.25, nitrite: 0, nitrate: 0, ph: 7, kh: 4 } }];
    expect(unlockCodex(new Set(), s).map((e) => e.id)).toEqual(['disease:new_tank']);
  });

  it('解鎖紀錄存得起來', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: () => {} };
    saveCodexSeen(store, new Set(['disease:ich']));
    expect([...loadCodexSeen(store)]).toEqual(['disease:ich']);
  });
});
