import { describe, expect, it } from 'vitest';
import { newGameState } from '../game/game';
import { addFish, addFishToQuarantine, buyQuarantine, ICH_CALM_DAYS, ichTrigger } from '.';
import { updateFauna } from './processes/fauna';

describe('白點治好後 14 天內同一缸不再發（polish-to-9.md §11）', () => {
  it('一波斷根就開始抵抗期：期間溫差不算誘因；檢疫盒的新魚不取消，直接放進缸的新魚會取消', () => {
    const s = newGameState(1);
    addFish(s, 'guppy', { carriesIch: false, carries: [] });
    // 一天內水溫差 4 度：本來是誘因
    const swing = () => (s.tempLog = [{ hours: s.hours - 10, tempC: s.water.tempC - 4 }]);
    swing();
    expect(ichTrigger(s)).toBe('temp_swing');
    // 上一波的蟲死光了、魚身上也沒有：斷根
    s.water.ichCause = 'temp_swing';
    s.water.ichPathogen = 0;
    s.water.ichCysts = 0;
    updateFauna(s, 1);
    expect(s.water.ichCause).toBeUndefined();
    expect(s.ichCalmUntil).toBe(s.hours + ICH_CALM_DAYS * 24);
    expect(ichTrigger(s)).toBeNull();
    // 檢疫盒的新魚不算
    buyQuarantine(s);
    addFishToQuarantine(s, 'guppy', { carriesIch: false, carries: [] });
    expect(ichTrigger(s)).toBeNull();
    // 過了 14 天恢復
    s.hours += ICH_CALM_DAYS * 24;
    swing();
    expect(ichTrigger(s)).toBe('temp_swing');
    s.hours -= ICH_CALM_DAYS * 24;
    swing();
    // 沒檢疫直接放進缸：抵抗期取消
    delete s.quarantine;
    addFish(s, 'guppy', { carriesIch: false, carries: [] });
    expect(s.ichCalmUntil).toBeUndefined();
    expect(ichTrigger(s)).toBe('temp_swing');
  });
});
