import type { SimEventType } from '../sim';

/** 遊戲裡所有的音效。 */
export type SoundId =
  | 'tap'
  | 'open'
  | 'feed'
  | 'water'
  | 'test'
  | 'trim'
  | 'buy'
  | 'net'
  | 'birth'
  | 'death'
  | 'alarm'
  | 'warn'
  | 'restore'
  | 'quest'
  | 'fanfare';

/** 模擬事件對應的音效：嚴重的用警報，好事用輕快的和弦。 */
export function eventSound(type: SimEventType): SoundId {
  switch (type) {
    case 'fry_born':
      return 'birth';
    case 'fish_died':
      return 'death';
    case 'heater_stuck':
    case 'power_out':
      return 'alarm';
    case 'power_restored':
      return 'restore';
    case 'power_bill':
      return 'buy';
    case 'heater_exposed':
      return 'alarm';
    case 'controller_cut':
    case 'heater_broke':
    case 'ich_visible':
    case 'disease_visible':
    case 'plant_died':
    case 'snail_died':
    case 'trap_rotted':
    case 'betta_fight':
    case 'betta_ate_shrimp':
    case 'betta_chase_female':
    case 'fry_eaten':
      return 'warn';
    case 'snail_eggs':
    case 'snail_hatched':
    case 'brood_laid':
      return 'birth';
    case 'brood_eaten':
      return 'warn';
    case 'brood_left':
    case 'nursery_gift':
    case 'nursery_released':
    case 'pests_seen':
      return 'quest';
  }
}

/** 同一種音效多久內只響一次（毫秒）：離線補算一次跑出很多事件時不會吵成一團。 */
export const SOUND_COOLDOWN_MS: Partial<Record<SoundId, number>> = {
  birth: 1500,
  death: 1500,
  alarm: 4000,
  warn: 1500,
  restore: 1500,
  fanfare: 3000,
};

export class Throttle {
  private last = new Map<string, number>();
  allow(id: string, now: number, cooldownMs: number): boolean {
    const prev = this.last.get(id);
    if (prev !== undefined && now - prev < cooldownMs) return false;
    this.last.set(id, now);
    return true;
  }
}
