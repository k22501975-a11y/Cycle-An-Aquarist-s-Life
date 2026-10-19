/**
 * 開缸演出（design/first-10-minutes.md F1-b，mvp.md §4.4.4）：玩家自己動手的 4 步——
 * 倒沙（點）→ 裝設備（點，一下全裝）→ 注水（按住，放開就停）→ 開機（點電源，燈亮、霧濁轉清）。
 * 每步演出 ≤ 5 秒，演出中點畫面直接跳到這步結尾；等玩家動手時不算「不能操作」。
 * 這裡只算每一步進行到哪（0–1），畫面怎麼畫在 tank-view.ts。
 */

export type SetupStep = 'sand' | 'gear' | 'water' | 'power';

export const SETUP_ORDER: readonly SetupStep[] = ['sand', 'gear', 'water', 'power'];

/** 每步演多久（秒）；注水是按住的時間。 */
export const STEP_SECONDS: Record<SetupStep, number> = { sand: 2, gear: 1.6, water: 3.2, power: 2 };

export interface SetupLook {
  /** 底沙堆到多高（0 還沒倒、1 倒完）。 */
  sand: number;
  /** 沙子正在往下倒（畫落下的沙流）。 */
  pouring: boolean;
  /** 水位（0 空缸、1 滿水）。 */
  water: number;
  /** 正在注水（畫水管和水柱）。 */
  filling: boolean;
  /** 水的霧濁程度（剛注水最濁，開機後過濾器把它慢慢濾清）。 */
  milk: number;
  /** 設備出現（0 還沒裝、1 裝好）。 */
  gear: number;
  /** 燈（0 暗、1 亮）。 */
  light: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export class SetupShow {
  /** 目前這步；全部做完是 'done'。 */
  step: SetupStep | 'done' = 'sand';
  /** 這步已經開始演（倒沙、裝設備、開機點過了；注水是正在按）。 */
  running = false;
  /** 注水：手指按著。 */
  holding = false;
  readonly progress: Record<SetupStep, number> = { sand: 0, gear: 0, water: 0, power: 0 };
  /** 動畫用的時鐘（沙流、水面晃動）。 */
  t = 0;

  /** 等玩家動手（顯示提示）。 */
  get waiting(): boolean {
    return this.step !== 'done' && !this.running && !this.holding;
  }

  /** 玩家按下：倒沙、裝設備、開機開始演；注水開始灌。演出中再按一下就跳到這步結尾。回傳是不是開始了新的一步。 */
  press(): boolean {
    if (this.step === 'done') return false;
    if (this.step === 'water') {
      const fresh = this.progress.water === 0;
      this.holding = true;
      return fresh;
    }
    if (this.running) {
      this.progress[this.step] = 1;
      return false;
    }
    this.running = true;
    return true;
  }

  /** 玩家放開：注水停下來。 */
  release(): void {
    this.holding = false;
  }

  /** 往前走一格；回傳剛做完的那一步。 */
  update(dt: number): SetupStep | null {
    this.t += dt;
    const step = this.step;
    if (step === 'done') return null;
    if (step === 'water' ? this.holding : this.running) this.progress[step] = Math.min(1, this.progress[step] + dt / STEP_SECONDS[step]);
    if (this.progress[step] < 1) return null;
    this.running = this.holding = false;
    this.step = SETUP_ORDER[SETUP_ORDER.indexOf(step) + 1] ?? 'done';
    return step;
  }

  /** 全部跳完（測試、讀檔用）。 */
  finish(): void {
    for (const s of SETUP_ORDER) this.progress[s] = 1;
    this.step = 'done';
    this.running = this.holding = false;
  }

  look(): SetupLook {
    const p = this.progress;
    // 注水時把沙攪起來變濁，開機後過濾器把水濾清
    const milk = 0.75 * Math.min(1, p.water * 3) * (1 - ease(p.power));
    return {
      sand: ease(p.sand),
      pouring: this.step === 'sand' && this.running && p.sand < 0.92,
      water: p.water,
      filling: this.holding && p.water < 1,
      milk,
      gear: ease(p.gear),
      light: ease(p.power),
    };
  }
}

/** 每步開始時的說明字。 */
export const SETUP_CAPTIONS: Record<SetupStep, string> = {
  sand: '倒入底沙',
  gear: '裝上過濾器、加熱棒和燈',
  water: '慢慢注水',
  power: '開機！',
};

/** 等玩家動手時的提示（底部大按鈕）。 */
export const SETUP_PROMPTS: Record<SetupStep, string> = {
  sand: '點一下，倒入底沙',
  gear: '點一下，裝上設備',
  water: '按住注水，放開就停',
  power: '打開電源',
};
