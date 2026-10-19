import {
  createTank,
  monthOf,
  roomClimate,
  GameClock,
  step,
  TANKS,
  linkTanks,
  syncRoom,
  applySetup,
  economy,
  needsSetup,
  RECOMMENDED_SETUP,
  type SimEvent,
  type TankState,
} from '../sim';

/** 時間倍率選項（現實 1 秒 = 遊戲幾秒）。7 是正式的基準倍率。short 顯示在主畫面的速度按鈕上，name 是選單裡的說明。 */
export const SPEED_OPTIONS = [
  { scale: 0, label: '暫停', short: '暫停', name: '暫停時間' },
  { scale: 7, label: '×7', short: '×7', name: '正常速度（現實 1 天＝遊戲 1 週）' },
  { scale: 60, label: '1分/秒', short: '1分/秒', name: '快轉：每秒 1 分鐘' },
  { scale: 600, label: '10分/秒', short: '10分/秒', name: '快轉：每秒 10 分鐘' },
  { scale: 3600, label: '1時/秒', short: '1時/秒', name: '快轉：每秒 1 小時' },
  { scale: 21600, label: '6時/秒', short: '6時/秒', name: '快轉：每秒 6 小時' },
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

/**
 * 新遊戲（F1 開缸）：阿德老闆送的空缸、起始資金，設備還沒買。玩家開完缸（applySetup）之前時間不走。
 * 缸的大小先當 40L，開缸時照玩家選的換掉。
 */
export function blankGameState(seed = Date.now() % 2147483647): TankState {
  const state = createTank({ tank: TANKS.std40, seed });
  // 從第一天早上 8 點開始，玩家很快就能看到開燈。
  state.hours = 8;
  applySeason(state);
  state.water.tempC = state.water.tempAvgC = state.environment.roomTempC;
  economy(state).setupPending = true;
  return state;
}

/** 已經用「推薦組合」開好缸的新遊戲（40L、外掛過濾、50W、基本燈、石英砂），還沒養水。測試和劇本從這裡開始。 */
export function newGameState(seed = Date.now() % 2147483647): TankState {
  const state = blankGameState(seed);
  applySetup(state, RECOMMENDED_SETUP);
  return state;
}

/**
 * 遊戲迴圈：把現實時間換算成模擬 tick，並把模擬產生的新事件交給畫面。
 * 玩家可以有好幾缸，全部跟著同一個時鐘走；畫面和面板只看「目前這缸」（state）。
 * 不碰 DOM，方便測試。
 */
export class Game {
  readonly clock: GameClock;
  /** 所有的缸；第一缸是起始的主缸，錢包存在它身上。 */
  tanks: TankState[];
  /** 目前在看哪一缸。 */
  active = 0;
  /** 每缸最後一個已通知過的事件（事件陣列有長度上限，用物件本身而不是索引來追蹤）。 */
  private lastSeen = new Map<TankState, SimEvent | undefined>();
  private eventListeners: Array<(e: SimEvent, tank: number) => void> = [];
  private changeListeners: Array<() => void> = [];

  constructor(state: TankState, timeScale = 7, others: TankState[] = [], active = 0) {
    this.clock = new GameClock(timeScale);
    this.tanks = [state, ...others];
    this.active = Math.min(Math.max(0, active), this.tanks.length - 1);
    linkTanks(this.tanks);
    this.markSeen();
  }

  /** 目前這缸。 */
  get state(): TankState {
    return this.tanks[this.active];
  }

  /** 其他的缸（不含目前這缸）。 */
  get others(): TankState[] {
    return this.tanks.filter((_, i) => i !== this.active);
  }

  onEvent(listener: (e: SimEvent, tank: number) => void): void {
    this.eventListeners.push(listener);
  }

  /** 狀態因玩家操作而改變時通知（畫面據此立即重繪面板）。 */
  onChange(listener: () => void): void {
    this.changeListeners.push(listener);
  }

  /** 推進現實時間 realMs，回傳實際執行的 tick 數。 */
  advance(realMs: number): number {
    // 還沒開缸：時鐘照樣吃掉現實時間（開完缸不會一口氣補算），模擬不動
    if (needsSetup(this.tanks[0])) {
      this.clock.advance(realMs);
      return 0;
    }
    const ticks = Math.min(this.clock.advance(realMs), MAX_TICKS_PER_FRAME);
    for (let i = 0; i < ticks; i++) for (const t of this.tanks) step(t);
    if (ticks > 0) this.flushEvents();
    return ticks;
  }

  /** 對目前這缸執行一個玩家操作，並通知畫面。房間的設定（冷氣、停電）跟著同步到每一缸。 */
  act<T>(action: (state: TankState) => T): T {
    const result = action(this.state);
    for (const t of this.others) syncRoom(this.state, t);
    this.changed();
    return result;
  }

  /** 牽涉好幾缸的操作（買缸、魚換缸、收缸）。 */
  actAll<T>(action: (tanks: TankState[]) => T): T {
    const current = this.state;
    const result = action(this.tanks);
    linkTanks(this.tanks);
    const i = this.tanks.indexOf(current);
    this.active = i >= 0 ? i : Math.min(this.active, this.tanks.length - 1);
    this.changed();
    return result;
  }

  /** 切換到第 index 缸。 */
  switchTo(index: number): void {
    if (index < 0 || index >= this.tanks.length || index === this.active) return;
    this.active = index;
    this.changeListeners.forEach((l) => l());
  }

  private changed(): void {
    this.flushEvents();
    this.changeListeners.forEach((l) => l());
  }

  private markSeen(): void {
    this.lastSeen = new Map(this.tanks.map((t) => [t, t.events.at(-1)]));
  }

  private flushEvents(): void {
    this.tanks.forEach((t, index) => {
      const events = t.events;
      const last = this.lastSeen.get(t);
      const fresh = events.slice(last ? events.lastIndexOf(last) + 1 : 0);
      this.lastSeen.set(t, events.at(-1));
      fresh.forEach((e) => this.eventListeners.forEach((l) => l(e, index)));
    });
  }

  /** 換成另一個存檔的狀態（讀檔、新遊戲）：所有缸一起換掉。 */
  load(state: TankState, others: TankState[] = [], active = 0): void {
    this.tanks = [state, ...others];
    this.active = Math.min(Math.max(0, active), this.tanks.length - 1);
    linkTanks(this.tanks);
    this.markSeen();
    this.changeListeners.forEach((l) => l());
  }

  /** 復原：只把目前這缸換回操作前的樣子（其他缸不動）。 */
  restoreActive(state: TankState): void {
    // 復原前的錢包是複製出來的；把它的內容寫回共用的錢包（id 區段只會往前）
    const wallet = this.tanks[0].economy;
    const saved = state.economy;
    if (wallet && saved && saved !== wallet) {
      const block = Math.max(wallet.nextTankBlock ?? 0, saved.nextTankBlock ?? 0);
      Object.assign(wallet, saved, { nextTankBlock: block || undefined });
      state.economy = wallet;
    }
    this.tanks[this.active] = state;
    linkTanks(this.tanks);
    this.markSeen();
    this.changeListeners.forEach((l) => l());
  }
}
