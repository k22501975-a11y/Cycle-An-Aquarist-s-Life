import { describe, expect, it } from 'vitest';
import { addEcho } from '../sim/choice-echo';
import { choiceState } from '../sim/choices';
import { addFish, createTank, FILTERS, HEATERS, LIGHTS, TANKS, type TankState } from '../sim';
import { ECHO_RETRIES, morningReport, slimReport, snapshot } from './morning-report';

/** 養好水、一公一母孔雀魚的缸。 */
function tank(): TankState {
  const s = createTank({ tank: TANKS.std40, filter: FILTERS.hangOn, heater: { spec: HEATERS.h50, targetC: 25 }, light: { spec: LIGHTS.basic }, roomTempC: 24, seed: 21, matureMedia: true });
  s.hours = 20;
  for (const sex of ['male', 'female'] as const) addFish(s, 'guppy', { carriesIch: false, carries: [], sex, pregnant: false }).ageDays = 120;
  return s;
}

const shownEchoes = (s: TankState) => slimReport(morningReport(snapshot([s]), [s], 12, null)).lines.filter((i) => i.kind === 'echo').map((i) => i.text);

describe('擠不進報告的回音隔天早上再出（#452，polish-to-9.md §10.0 選完 3 天內一定要看得到）', () => {
  it('這天放不下的回音留到隔天；最多延後 ECHO_RETRIES 次', () => {
    const s = tank();
    const st = choiceState([s]);
    for (const n of [0, 1, 2, 3]) addEcho(st, { label: `選項${n}`, tank: 0, due: s.hours, text: `回音${n}` });
    expect(shownEchoes(s)).toEqual(['回音0', '回音1', '回音2']);
    expect(st.echoes).toEqual([{ label: '選項3', tank: 0, due: s.hours, text: '回音3', retry: 1 }]);
    s.hours += 24;
    expect(shownEchoes(s)).toEqual(['回音3']);
    expect(st.echoes).toEqual([]);
    // 已經延後滿 ECHO_RETRIES 次的，還是放不下就收進鈴鐺，不再排
    for (const n of [0, 1, 2]) addEcho(st, { label: `選項${n}`, tank: 0, due: s.hours, text: `新${n}` });
    addEcho(st, { label: '舊的', tank: 0, due: s.hours, text: '舊回音', retry: ECHO_RETRIES });
    expect(shownEchoes(s)).toEqual(['新0', '新1', '新2']);
    expect(st.echoes).toEqual([]);
  });
});
