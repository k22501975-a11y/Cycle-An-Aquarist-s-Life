import type { KeyValueStore } from '../game/save';

/** 聲音設定：各音軌音量 0～1，存在瀏覽器裡（和存檔分開，換新缸也不會重設）。 */
export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  muted: boolean;
}

export const AUDIO_SETTINGS_KEY = 'cycle.audio.v1';

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { master: 0.8, music: 0.45, sfx: 0.8, ambience: 0.5, muted: false };

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

export function normalizeAudioSettings(raw: unknown): AudioSettings {
  const d = DEFAULT_AUDIO_SETTINGS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof AudioSettings, unknown>>;
  return {
    master: clamp01(r.master, d.master),
    music: clamp01(r.music, d.music),
    sfx: clamp01(r.sfx, d.sfx),
    ambience: clamp01(r.ambience, d.ambience),
    muted: typeof r.muted === 'boolean' ? r.muted : d.muted,
  };
}

export function loadAudioSettings(store: KeyValueStore): AudioSettings {
  try {
    const raw = store.getItem(AUDIO_SETTINGS_KEY);
    return normalizeAudioSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function saveAudioSettings(store: KeyValueStore, settings: AudioSettings): void {
  try {
    store.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 存不了就算了，下次用預設值。
  }
}
