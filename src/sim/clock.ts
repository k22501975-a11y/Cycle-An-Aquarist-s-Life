/** 遊戲內 1 秒 = 1 單位。模擬一律以遊戲秒計算，與現實時間脫鉤。 */
export const GAME_SECONDS_PER_DAY = 24 * 60 * 60;

/** 基準倍率：現實 1 天 = 遊戲 1 週。正式上線後由伺服器下發，不可寫死在用戶端。 */
export const DEFAULT_TIME_SCALE = 7;

/** 每個模擬步長代表的遊戲秒數。固定步長讓結果可重現、可測試。 */
export const TICK_GAME_SECONDS = 60;

/**
 * 固定步長的遊戲時鐘。
 *
 * 呼叫端餵入經過的現實毫秒數，時鐘換算成遊戲時間後，
 * 以 TICK_GAME_SECONDS 為單位回報要跑幾個 tick；不足一個 tick 的部分累積到下次。
 */
export class GameClock {
  private accumulated = 0;
  private _gameTime = 0;

  constructor(private _timeScale: number = DEFAULT_TIME_SCALE) {
    this.timeScale = _timeScale;
  }

  get timeScale(): number {
    return this._timeScale;
  }

  set timeScale(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`timeScale must be a non-negative number, got ${value}`);
    }
    this._timeScale = value;
  }

  /** 已模擬的遊戲秒數（只計入完整的 tick）。 */
  get gameTime(): number {
    return this._gameTime;
  }

  /** 推進現實時間，回傳這次要執行的 tick 數。 */
  advance(realMs: number): number {
    this.accumulated += (realMs / 1000) * this._timeScale;
    const ticks = Math.floor(this.accumulated / TICK_GAME_SECONDS);
    this.accumulated -= ticks * TICK_GAME_SECONDS;
    this._gameTime += ticks * TICK_GAME_SECONDS;
    return ticks;
  }
}

/**
 * 推播預測預設看多遠（遊戲小時）：72 小時約現實 10 小時，夠睡一覺。
 * 放在這裡而不是 forecast.ts：主程式只要這個數字，預測本身在 Worker 裡跑，forecast.ts 不用進開機必載。
 */
export const FORECAST_HOURS = 72;
