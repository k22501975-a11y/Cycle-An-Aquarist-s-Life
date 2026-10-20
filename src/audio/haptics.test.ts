import { describe, expect, it } from 'vitest';
import { Haptics, HAPTIC_GAP_MS, HAPTIC_PATTERNS, PLAYER_INPUT_WINDOW_MS } from './haptics';
import { DEFAULT_AUDIO_SETTINGS, normalizeAudioSettings } from './settings';

const recorder = () => {
  const calls: Array<number | number[]> = [];
  return { calls, vibrate: (p: number | number[]) => (calls.push(p), true) };
};

describe('震動回饋（G1）', () => {
  it('玩家常做的動作都有震動，警報最重', () => {
    for (const id of ['tap', 'feed', 'water', 'buy', 'net', 'quest', 'fanfare'] as const) expect(HAPTIC_PATTERNS[id]).toBeDefined();
    const total = (p: number | number[] | undefined) => [p ?? 0].flat().reduce((a, b) => a + b, 0);
    expect(total(HAPTIC_PATTERNS.alarm)).toBeGreaterThan(total(HAPTIC_PATTERNS.tap));
  });

  it('關掉就不震；同一下點擊觸發兩個聲音只震一次', () => {
    const r = recorder();
    const h = new Haptics(true, r.vibrate);
    h.noteInput(0);
    expect(h.buzz('tap', 0)).toBe(true);
    expect(h.buzz('feed', HAPTIC_GAP_MS - 1)).toBe(false);
    expect(h.buzz('feed', HAPTIC_GAP_MS + 1)).toBe(true);
    h.enabled = false;
    expect(h.buzz('buy', 200)).toBe(false);
    expect(r.calls).toEqual([HAPTIC_PATTERNS.tap, HAPTIC_PATTERNS.feed]);
  });

  it('模擬觸發的音效（玩家沒按東西）不震', () => {
    const r = recorder();
    const h = new Haptics(true, r.vibrate);
    expect(h.buzz('birth', 5000)).toBe(false);
    h.noteInput(5000);
    expect(h.buzz('quest', 5000 + PLAYER_INPUT_WINDOW_MS + 1)).toBe(false);
    expect(r.calls).toEqual([]);
  });

  it('不支援震動的瀏覽器什麼都不做', () => {
    expect(new Haptics(true, null).buzz('tap', 0)).toBe(false);
    const throwing = new Haptics(true, () => {
      throw new Error('blocked');
    });
    throwing.noteInput(0);
    expect(throwing.buzz('tap', 0)).toBe(false);
  });

  it('設定預設開震動；舊設定沒有這欄也是開', () => {
    expect(DEFAULT_AUDIO_SETTINGS.haptics).toBe(true);
    expect(normalizeAudioSettings({ muted: true }).haptics).toBe(true);
    expect(normalizeAudioSettings({ haptics: false }).haptics).toBe(false);
  });
});
