// 主程式用到才載入的介面（main.ts 的 loadDeferred）：各種面板、紀錄、圖鑑、早上報告。
// 開機後閒下來就先在背景載好，之後打開都是同步的；拆出來是為了主程式 gzip 300 KB 的上限（scripts/check-assets.mjs）
import { breedingStep } from '../sim/choices';
import { setBreedingStep } from '../sim/next-step';

export * from './panels';
export { recordsPanel } from './records';
export { ordersPanel } from './orders-panel';
export { ScapeBar } from './scape-bar';
export { codexPanel } from './codex-panel';
export { unlockCodex } from './codex';
export { morningCard } from './morning-card';
export { feederOffer } from './feeder-offer';
export { awayReport, morningReport, slimReport, snapshot } from './morning-report';
// 中期選擇點（sim/choices.ts）也跟著延後載入：早上報告的選擇卡用 chooseOption，任務卡的選育那一行載好才說
export { chooseOption, cycleCard, lineName } from '../sim/choices';
export { choiceVisual } from './choice-card';
setBreedingStep(breedingStep);
export { setupPanel } from './setup-panel';
export { flyCoins, rewardBurst } from './coin-fly';
