import type { AmbienceState, AudioEngine } from './engine';
import { Haptics } from './haptics';
import type { AudioSettings } from './settings';
import type { SoundId } from './sounds';

/**
 * 主程式拿到的聲音介面：合成引擎（engine.ts、music.ts）另外拆成一個 chunk，開機時跟 Pixi 初始化一起在背景載，
 * 不算進入口的 300 KB（docs/performance-budget.md §3）。震動不用等引擎，按下去馬上震。
 * 瀏覽器本來就要等第一次點擊才能出聲；引擎還沒載好就點了，載好時補解鎖一次，解不開的話下一次點擊就會解開。
 */
export class LazyAudio {
  private engine: AudioEngine | null = null;
  private readonly haptics: Haptics;
  private unlockWanted = false;
  private ambience: AmbienceState | null = null;
  private paused = false;

  constructor(private settings: AudioSettings) {
    this.haptics = new Haptics(settings.haptics);
  }

  /** 開機時呼叫一次：載入合成引擎，載好之後把設定、環境音、解鎖狀態補上。 */
  load(importEngine: () => Promise<{ AudioEngine: typeof AudioEngine }>): Promise<void> {
    return importEngine().then(
      ({ AudioEngine }) => this.attach(new AudioEngine(this.settings)),
      () => {}, // 網頁版離線又沒快取到：沒有聲音，遊戲照玩
    );
  }

  attach(engine: AudioEngine): void {
    this.engine = engine;
    if (this.ambience) engine.setAmbience(this.ambience);
    if (this.unlockWanted) engine.unlock();
    if (this.paused) engine.setPaused(true);
  }

  unlock(): void {
    this.unlockWanted = true;
    this.engine?.unlock();
  }

  applySettings(settings: AudioSettings): void {
    this.settings = settings;
    this.haptics.enabled = settings.haptics;
    this.engine?.applySettings(settings);
  }

  setAmbience(state: AmbienceState): void {
    this.ambience = state;
    this.engine?.setAmbience(state);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.engine?.setPaused(paused);
  }

  noteInput(): void {
    this.haptics.noteInput();
  }

  buzz(id: SoundId): void {
    this.haptics.buzz(id);
  }

  /** 播音效；haptic 是玩家自己的動作才給（同 AudioEngine.play）。 */
  play(id: SoundId, haptic = true): void {
    if (haptic) this.haptics.buzz(id);
    this.engine?.play(id, false);
  }
}
