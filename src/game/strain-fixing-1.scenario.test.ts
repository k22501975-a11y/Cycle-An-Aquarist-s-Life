import { describe, it } from 'vitest';
import { strainSeed } from './strain-fixing-check';

/** 固定品系 300 天劇本，種子 1（驗收條件見 strain-fixing-check.ts）。 */
describe('固定品系 300 天劇本（strain-fixing.md §7、§10）', () => {
  it('種子 1', () => strainSeed(1), 1_200_000);
});
