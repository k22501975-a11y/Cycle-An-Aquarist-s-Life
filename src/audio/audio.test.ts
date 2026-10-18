import { describe, expect, it } from 'vitest';
import { barNotes, chordForBar, midiToFreq, pluckSamples, PROGRESSION } from './music';
import { DEFAULT_AUDIO_SETTINGS, loadAudioSettings, normalizeAudioSettings, saveAudioSettings } from './settings';
import { eventSound, Throttle } from './sounds';

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

describe('聲音設定', () => {
  it('沒存過用預設值，存過讀得回來', () => {
    const store = memoryStore();
    expect(loadAudioSettings(store)).toEqual(DEFAULT_AUDIO_SETTINGS);
    saveAudioSettings(store, { ...DEFAULT_AUDIO_SETTINGS, music: 0.2, muted: true });
    expect(loadAudioSettings(store)).toMatchObject({ music: 0.2, muted: true });
  });

  it('壞掉或超出範圍的數值會被修正', () => {
    expect(normalizeAudioSettings({ master: 3, sfx: -1, music: 'x' })).toMatchObject({ master: 1, sfx: 0, music: DEFAULT_AUDIO_SETTINGS.music });
    const store = memoryStore();
    store.setItem('cycle.audio.v1', '{not json');
    expect(loadAudioSettings(store)).toEqual(DEFAULT_AUDIO_SETTINGS);
  });
});

describe('背景音樂', () => {
  it('和弦四小節一輪，同一小節每次彈的都一樣', () => {
    expect(chordForBar(0)).toBe(PROGRESSION[0]);
    expect(chordForBar(5)).toBe(PROGRESSION[1]);
    expect(barNotes(7)).toEqual(barNotes(7));
  });

  it('每個音都在和弦裡、位置在小節內', () => {
    for (let bar = 0; bar < 32; bar++) {
      const chord = chordForBar(bar);
      const allowed = new Set([chord.root, chord.fifth, ...chord.treble, chord.treble.at(-1)! + 12]);
      for (const n of barNotes(bar)) {
        expect(allowed.has(n.midi)).toBe(true);
        expect(n.step).toBeGreaterThanOrEqual(0);
        expect(n.step).toBeLessThan(8);
        expect(n.velocity).toBeGreaterThan(0);
        expect(n.velocity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('晚上（calm）彈得比較少', () => {
    let day = 0;
    let night = 0;
    for (let bar = 0; bar < 64; bar++) {
      day += barNotes(bar, 0).length;
      night += barNotes(bar, 0.8).length;
    }
    expect(night).toBeLessThan(day * 0.75);
  });

  it('撥弦合成：音量合理、會衰減、沒有 NaN', () => {
    const s = pluckSamples(midiToFreq(57), 22050, 2);
    const rms = (from: number, to: number) => Math.sqrt(s.slice(from, to).reduce((a, v) => a + v * v, 0) / (to - from));
    expect(s.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
    expect(rms(0, 2205)).toBeGreaterThan(0.05);
    expect(rms(30000, 34000)).toBeLessThan(rms(0, 2205) * 0.6);
  });
});

describe('事件音效', () => {
  it('嚴重事件用警報，出生用琶音', () => {
    expect(eventSound('power_out')).toBe('alarm');
    expect(eventSound('heater_stuck')).toBe('alarm');
    expect(eventSound('fry_born')).toBe('birth');
    expect(eventSound('fish_died')).toBe('death');
  });

  it('同一種音效冷卻時間內只響一次', () => {
    const t = new Throttle();
    expect(t.allow('birth', 0, 1500)).toBe(true);
    expect(t.allow('birth', 500, 1500)).toBe(false);
    expect(t.allow('death', 500, 1500)).toBe(true);
    expect(t.allow('birth', 1600, 1500)).toBe(true);
  });
});
