import { markDaily, type TankState } from '../sim';
import { lineChart } from './charts';
import { h } from './dom';
import { describeEvent } from './labels';
import type { PanelContext } from './panels';
import { iconTabs } from './card-kit';
import { clockLabel } from './status';

/** 趨勢圖看最近幾天。 */
export const TREND_DAYS = 7;

const dayLabel = (hours: number) => clockLabel(hours).replace(/^第 \d+ 週・/, `第 ${Math.floor(hours / 24) + 1} 天・`);

/** 水質紀錄：溫度計的連續讀數，加上每次用測試劑量到的值。 */
function waterRecords(state: TankState): Node {
  const x1 = Math.max(state.hours, 24);
  const x0 = Math.max(0, x1 - TREND_DAYS * 24);
  const tests = state.testLog ?? (state.lastTest ? [state.lastTest] : []);
  const testPoints = (key: 'ammonia' | 'nitrite' | 'nitrate') => tests.map((t) => ({ x: t.hours, y: t.reading[key] }));
  const noTests = '這段期間還沒測過水。點「測試」用測試劑量一次，就會記在這裡。';
  const common = { xRange: [x0, x1] as [number, number], formatX: dayLabel };
  const fmt = (digits: number) => (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(digits));
  const recent = tests.filter((t) => t.hours >= x0).slice(-8).reverse();
  return h(
    'div.stack',
    {},
    h('p.hint', {}, `最近 ${TREND_DAYS} 天（下方數字是第幾天）。綠色底帶是安全範圍。`),
    h(
      'div.charts',
      {},
      lineChart({
        ...common,
        title: '水溫（°C）',
        unit: '°C',
        points: (state.tempLog ?? []).map((p) => ({ x: p.hours, y: p.tempC })),
        yMinSpan: 3,
        zeroBased: false,
        dots: false,
        formatY: fmt(1),
        empty: '溫度紀錄從下一個整點開始。',
      }),
      lineChart({ ...common, title: '氨（ppm）', unit: 'ppm', points: testPoints('ammonia'), yMinSpan: 1, zeroBased: true, band: [0, 0.1], dots: true, formatY: fmt(2), empty: noTests }),
      lineChart({ ...common, title: '亞硝酸鹽（ppm）', unit: 'ppm', points: testPoints('nitrite'), yMinSpan: 1, zeroBased: true, band: [0, 0.1], dots: true, formatY: fmt(2), empty: noTests }),
      lineChart({ ...common, title: '硝酸鹽（ppm）', unit: 'ppm', points: testPoints('nitrate'), yMinSpan: 40, zeroBased: true, band: [0, 20], dots: true, formatY: fmt(0), empty: noTests }),
    ),
    recent.length > 0
      ? h(
          'table.readings.log',
          {},
          h('tr', {}, h('th', {}, '時間'), h('th', {}, 'pH'), h('th', {}, '氨'), h('th', {}, '亞硝'), h('th', {}, '硝酸')),
          ...recent.map((t) =>
            h('tr', {}, h('td', {}, dayLabel(t.hours)), h('td.value', {}, String(t.reading.ph)), h('td.value', {}, String(t.reading.ammonia)), h('td.value', {}, String(t.reading.nitrite)), h('td.value', {}, String(t.reading.nitrate))),
          ),
        )
      : null,
  );
}

/** 事件紀錄：最近發生的事，新的在上面。 */
function eventLog(state: TankState): Node {
  const items = state.events
    .map((e) => ({ e, msg: describeEvent(state, e) }))
    .filter((x) => x.msg !== null)
    .reverse()
    .slice(0, 60);
  if (items.length === 0) return h('p.hint', {}, '還沒有發生什麼特別的事。魚出生、死亡、生病、設備故障都會記在這裡。');
  return h(
    'div.event-log',
    {},
    ...items.map(({ e, msg }) => h(`div.event.${msg!.tone}`, {}, h('span.event-time', {}, dayLabel(e.hours)), h('span.event-text', {}, msg!.text))),
  );
}

export function recordsPanel(ctx: PanelContext, tab: 'water' | 'events' = 'water'): Node {
  const { game, sheet } = ctx;
  // 每日小事「看一次水質趨勢」
  markDaily(game.tanks, 'records');
  const tabs = iconTabs(
    [
      { id: 'water' as const, label: '水質趨勢', icon: 'testkit' as const },
      { id: 'events' as const, label: '事件紀錄', icon: 'records' as const },
    ],
    tab,
    (t) => sheet.open('紀錄', () => recordsPanel(ctx, t)),
  );
  return h('div.stack', {}, tabs, tab === 'water' ? waterRecords(game.state) : eventLog(game.state));
}
