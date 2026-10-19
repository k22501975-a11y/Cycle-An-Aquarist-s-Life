import type { KeyValueStore } from '../game/save';
import { growthStage, guppyRarity, phenotype, sexVisible, strainName, type Fish, type GuppyRarity, type TankState } from '../sim';

/**
 * 選育成功的演出（MVP M19／M20）：自家繁殖的公魚第一次長出一個沒見過的品系（看得出花紋和鰭型），跳慶祝卡。
 * 每個品系名只慶祝一次，記在這台裝置上。普通的野生型、混種不算。
 */
export const STRAINS_KEY = 'cycle.strains.v1';

export interface StrainFind {
  tank: number;
  fish: Fish;
  name: string;
  rarity: GuppyRarity;
}

/** 這條魚現在看得出完整品系（自家繁殖、公魚、轉色完成、亞成以上）。 */
function showsStrain(fish: Fish): boolean {
  if (!fish.alive || fish.species !== 'guppy' || !fish.genome || fish.sex !== 'male' || !fish.generation) return false;
  const stage = growthStage(fish);
  return sexVisible(fish) && (stage === 'subadult' || stage === 'adult' || stage === 'old');
}

const RANK: Record<GuppyRarity, number> = { common: 0, strain: 1, rare: 2, prized: 3 };

function load(store: KeyValueStore): Set<string> | null {
  try {
    const raw = store.getItem(STRAINS_KEY);
    if (raw === null) return null;
    const list: unknown = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/**
 * 記得已經慶祝過哪些品系：開遊戲時從裝置讀一次，之後存在記憶體（每半秒檢查一次，不每次讀 localStorage），有新品系才寫回。
 */
export class StrainTracker {
  /** null：這台裝置還沒有紀錄（舊存檔剛更新）。 */
  private seen: Set<string> | null;

  constructor(private readonly store: KeyValueStore) {
    this.seen = load(store);
  }

  /**
   * 找出這次新出現的品系（同一個品系只回傳最稀有、最大的那條）。
   * 第一次執行（舊存檔剛更新）只把現有的品系記下來，不補放演出，免得一開遊戲連跳好幾張卡。
   */
  check(tanks: TankState[]): StrainFind[] {
    const found = new Map<string, StrainFind>();
    tanks.forEach((t, tank) => {
      for (const fish of t.fish) {
        if (!showsStrain(fish)) continue;
        const p = phenotype(fish.genome!);
        const rarity = guppyRarity(p);
        if (rarity === 'common') continue;
        const name = strainName(p);
        const prev = found.get(name);
        if (!prev || RANK[rarity] > RANK[prev.rarity] || (rarity === prev.rarity && fish.lengthCm > prev.fish.lengthCm)) found.set(name, { tank, fish, name, rarity });
      }
    });
    const seen = this.seen;
    const fresh = seen ? [...found.values()].filter((f) => !seen.has(f.name)) : [];
    if (!seen || fresh.length) {
      this.seen = new Set([...(seen ?? []), ...found.keys()]);
      try {
        this.store.setItem(STRAINS_KEY, JSON.stringify([...this.seen]));
      } catch {
        // 存不了（無痕模式）就只記在這次遊戲裡
      }
    }
    return fresh.sort((a, b) => RANK[b.rarity] - RANK[a.rarity]);
  }
}

/** 阿德老闆對新品系說的話。 */
export function strainOwnerLine(rarity: GuppyRarity): string {
  if (rarity === 'prized') return '這條是極品！留著當種公，配同品系的母魚，下一代會更穩。店家收購價是普通魚的好幾倍。';
  if (rarity === 'rare') return '選出稀有品系了！收購價比普通魚高很多，先留幾條當種魚，別一次全賣掉。';
  return '品系出來了！繼續挑尾巴大、顏色亮的配對，有機會選出更稀有的。';
}
