// 測試裡任務卡的選育那一行照常算：app 裡由 ui/deferred-ui.ts 延後載入時登記（sim/next-step.ts 的 setBreedingStep）
import { breedingStep } from './sim/choices';
import { setBreedingStep } from './sim/next-step';

setBreedingStep(breedingStep);
