import type { AudioSettings } from '../audio/settings';
import { FEATURES } from '../features';
import type { Analytics } from '../net/analytics';
import type { CloudClient } from '../net/cloud';
import { CATEGORY_LABELS, type Notifier } from '../net/push';
import { QUALITY_LABELS, type Quality } from '../render/quality';
import { h } from './dom';
import { isNativeApp } from './native';
import { canPromptInstall, isInstalled, isIos, promptInstall } from './pwa';
import type { Sheet, Toasts } from './sheet';

/** 設定頁要用到的主程式狀態和動作（main.ts 給）。 */
export interface SettingsDeps {
  sheet: Sheet;
  toasts: Toasts;
  cloud: CloudClient;
  notifier: Notifier;
  analytics: Analytics;
  audio: () => AudioSettings;
  updateAudio: (patch: Partial<AudioSettings>) => void;
  ui: { bigText: boolean; quality: Quality; qualityManual: boolean; showFps: boolean };
  setBigText: (on: boolean) => void;
  setQuality: (q: Quality) => void;
  setShowFps: (on: boolean) => void;
  exportSave: () => void;
  importSave: () => void;
  openCloud: () => void;
  openDebug: () => void;
  refreshForecast: () => Promise<void>;
  /** 在設定裡改了要不要回報：把主畫面那張詢問卡收掉。 */
  consentAnswered: () => void;
}

function notifySection(d: SettingsDeps): Node[] {
  const { notifier, cloud, toasts } = d;
  if (!notifier.available)
    return [h('p.hint', {}, isIos() && !isInstalled() ? 'iPhone 要先把遊戲加到主畫面，才收得到通知。' : cloud.available ? '這個瀏覽器收不到通知。' : '這個版本的通知只有 Android App 版收得到。')];
  const reopen = () => d.sheet.open('設定', () => settingsPanel(d));
  const p = notifier.prefs;
  return [
    h('p.hint', {}, '關掉遊戲後，水缸照樣在跑。開啟通知後，遊戲會先預測接下來會發生什麼，出事前提醒你。'),
    p.enabled
      ? h('button.btn', { onclick: async () => (await notifier.disable(), toasts.show('關掉通知了'), reopen()) }, '關閉通知')
      : h('button.btn.primary', {
          onclick: async () => {
            const err = await notifier.enable();
            if (err) toasts.show(err, 'warn');
            else {
              toasts.show('開啟通知了');
              void d.refreshForecast();
            }
            reopen();
          },
        }, '開啟通知'),
    ...(p.enabled
      ? (Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((c) =>
          h('label.check-row', {}, h('input', { type: 'checkbox', checked: p.categories[c], onchange: (e: Event) => void notifier.setCategory(c, (e.target as HTMLInputElement).checked) }), h('span', {}, CATEGORY_LABELS[c])),
        )
      : []),
    ...(p.enabled && notifier.platform?.kind === 'web' && cloud.available && !cloud.session ? [h('p.hint', {}, '市場和好友的通知要登入雲端存檔才收得到。')] : []),
    ...(p.enabled && notifier.platform?.kind === 'native' && cloud.available ? [h('p.hint', {}, 'App 版目前收得到水缸的提醒和到貨通知；有人買了你的東西、好友送禮，要打開遊戲才看得到。')] : []),
  ];
}

function privacySection(d: SettingsDeps): Node[] {
  const { analytics } = d;
  return [
    analytics.available
      ? h(
          'label.check-row',
          {},
          h('input', {
            type: 'checkbox',
            checked: analytics.consent === true,
            onchange: (e: Event) => {
              analytics.setConsent((e.target as HTMLInputElement).checked);
              d.consentAnswered();
            },
          }),
          h('span', {}, '幫忙改進遊戲：回報匿名的遊戲紀錄'),
        )
      : null,
    h(
      'p.hint',
      {},
      analytics.available
        ? '只回報像「魚因為氨中毒死掉」「完成教學第 3 步」這類事件，用隨機代號、不連到帳號，180 天後刪除。'
        : '存檔只放在這台裝置上，不會傳到任何地方。',
    ),
    h(
      'div.row',
      {},
      h('a.btn', { href: './legal/privacy.html', target: '_blank', rel: 'noopener' }, '隱私權政策'),
      h('a.btn', { href: './legal/terms.html', target: '_blank', rel: 'noopener' }, '使用條款'),
    ),
  ].filter((n) => n !== null);
}

function installSection(d: SettingsDeps): Node[] {
  if (isInstalled()) return [h('p.hint', {}, '已經用安裝好的 App 開啟。')];
  if (canPromptInstall())
    return [
      h('button.btn', {
        onclick: async () => {
          if (await promptInstall()) d.toasts.show('裝好了，之後從主畫面的圖示開啟');
          d.sheet.refresh();
        },
      }, '安裝到主畫面'),
      h('p.hint', {}, '裝好後會全螢幕開啟，沒網路也能玩。'),
    ];
  if (isIos()) return [h('p.hint', {}, '在 Safari 按下方的「分享」，選「加入主畫面」，就能全螢幕開啟、沒網路也能玩。')];
  return [h('p.hint', {}, '用瀏覽器選單的「安裝應用程式」或「加到主畫面」，就能全螢幕開啟、沒網路也能玩。')];
}

/** 設定頁：聲音、顯示、時間、存檔、通知、隱私、安裝、開發者。跟其他面板一起延後載入（ui/deferred-ui.ts）。 */
export function settingsPanel(d: SettingsDeps): HTMLElement {
  const audio = d.audio();
  const ui = d.ui;
  return h(
    'div.stack',
    {},
    h('h3', {}, '聲音'),
    ...(
      [
        ['master', '主音量'],
        ['music', '音樂'],
        ['sfx', '音效'],
        ['ambience', '環境音'],
      ] as const
    ).map(([key, label]) =>
      h(
        'label.slider-row',
        {},
        h('span', {}, label),
        h('input', {
          type: 'range',
          min: '0',
          max: '100',
          value: String(Math.round(audio[key] * 100)),
          'aria-label': label,
          oninput: (e: Event) => d.updateAudio({ [key]: Number((e.target as HTMLInputElement).value) / 100 }),
        }),
      ),
    ),
    h(
      'label.check-row',
      {},
      h('input', { type: 'checkbox', checked: audio.muted, onchange: (e: Event) => d.updateAudio({ muted: (e.target as HTMLInputElement).checked }) }),
      h('span', {}, '靜音'),
    ),
    h(
      'label.check-row',
      {},
      h('input', { type: 'checkbox', checked: audio.haptics, onchange: (e: Event) => d.updateAudio({ haptics: (e.target as HTMLInputElement).checked }) }),
      h('span', {}, '震動'),
    ),
    h('p.hint', {}, '背景音樂是即時彈奏的慢板指彈吉他，每次都不一樣；晚上關燈後會彈得更輕。音樂和音效的音量可以分開調。'),
    h('h3', {}, '顯示'),
    h(
      'label.check-row',
      {},
      h('input', { type: 'checkbox', checked: ui.bigText, onchange: (e: Event) => d.setBigText((e.target as HTMLInputElement).checked) }),
      h('span', {}, '放大文字'),
    ),
    h(
      'div.item',
      {},
      h('b', {}, '畫質'),
      h(
        'div.tabs',
        {},
        ...(['low', 'medium', 'high'] as const).map((q) =>
          h(
            `button.tab${ui.quality === q ? '.active' : ''}`,
            {
              onclick: () => {
                ui.qualityManual = true;
                d.setQuality(q);
                d.sheet.refresh();
              },
            },
            QUALITY_LABELS[q],
          ),
        ),
      ),
    ),
    h('p.hint', {}, '手機發燙或卡頓時調低：低畫質會關掉景深模糊和柔光，水中微粒也會變少。'),
    h('div.item', {}, h('b', {}, '語言'), h('span.owned', {}, '繁體中文')),
    h('div.item', {}, h('b', {}, '版本'), h('span.owned', {}, __APP_VERSION__)),
    h('p.hint', {}, '燈號除了顏色也用形狀區分：圓形正常、三角形注意、菱形危險。'),
    h('h3', {}, '時間'),
    h('p.hint', {}, '遊戲時間是現實的 7 倍：現實 1 天＝遊戲 1 週，現實 1 小時＝遊戲 7 小時。關掉網頁時時間照常前進，下次打開會補算（最多兩週）。'),
    h('p.hint', {}, '暫停和快轉在主畫面時鐘旁邊的速度按鈕。'),
    h('h3', {}, '存檔'),
    h('div.row', {}, h('button.btn', { onclick: d.exportSave }, '匯出存檔'), h('button.btn', { onclick: d.importSave }, '匯入存檔')),
    h('p.hint', {}, '遊戲每 10 秒自動存檔，每 30 分鐘自動備份一次；存檔壞掉時會自動用備份還原。換手機時可以匯出成檔案帶過去。'),
    ...(FEATURES.cloudSave
      ? [h('h3', {}, '雲端存檔'), h('button.btn', { onclick: d.openCloud }, d.cloud.session ? `雲端存檔（${d.cloud.session.username}）` : '登入雲端存檔')]
      : []),
    h('h3', {}, '通知'),
    ...notifySection(d),
    h('h3', {}, '隱私'),
    ...privacySection(d),
    // App 版本來就是裝好的，不用顯示安裝說明
    ...(isNativeApp() ? [] : [h('h3', {}, '安裝'), ...installSection(d)]),
    h('h3', {}, '開發者'),
    h('button.btn', { onclick: d.openDebug }, '開發者'),
    h('label.check-row', {}, h('input', { type: 'checkbox', checked: ui.showFps, onchange: (e: Event) => d.setShowFps((e.target as HTMLInputElement).checked) }), h('span', {}, '顯示幀率（實機量效能用）')),
  );
}
