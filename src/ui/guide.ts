import type { SoundId } from '../audio/sounds';
import type { KeyValueStore } from '../game/save';
import type { TankState } from '../sim';
import { h } from './dom';
import { artImg, ownerImg } from './art-icons';
import { advanceQuest, currentQuest, loadProgress, newProgress, OWNER_NAME, pendingTip, QUESTS, questShopTab, saveProgress, type QuestShopTab, type TutorialProgress } from './tutorial';

interface Page {
  text: string;
  label?: string;
  /** 這一頁多一顆「帶我去商店」，直接開在任務要買的那一頁。 */
  shop?: QuestShopTab;
}

/**
 * 新手引導的介面：左上角的任務小卡，以及老闆說話的對話框。
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
    return currentQuest(this.progress) !== null;
  }

  /** 每半秒檢查一次：任務完成了沒、有沒有該提醒的狀況。對話框開著時先不打斷。 */
  update(state: TankState): void {
    this.renderProgress(state);
    if (this.bubble.classList.contains('open')) return;
    const done = advanceQuest(this.progress, state);
    if (done) {
      this.save();
      this.questDone?.(this.progress.step, done.id);
      this.sound('quest');
      const next = currentQuest(this.progress);
      this.say([{ text: done.done, label: next ? '下一個任務' : '謝謝老闆' }, ...(next ? this.questPages() : [])]);
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
    if (!currentQuest(this.progress)) return;
    this.say(this.questPages());
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
    this.bubble.replaceChildren(
      avatar,
      h('div.owner-body', {}, h('div.owner-name', {}, OWNER_NAME), h('p.owner-text', {}, page.text), h('div.owner-actions', {}, skip, shop, next)),
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
    this.pill.classList.toggle('show', q !== null);
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

/** 阿德老闆頭像（插畫）。 */
function ownerPortrait(cls = 'owner-art'): HTMLElement {
  return ownerImg(cls);
}
