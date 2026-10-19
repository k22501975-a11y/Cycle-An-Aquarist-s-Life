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
  private shownProgress = '';
  private readonly bubble = h('div.owner.glass');
  private progress: TutorialProgress;
  private pages: Page[] = [];
  private onDone: (() => void) | null = null;
  /** 完成任務時通知（匿名數據分析用來看新手卡在哪一步）。 */
  questDone: ((step: number) => void) | null = null;
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
    host.append(this.pill, this.bubble);
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
      this.questDone?.(this.progress.step);
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
    const next = h('button.btn.small.primary', { onclick: () => (this.pages.shift(), this.renderBubble()) }, page.label ?? '好');
    const skip =
      q && this.progress.step === 0
        ? h('button.btn.small', { onclick: () => this.skip() }, '跳過教學')
        : null;
    const shop =
      page.shop && this.openShop
        ? h('button.btn.small.primary.go-shop', { onclick: () => (this.pages = [], this.renderBubble(), this.openShop!(page.shop!)) }, artImg('shop', 'btn-art'), '帶我去商店')
        : null;
    if (shop) next.classList.remove('primary');
    this.bubble.replaceChildren(
      avatar,
      h('div.owner-body', {}, h('div.owner-name', {}, OWNER_NAME), h('p.owner-text', {}, page.text), h('div.owner-actions', {}, skip, next, shop)),
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
      this.shownProgress = '';
      this.pill.replaceChildren(
        ownerPortrait('quest-avatar'),
        h('span.quest-step', {}, `任務 ${this.progress.step + 1}/${QUESTS.length}`),
        h('span.quest-title', {}, q.title),
        this.progressEl,
        q.hint ? h('span.quest-hint', {}, q.hint) : '',
      );
    }
    this.onLayout();
  }

  /** 任務卡上的進度（硝酸鹽 0／5 之類），變了才改 DOM。 */
  private renderProgress(state: TankState): void {
    const text = currentQuest(this.progress)?.progress?.(state) ?? '';
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
