import type { SoundId } from '../audio/sounds';
import type { KeyValueStore } from '../game/save';
import { checkGoals, nextGoals, UNLOCK_LABELS, type Goal, type TankState } from '../sim';
import { h } from './dom';
import { artImg, ownerImg } from './art-icons';
import { advanceQuest, currentQuest, loadProgress, newProgress, OWNER_NAME, pendingTip, QUESTS, questShopTab, saveProgress, type QuestShopTab, type TutorialProgress } from './tutorial';

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
    this.pill.addEventListener('click', () => this.showQuest());
    // 對話框掛在 body：面板（商店等）開著時也在最上層，按鈕按得到
    host.append(this.pill);
    document.body.append(this.bubble);
    this.renderPill();
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
    if (this.bubble.classList.contains('open')) return;
    const done = advanceQuest(this.progress, state);
    if (done) {
      this.save();
      this.questDone?.(this.progress.step, done.id);
      const paid = this.reward?.(done.id, done.reward) ?? 0;
      this.sound('quest');
      const next = currentQuest(this.progress);
      const text = paid > 0 ? `${done.done}（獎勵 ${paid} 魚幣）` : done.done;
      this.say([{ text, label: next ? '下一個任務' : '謝謝老闆', scape: done.doneScape }, ...(next ? this.questPages() : this.goalPages('接下來可以挑戰這些目標：'))]);
      return;
    }
    const goals = checkGoals(tanks, this.tutorialOver);
    if (goals.length > 0) {
      this.goalsChanged?.();
      this.sound('quest');
      this.say([...goals.map((g) => ({ text: goalDoneText(g), label: '太好了' })), ...this.goalPages('下一個目標：')]);
      this.renderPill();
      return;
    }
    const tip = pendingTip(this.progress, state);
    if (tip) {
      this.progress.seenTips.push(tip.id);
      this.save();
      this.sound('open');
      this.say([{ text: tip.text, label: '知道了' }]);
    }
  }

  /** 開場：第一次玩的人直接看到第一個任務。 */
  start(): void {
    if (this.progress.step === 0 && !this.progress.skipped) this.showQuest();
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
    return [{ text: `${lead}${goals.map((g) => `「${g.title}」（${g.coins} 魚幣）`).join('、')}。`, label: '好，我來試試' }];
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
      return;
    }
    // 阿德老闆的插畫頭像；圖載不到就退回線條小人
    const avatar = h('div.owner-avatar.has-art', {}, ownerPortrait());
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
    const q = currentQuest(this.progress);
    const goal = q || this.tanks.length === 0 ? undefined : nextGoals(this.tanks, 1)[0];
    this.pill.classList.toggle('show', q !== null || goal !== undefined);
    if (goal) {
      if (this.shownGoal === goal.id) return;
      this.shownGoal = goal.id;
      this.pill.replaceChildren(ownerPortrait('quest-avatar'), h('span.quest-step', {}, '目標'), h('span.quest-title', { title: goal.title }, goal.title));
    } else this.shownGoal = q || this.tanks.length === 0 ? '' : 'all-done';
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
        this.progressEl,
        this.meterEl,
      );
    }
    this.onLayout();
  }

  /** 任務卡上的進度（硝化菌 40% 之類），變了才改 DOM。 */
  private renderProgress(state: TankState): void {
    // 第一次拿到所有缸（開遊戲、讀檔）時把目標小卡補上
    if (this.tutorialOver && !this.shownGoal) this.renderPill();
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

function goalDoneText(g: Goal): string {
  const prize = [`${g.coins} 魚幣`, ...(g.unlock ? [UNLOCK_LABELS[g.unlock]] : []), ...(g.gift ? ['一顆假期飼料錠'] : [])].join('，');
  return `目標達成：${g.title}！${g.done}（獎勵：${prize}）`;
}

/** 阿德老闆頭像（插畫）。 */
function ownerPortrait(cls = 'owner-art'): HTMLElement {
  return ownerImg(cls);
}
