import {
  createTank,
  monthOf,
  roomClimate,
  FILTERS,
  GameClock,
  HEATERS,
  LIGHTS,
  step,
  TANKS,
  type SimEvent,
  type TankState,
} from '../sim';

/** 開發用的時間倍率選項（現實 1 秒 = 遊戲幾秒）。7 是正式的基準倍率。 */
export const SPEED_OPTIONS = [
  { scale: 0, label: '暫停' },
  { scale: 7, label: '×7' },
  { scale: 60, label: '1分/秒' },
  { scale: 600, label: '10分/秒' },
  { scale: 3600, label: '1時/秒' },
  { scale: 21600, label: '6時/秒' },
] as const;

/** 每個畫面最多跑幾個 tick，避免分頁切回來時一次補算太多而卡住。 */
const MAX_TICKS_PER_FRAME = 1500;

/** 依現實日期、地區、冷氣房設定更新室溫（季節跟著現實日曆走，不隨遊戲時間加速）。 */
export function applySeason(state: TankState, date = new Date()): void {
  const env = state.environment;
  const climate = roomClimate(monthOf(date), env.region ?? 'north', env.airConditioned ?? false);
  env.roomTempC = climate.meanC;
  env.roomSwingC = climate.swingC;
}

/** 新遊戲：一個 40L 新缸、基本設備，還沒養水（真實的起點）。 */
export function newGameState(seed = Date.now() % 2147483647): TankState {
  const state = createTank({
    tank: TANKS.std40,
    filter: FILTERS.hangOn,
    heater: { spec: HEATERS.h50, targetC: 25 },
    light: { spec: LIGHTS.basic },
    seed,
  });
  // 從第一天早上 8 點開始，玩家很快就能看到開燈。
  state.hours = 8;
  applySeason(state);
  state.water.tempC = state.water.tempAvgC = state.environment.roomTempC;
  return state;
}

/**
 * 遊戲迴圈：把現實時間換算成模擬 tick，並把模擬產生的新事件交給畫面。
 * 不碰 DOM，方便測試。
 */
export class Game {
  readonly clock: GameClock;
  /** 最後一個已通知過的事件（事件陣列有長度上限，用物件本身而不是索引來追蹤）。 */
  private lastSeen: SimEvent | undefined;
  private eventListeners: Array<(e: SimEvent) => void> = [];
  private changeListeners: Array<() => void> = [];

  constructor(public state: TankState, timeScale = 7) {
    this.clock = new GameClock(timeScale);
    this.lastSeen = state.events.at(-1);
  }

  onEvent(listener: (e: SimEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /** 狀態因玩家操作而改變時通知（畫面據此立即重繪面板）。 */
  onChange(listener: () => void): void {
    this.changeListeners.push(listener);
  }

  /** 推進現實時間 realMs，回傳實際執行的 tick 數。 */
  advance(realMs: number): number {
    const ticks = Math.min(this.clock.advance(realMs), MAX_TICKS_PER_FRAME);
    for (let i = 0; i < ticks; i++) step(this.state);
    if (ticks > 0) this.flushEvents();
    return ticks;
  }

  /** 執行一個玩家操作，並通知畫面。 */
  act<T>(action: (state: TankState) => T): T {
    const result = action(this.state);
    this.flushEvents();
    this.changeListeners.forEach((l) => l());
    return result;
  }

  private flushEvents(): void {
    const events = this.state.events;
    const fresh = events.slice(this.lastSeen ? events.lastIndexOf(this.lastSeen) + 1 : 0);
    this.lastSeen = events.at(-1);
    fresh.forEach((e) => this.eventListeners.forEach((l) => l(e)));
  }

  /** 換成另一個存檔的狀態（讀檔、新遊戲）。 */
  load(state: TankState): void {
    this.state = state;
    this.lastSeen = state.events.at(-1);
    this.changeListeners.forEach((l) => l());
  }
}
