// 測試裡任務卡的選育那一行照常算：app 裡由 ui/deferred-ui.ts 延後載入時登記（sim/next-step.ts 的 setBreedingStep）
import { vi } from 'vitest';
import { breedingStep } from './sim/choices';
import { setBreedingStep } from './sim/next-step';

setBreedingStep(breedingStep);

// 室溫照現實日期算（game.ts 的 applySeason 預設 new Date()）：測試一律固定在十月中台灣中午，
// 不然跨月、甚至跨午夜室溫差一點，劇本就整批翻紅（#410：11/05 紅 4 項、ich-treat seed 3 跨午夜就紅）。
// 只假 Date（照真實時間往前走，量耗時的照常），setTimeout 等計時器不動；要測別的季節就在測試裡自己 vi.setSystemTime 或把日期傳進 applySeason。
vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T12:00:00+08:00'), shouldAdvanceTime: true });
