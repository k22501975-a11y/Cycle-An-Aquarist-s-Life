import { temperatureFactor } from '../chemistry';
import { chance } from '../random';
import { FISH_SPECIES } from '../species';
import { recordEvent, type DiseaseKind, type Fish, type TankState } from '../state';
import { immunity } from './fauna';

/**
 * 白點以外的魚病（expeditions-and-quarantine.md §1.2）。
 * 潛伏期看不出來，發病後才有症狀；會傳染給同缸的魚。白點病的生活史比較特別，另外在 fauna.ts 處理。
 */

export interface DiseaseSpec {
  /** 潛伏期（25°C 下的小時數，越熱越短）。 */
  latentHours: number;
  /** 發病後每小時造成的健康損失（25°C）。 */
  damagePerHour: number;
  /** 高溫加劇的程度：傷害乘上 溫度係數^heatPower。 */
  heatPower: number;
  /** 每條發病的魚每小時傳染給一條健康魚的基礎機率。 */
  contagionPerHour: number;
  /** 哪一種藥有效。 */
  cure: 'antibiotic' | 'dewormer';
  /** 加壓力（例如鰓吸蟲讓魚呼吸困難）。 */
  stress: number;
}

export const DISEASE_SPECS: Record<DiseaseKind, DiseaseSpec> = {
  // 柱狀病：細菌性急病，潛伏短、發病快、高溫更兇，一兩天就能死一缸
  columnaris: { latentHours: 12, damagePerHour: 0.025, heatPower: 2, contagionPerHour: 0.03, cure: 'antibiotic', stress: 0.4 },
  // 鰓吸蟲：慢性寄生蟲，浮頭、鰓蓋張開，很容易誤以為是缺氧
  flukes: { latentHours: 48, damagePerHour: 0.0015, heatPower: 1, contagionPerHour: 0.004, cure: 'dewormer', stress: 0.35 },
};

/** 店家魚帶這些病的機率（NPC 水族館合計約 5%）。 */
export const STORE_DISEASE_CHANCE: Record<DiseaseKind, number> = { columnaris: 0.02, flukes: 0.03 };

/** 藥效：濃度 1（一份藥）時每小時治好多少進度。 */
const CURE_PER_HOUR = 0.04;

/** 這條魚會不會得這些病（蝦不會得魚病）。 */
export function canCatch(fish: Fish): boolean {
  return !FISH_SPECIES[fish.species].invertebrate;
}

export function hasVisible(fish: Fish, kind?: DiseaseKind): boolean {
  return (fish.infections ?? []).some((i) => i.stage === 'visible' && (kind === undefined || i.kind === kind));
}

export function infect(fish: Fish, kind: DiseaseKind): void {
  if (!canCatch(fish)) return;
  const list = (fish.infections ??= []);
  if (!list.some((i) => i.kind === kind)) list.push({ kind, stage: 'latent', progress: 0 });
}

export interface Meds {
  antibiotic: number;
  dewormer: number;
}

/**
 * 推進一條魚身上的病：潛伏 → 發病 → 傷害；有藥就慢慢治好。
 * 回傳這一步的傷害（每小時），由呼叫端扣血並記死因。
 */
export function progressInfections(state: TankState, fish: Fish, tempC: number, meds: Meds, dt: number): { amount: number; cause: DiseaseKind }[] {
  const list = fish.infections;
  if (!list || list.length === 0) return [];
  const tf = temperatureFactor(tempC);
  const damage: { amount: number; cause: DiseaseKind }[] = [];
  for (const inf of list) {
    const spec = DISEASE_SPECS[inf.kind];
    const dose = meds[spec.cure];
    if (dose > 0.05) {
      // 用對藥：潛伏的直接被清掉，發病的慢慢好起來
      inf.progress -= CURE_PER_HOUR * Math.min(2, dose) * dt;
      if (inf.stage === 'latent' || inf.progress <= 0) inf.progress = -1;
    }
    if (inf.progress < 0) continue;
    if (inf.stage === 'latent') {
      inf.progress += (dt / spec.latentHours) * tf;
      if (inf.progress >= 1) {
        inf.stage = 'visible';
        inf.progress = 1;
        recordEvent(state, { type: 'disease_visible', subjectId: fish.id, cause: inf.kind });
      }
    } else {
      const resist = 1 - 0.4 * immunity(fish, FISH_SPECIES[fish.species]);
      damage.push({ amount: spec.damagePerHour * Math.pow(tf, spec.heatPower) * resist, cause: inf.kind });
    }
  }
  fish.infections = list.filter((i) => i.progress >= 0);
  return damage;
}

/** 發病的魚會把病傳給同一缸的其他魚；越緊迫、抵抗力越差越容易被傳染。 */
export function spreadInfections(state: TankState, fish: Fish[], dt: number, scale = 1): void {
  for (const kind of Object.keys(DISEASE_SPECS) as DiseaseKind[]) {
    const sick = fish.filter((f) => f.alive && hasVisible(f, kind)).length;
    if (sick === 0) continue;
    const spec = DISEASE_SPECS[kind];
    for (const f of fish) {
      if (!f.alive || !canCatch(f) || f.infections?.some((i) => i.kind === kind)) continue;
      const risk = spec.contagionPerHour * sick * scale * Math.pow(1 - immunity(f, FISH_SPECIES[f.species]), 2) * 4;
      if (chance(state.rng, risk, dt)) infect(f, kind);
    }
  }
}

/** 病帶來的壓力（加進 computeStressors）。 */
export function diseaseStress(fish: Fish): number {
  return (fish.infections ?? []).reduce((max, i) => (i.stage === 'visible' ? Math.max(max, DISEASE_SPECS[i.kind].stress) : max), 0);
}
