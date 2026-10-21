import type { SoundId } from '../audio/sounds';
import type { KeyValueStore } from '../game/save';
import { checkGoals, nextGoals, nextStep, UNLOCK_LABELS, type Goal, type NextStep, type NextTarget, type TankState } from '../sim';
import { h } from './dom';
import { artImg, ownerImg } from './art-icons';
import { ownerMood, type OwnerMood } from './owner-mood';
import { kickOwnerQueue, onOwnerAskClosed, onOwnerAskOpened, ownerAskOpen } from './owner-ask';
import { advanceQuest, currentQuest, loadProgress, newProgress, OWNER_NAME, pendingTip, QUESTS, questShopTab, saveProgress, type QuestQuick, type QuestShopTab, type QuestTarget, type TutorialProgress } from './tutorial';
import type { QuickKind } from './quest-tray';

/** 任務卡上「做好了」閃多久（design/tutorial-lines.md：3 秒後自己換成下一步）。 */
const FLASH_MS = 3000;
/** 老闆的一句提醒在畫面邊緣留多久。 */
const TIP_MS = 14_000;

interface Page {
  text: string;
  label?: string;
  /** 這一頁多一顆「帶我去商店」，直接開在任務要買的那一頁。 */
  shop?: QuestShopTab;
  /** 這一頁多一顆「去擺位置」，進造景模式。 */
  scape?: boolean;
}

/**
 * 新手引導的介面：左上角的任務小卡，以及老闆說話的對話框。
 * 教學做完（或跳過）後，小卡改顯示接下來的目標（goals.ts，M19）。
 *
 * P1（polish-to-9.md §6.3）：教學不再一直跳要按「下一個任務」的對話框。
 * - 任務卡上一行提示說現在要做什麼，要點的按鈕發光（target）；做完卡上閃「✓ 種好了 +50」就自動換下一步。
 * - 要按掉的對話框只留第一次放魚（doneDialog）；老闆完整的話進通知匣（note）。
 * - 情境提醒（測到氨、白點…）改成畫面左下角一張小卡，不擋缸、過一陣子自己收。
 * - 想聽老闆完整說明就點任務卡。
 */
export class Guide {
  readonly pill = h('button.quest-pill.glass');
  private readonly progressEl = h('span.quest-progress');
  private readonly meterFill = h('i');
  private readonly meterEl = h('span.quest-meter', {}, this.meterFill);
  private shownProgress = '';
  private readonly bubble = h('div.owner.glass');
  private progress: TutorialProgress;
  private pages: Page[] = [];
  private onDone: (() => void) | null = null;
  /** 完成任務時通知（匿名數據分析用來看新手卡在哪一步）。 */
  questDone: ((step: number, id: string) => void) | null = null;
  /** 打開商店的某一頁（main 接上）。 */
  openShop: ((tab: QuestShopTab) => void) | null = null;
  /** 進造景模式（main 接上）。 */
  openScape: (() => void) | null = null;
  /** 發新手任務獎勵（main 接上，加到共用錢包）；回傳實際發了多少，領過的任務是 0。 */
  reward: ((questId: string, coins: number) => number) | null = null;
  /** 目標完成、發了獎勵（main 接上：存檔、更新畫面）。 */
  goalsChanged: (() => void) | null = null;
  /** 老闆完整的話放進通知匣（main 接上）。 */
  note: ((text: string) => void) | null = null;
  /** 任務卡上閃「做好了」時的獎勵特效（main 接上：金幣從任務卡飛出）。 */
  cheer: ((from: DOMRect, coins: number) => void) | null = null;
  /** 點任務卡上的「下一步」（U1，教學做完後）：帶到要做的地方（main 接上）。 */
  goNext: ((target: NextTarget) => void) | null = null;
  /** 任務卡下面一鍵買的圖卡（#235，main 接上：quest-tray.ts）。 */
  quickTray: ((kind: QuickKind) => HTMLElement) | null = null;
  /** 任務卡下面那排圖卡（教學要買魚、水草、石頭時才有）。 */
  readonly tray = h('div.quest-tray', { hidden: true });
  private shownTray = '';
  /** 現在的下一步（教學做完後，目標串的第一個還沒完成的目標要做什麼）。 */
  private step: NextStep | null = null;
  /** 情境提醒的小卡（畫面左下角）。 */
  readonly tip = h('div.owner-tip.glass', { role: 'status' });
  private tipTimer = 0;
  /** 任務卡上正在閃的「做好了」。 */
  private flash: { text: string; coins: number } | null = null;
  private flashTimer = 0;
  /** 上一次 update 看到的所有缸（小卡顯示目標用）。 */
  private tanks: TankState[] = [];
  private shownGoal = '';

  constructor(
    host: HTMLElement,
    private readonly store: KeyValueStore,
    private readonly sound: (id: SoundId) => void,
    private readonly onLayout: () => void,
  ) {
    this.progress = loadProgress(store);
    // 教學做完後點任務卡直接帶去做「下一步」（U1）；教學中點了再聽一次完整說明
    this.pill.addEventListener('click', () => (this.tutorialOver && this.step && this.goNext ? this.goNext(this.step.target) : this.showQuest()));
    // 對話框掛在 body：面板（商店等）開著時也在最上層，按鈕按得到
    host.append(this.pill, this.tray, this.tip);
    document.body.append(this.bubble);
    // 一次只出一個老闆對話框（G9）：問句跳出來時先收起，問句收掉再接著說
    onOwnerAskOpened(() => this.bubble.classList.remove('open'));
    onOwnerAskClosed(() => this.pages.length > 0 && this.renderBubble());
    this.renderPill();
  }

  /** 老闆正在說（或還有話要說）。 */
  get talking(): boolean {
    return this.pages.length > 0;
  }

  /** 現在任務要點的按鈕（main 讓它發光）；任務卡正在閃「做好了」時先不亮。 */
  get target(): QuestTarget | null {
    if (this.flash || this.pages.length > 0) return null;
    if (this.tutorialOver) return this.step ? NEXT_GLOW[this.step.target] : null;
    return currentQuest(this.progress)?.target ?? null;
  }

  /** 現在任務不用繞路的做法（#235）：main 照這個自動進餵食模式、讓缸的名牌發光。 */
  get quick(): QuestQuick | null {
    if (this.flash || this.pages.length > 0) return null;
    return currentQuest(this.progress)?.quick ?? null;
  }

  get trayVisible(): boolean {
    return !this.tray.hidden;
  }

  /** 錢變了：圖卡上「錢不夠」的樣子要跟著變。 */
  refreshTray(): void {
    this.shownTray = '';
    this.renderTray();
  }

  private renderTray(): void {
    const kind = this.quick;
    const tray = kind === 'fish' || kind === 'plant' || kind === 'stone' ? kind : null;
    if ((tray ?? '') === this.shownTray) return;
    this.shownTray = tray ?? '';
    this.tray.hidden = !tray || !this.quickTray;
    this.tray.replaceChildren(...(tray && this.quickTray ? [this.quickTray(tray)] : []));
  }

  get pillVisible(): boolean {
    return this.pill.classList.contains('show');
  }

  /** 教學做完或跳過了：改看目標。 */
  private get tutorialOver(): boolean {
    return currentQuest(this.progress) === null;
  }

  /** 每半秒檢查一次：任務、目標完成了沒、有沒有該提醒的狀況。對話框開著時先不打斷。 */
  update(state: TankState, tanks: TankState[] = [state]): void {
    this.tanks = tanks;
    this.renderProgress(state);
    // 還有話沒說完（包括讓位給老闆問句、還在等的）就先不出新的
    if (this.pages.length > 0) return;
    const done = advanceQuest(this.progress, state);
    if (done) {
      this.save();
      this.questDone?.(this.progress.step, done.id);
      const paid = this.reward?.(done.id, done.reward) ?? 0;
      this.sound('quest');
      const next = currentQuest(this.progress);
      const text = paid > 0 ? `${done.done}（獎勵 ${paid} 魚幣）` : done.done;
      if (done.doneDialog) {
        this.say([{ text, label: next ? '好' : '謝謝老闆', scape: done.doneScape }]);
        return;
      }
      this.note?.(text);
      const short = done.doneShortFor?.(state) ?? null;
      // 任務卡已經說了「測到氨了！先換水」，同一句的情境提醒就不再跳
      if (short && done.id === 'test' && !this.progress.seenTips.includes('ammonia')) {
        this.progress.seenTips.push('ammonia');
        this.save();
      }
      this.showFlash(short ?? done.doneShort, paid);
      return;
    }
    const goals = checkGoals(tanks, this.tutorialOver);
    if (goals.length > 0) {
      this.goalsChanged?.();
      this.sound('quest');
      for (const g of goals) this.note?.(goalDoneText(g));
      this.showFlash(`目標達成：${goals[0].title}`, goals.reduce((sum, g) => sum + g.coins, 0));
      return;
    }
    const tip = pendingTip(this.progress, state);
    if (tip) {
      this.progress.seenTips.push(tip.id);
      this.save();
      this.sound('open');
      this.showTip(tip.short ?? tip.text, tip.short ? tip.text : undefined);
    }
  }

  /** 任務卡閃一下「✓ 做好了 +50」，接著自己換成下一步。 */
  private showFlash(text: string, coins: number): void {
    this.flash = { text, coins };
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      this.flash = null;
      this.shownGoal = '';
      this.renderPill();
    }, FLASH_MS);
    this.renderPill();
    if (coins > 0) this.cheer?.(this.pill.getBoundingClientRect(), coins);
  }

  /**
   * 老闆的一句提醒：畫面左下角一張小卡，不擋缸，點 ✕ 或過一陣子自己收；也進通知匣。
   * why：完整的說明（design/tutorial-lines.md §4）。小卡先只放一行，點「為什麼？」才展開；通知匣存完整的那段。
   */
  showTip(text: string, why?: string): void {
    const strip = (t: string) => t.replace(new RegExp(`^${OWNER_NAME}[：:]\\s*`), '');
    const body = strip(text);
    this.note?.(`${OWNER_NAME}：${why ? strip(why) : body}`);
    const close = () => {
      window.clearTimeout(this.tipTimer);
      this.tip.classList.remove('open');
    };
    const line = h('p.tip-text', {}, body);
    const expand = () => {
      line.textContent = strip(why ?? text);
      this.tip.classList.add('why');
      whyBtn.remove();
      // 展開了在讀：重新計時，不要讀到一半就收掉
      window.clearTimeout(this.tipTimer);
      this.tipTimer = window.setTimeout(close, TIP_MS);
    };
    const whyBtn = h('button.tip-why', { onclick: expand }, '為什麼？');
    this.tip.classList.remove('why');
    this.tip.replaceChildren(ownerPortrait('tip-avatar', ownerMood(why ?? body)), h('div.tip-body', {}, line, why ? whyBtn : ''), h('button.tip-close', { 'aria-label': '收起', onclick: close }, '✕'));
    this.tip.classList.add('open');
    window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(close, TIP_MS);
  }

  /** 開場：第一次玩的人直接看到第一個任務；任務已經做完（開缸挑完設備才開場）就不重講，下一次 update 直接說做完了。 */
  start(state?: TankState): void {
    if (this.progress.step !== 0 || this.progress.skipped) return;
    if (state && currentQuest(this.progress)?.check(state)) return;
    this.renderPill();
  }

  restart(): void {
    this.progress = newProgress();
    this.save();
    this.showQuest();
  }

  /** 商店該開哪一頁：照目前的任務（買水草的任務就開水草頁）。 */
  get shopTab(): QuestShopTab | null {
    return questShopTab(this.progress);
  }

  private showQuest(): void {
    if (!currentQuest(this.progress)) {
      this.say(this.goalPages('現在的目標：'));
      return;
    }
    this.say(this.questPages());
  }

  /** 接下來的 1～2 個目標，一頁說完。 */
  private goalPages(lead: string): Page[] {
    const goals = this.tanks.length > 0 ? nextGoals(this.tanks) : [];
    if (goals.length === 0) return [];
    // 有說明的目標（等養水：要等多久、怎麼加快）接著多說幾頁
    const intro = goals.flatMap((g) => g.intro ?? []);
    const pages: Page[] = [{ text: `${lead}${goals.map((g) => `「${g.title}」（${g.coins} 魚幣）`).join('、')}。`, label: intro.length ? '然後呢？' : '好，我來試試' }];
    intro.forEach((text, i) => pages.push({ text, label: i === intro.length - 1 ? '好，我來試試' : '然後呢？' }));
    return pages;
  }

  private questPages(): Page[] {
    const q = currentQuest(this.progress);
    if (!q) return [];
    return q.lines.map((text, i) => {
      const last = i === q.lines.length - 1;
      return { text, label: last ? '好，我來試試' : '然後呢？', shop: last ? q.shopTab : undefined };
    });
  }

  private say(pages: Page[], onDone?: () => void): void {
    this.pages = pages;
    this.onDone = onDone ?? null;
    this.renderBubble();
  }

  /** 收起對話框，打開商店的對應分頁。 */
  private goShop(tab: QuestShopTab): void {
    this.pages = [];
    this.renderBubble();
    this.openShop?.(tab);
  }

  private renderBubble(): void {
    const page = this.pages[0];
    if (!page) {
      this.bubble.classList.remove('open');
      this.onDone?.();
      this.renderPill();
      kickOwnerQueue();
      return;
    }
    // 老闆的問句或提醒開著：一次只出一個對話框（G9），等它收起來再出（onOwnerAskClosed）
    if (ownerAskOpen()) return;
    // 阿德老闆的插畫頭像；圖載不到就退回線條小人
    const avatar = h('div.owner-avatar.has-art', {}, ownerPortrait('owner-art', ownerMood(page.text)));
    const q = currentQuest(this.progress);
    const turnPage = () => {
      this.pages.shift();
      this.renderBubble();
    };
    const next = h('button.btn.small.primary', { onclick: turnPage }, page.label ?? '好');
    const skip =
      q && this.progress.step === 0
        ? h('button.btn.small', { onclick: () => this.skip() }, '跳過教學')
        : null;
    // 「帶我去商店」不是主要按鈕、也不放在最右邊：連點「下一步」的人不會不小心打開商店（畫面評測第 2 輪）
    const shop =
      page.shop && this.openShop
        ? h('button.btn.small.go-shop', { onclick: () => this.goShop(page.shop!) }, artImg('shop', 'btn-art'), '帶我去商店')
        : null;
    // 「去擺位置」：收起對話框進造景模式；下一個任務還在左上角的任務卡上，點了會再說一次
    const scape =
      page.scape && this.openScape
        ? h('button.btn.small.go-shop', { onclick: () => ((this.pages = []), this.renderBubble(), this.openScape?.()) }, artImg('scape', 'btn-art'), '去擺位置')
        : null;
    this.bubble.replaceChildren(
      avatar,
      h('div.owner-body', {}, h('div.owner-name', {}, OWNER_NAME), h('p.owner-text', {}, page.text), h('div.owner-actions', {}, skip, shop, scape, next)),
    );
    this.bubble.classList.add('open');
  }

  private skip(): void {
    this.progress.skipped = true;
    this.save();
    this.pages = [];
    this.renderBubble();
  }

  private renderPill(): void {
    if (this.flash) {
      const { text, coins } = this.flash;
      this.shownGoal = '';
      this.pill.classList.add('show', 'flash');
      this.pill.replaceChildren(
        ownerPortrait('quest-avatar', 'proud'),
        h('span.quest-step', {}, '做好了'),
        h('span.quest-title', { title: text }, `✓ ${text}`),
        ...(coins > 0 ? [h('span.quest-coins', {}, h('i.coin'), `+${coins}`)] : []),
      );
      this.renderTray();
      this.onLayout();
      return;
    }
    this.pill.classList.remove('flash');
    const q = currentQuest(this.progress);
    const goal = q || this.tanks.length === 0 ? undefined : nextGoals(this.tanks, 1)[0];
    this.pill.classList.toggle('show', q !== null || goal !== undefined);
    if (goal) {
      // 數得出來的目標顯示進度（#183：「養大 5 條」交單後看得出還差幾條）
      const p = goal.progress?.(this.tanks);
      const title = p ? `${goal.title}（${p[0]}/${p[1]}）` : goal.title;
      // 等養水這種數不出來的目標：標題下面一行進度（硝化菌幾成、上次測水的讀數）
      const detail = goal.detail?.(this.tanks) ?? '';
      // 下一步（U1）：照現在缸裡的狀況說具體要做什麼，點任務卡就帶過去
      this.step = nextStep(this.tanks);
      const key = goal.id + title + detail + (this.step?.text ?? '');
      if (this.shownGoal === key) return;
      this.shownGoal = key;
      this.pill.replaceChildren(
        ownerPortrait('quest-avatar'),
        h('span.quest-step', {}, '目標'),
        h('span.quest-title', { title }, title),
        detail ? h('span.quest-progress', {}, detail) : '',
        ...(this.step ? [h('span.quest-hint', {}, `下一步：${this.step.text} ›`)] : []),
      );
    } else {
      this.step = null;
      this.shownGoal = q || this.tanks.length === 0 ? '' : 'all-done';
    }
    if (q) {
      // 換任務時把上一個任務的進度清掉（遊戲性評測：任務 7 的卡上還寫著任務 6 的「硝化菌 100%」）
      this.shownProgress = '';
      this.progressEl.textContent = '';
      this.progressEl.hidden = true;
      this.meterEl.hidden = true;
      this.pill.replaceChildren(
        ownerPortrait('quest-avatar'),
        h('span.quest-step', {}, `任務 ${this.progress.step + 1}/${QUESTS.length}`),
        h('span.quest-title', { title: q.title }, q.short ?? q.title),
        h('span.quest-hint', {}, q.hint),
        this.progressEl,
        this.meterEl,
      );
    }
    this.renderTray();
    this.onLayout();
  }

  /** 任務卡上的進度（硝化菌 40% 之類），變了才改 DOM。 */
  private renderProgress(state: TankState): void {
    // 第一次拿到所有缸（開遊戲、讀檔）時把目標小卡補上；之後目標的「3/5」變了也更新（renderPill 沒變就不動 DOM）
    if (this.tutorialOver && (!this.shownGoal || !currentQuest(this.progress))) this.renderPill();
    const q = currentQuest(this.progress);
    const m = q?.meter?.(state);
    this.meterEl.hidden = m === undefined;
    if (m !== undefined) this.meterFill.style.width = `${Math.round(m * 100)}%`;
    const text = q?.progress?.(state) ?? '';
    if (text === this.shownProgress) return;
    this.shownProgress = text;
    this.progressEl.textContent = text;
    this.progressEl.hidden = !text;
    this.onLayout();
  }

  private save(): void {
    saveProgress(this.store, this.progress);
    this.renderPill();
  }
}

/** 下一步要點的按鈕（發光）；沒有對應按鈕的（育幼盒、選育…）點任務卡就好。 */
const NEXT_GLOW: Record<NextTarget, QuestTarget | null> = {
  feed: 'feed',
  test: 'test',
  orders: 'orders',
  sell: 'shop',
  shop_fish: 'shop',
  shop_gear: 'shop',
  shop_plants: 'shop',
  shop_tank: null,
  nursery: null,
  select: null,
  treat: null,
  mother: null,
  scape: null,
};

function goalDoneText(g: Goal): string {
  const prize = [`${g.coins} 魚幣`, ...(g.unlock ? [UNLOCK_LABELS[g.unlock]] : []), ...(g.gift ? ['一顆假期飼料錠'] : [])].join('，');
  return `目標達成：${g.title}！${g.done}（獎勵：${prize}）`;
}

/** 阿德老闆頭像（插畫）。 */
function ownerPortrait(cls = 'owner-art', mood: OwnerMood = 'calm'): HTMLElement {
  return ownerImg(cls, mood);
}
