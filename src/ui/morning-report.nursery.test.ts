import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, ADULT_SIZE, bacteriaCapacity, buyTank, cross, DREAM_FISH, economy, FISH_SPECIES, linkTanks, setTankPurpose } from '../sim';
import { BOX_DUE, choiceState } from '../sim/choices';
import { morningReport, snapshot } from './morning-report';

const calm = { carriesIch: false, carries: [] };
const ADULT_CM = FISH_SPECIES.guppy.adultLengthCm * ADULT_SIZE;

/** 開獎過了、留種那對在繁殖缸（那缸沒有育幼盒），C15 選了育幼盒。 */
function latePair() {
  const s = newGameState(7);
  const tanks = [s];
  linkTanks(tanks);
  economy(s).coins = 5000;
  const t2 = buyTank(tanks, 'nano20')!;
  setTankPurpose(t2, 'breeding');
  for (const t of tanks) t.bacteria.aob = t.bacteria.nob = bacteriaCapacity(t);
  const storeMom = addFish(s, 'guppy', { ...calm, sex: 'female', strain: DREAM_FISH.parents.female, pregnant: false });
  const dad = addFish(t2, 'guppy', { ...calm, sex: 'male', strain: DREAM_FISH.parents.male, pregnant: false });
  const mom = addFish(t2, 'guppy', { ...calm, sex: 'female', pregnant: false });
  mom.genome = cross({ seed: 5 }, storeMom.genome!, dad.genome!, 'female');
  mom.generation = 1;
  mom.motherId = storeMom.id;
  mom.bornHours = s.hours - 40 * 24;
  mom.lengthCm = ADULT_CM + 0.2;
  mom.keeper = dad.keeper = true;
  const st = choiceState(tanks);
  Object.assign(st.picked, { C1: 'box', C2: 'pick', C3: 'breeding', C4: String(dad.id), C5: 'keep', C6: 'move', C7: 'standard', C8: 'media', C9: 'keep' });
  st.firstBrood = s.hours - 40 * 24;
  st.pair = [mom.id, dad.id];
  st.shown = { C4: s.hours - 20 * 24 };
  return { s, t2, tanks, st, mom, dad };
}

describe('早上報告：品系那窩自動買育幼盒', () => {
  it('開獎後留種那對又快生了、那缸沒育幼盒：自己買一個、把母魚放進去，當天早上報告說花了多少（#362）', () => {
    const { tanks, t2, s, st, mom, dad } = latePair();
    Object.assign(st.picked, { C11: 'split', C12: 'one', C13: 'standard', C15: 'box', C16: 'cull' });
    st.reveal = { momId: mom.id, hours: s.hours - 45 * 24, done: true, born: 10, box: true };
    st.revealCullAsked = true;
    mom.pregnancy = BOX_DUE;
    mom.sire = { genome: dad.genome!, lineage: dad.lineage ?? dad.id, inbreeding: 0, id: dad.id };
    expect(t2.nurseryBox).toBeFalsy();
    const before = snapshot(tanks);
    const coins = economy(s).coins;
    const report = morningReport(before, tanks, 8, null);
    expect(t2.nurseryBox).toBe(true);
    expect(mom.nursery).toBe(true);
    expect(economy(s).coins).toBe(coins - 150);
    expect(report.items).toContainEqual(expect.objectContaining({ kind: 'nursery', tank: 1, text: '繁殖缸：留種的母魚快生了，花 150 元買了一個育幼盒，已經把她放進去，小魚才不會被吃' }));
    // 隔天不再說一次
    tanks[0].hours += 24;
    expect(morningReport(snapshot(tanks), tanks, 8, null).items.filter((i) => i.text.includes('買了一個育幼盒'))).toEqual([]);
  });

});
