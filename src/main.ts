import { Application } from 'pixi.js';
import { Game, newGameState, SPEED_OPTIONS } from './game/game';
import { browserStore, catchUp, clearSave, readSave, writeSave } from './game/save';
import { TankView } from './render/tank-view';
import { GAME_SECONDS_PER_DAY, isLightOn, removeDeadFish } from './sim';
import { h } from './ui/dom';
import { describeEvent } from './ui/labels';
import {
  debugPanel,
  feedPanel,
  fishPanel,
  maintenancePanel,
  plantPanel,
  shopPanel,
  testKitPanel,
  waterChangePanel,
  type PanelContext,
} from './ui/panels';
import { Sheet, Toasts } from './ui/sheet';
import './ui/styles.css';

async function start(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const hud = document.getElementById('hud')!;
  const toolbar = document.getElementById('toolbar')!;

  const app = new Application();
  await app.init({ resizeTo: stage, background: 0x1d3046, antialias: true, resolution: Math.min(2, window.devicePixelRatio), autoDensity: true });
  stage.appendChild(app.canvas);

  // 讀取存檔並補算離開期間的時間
  const store = browserStore();
  const saved = readSave(store);
  const offline = saved ? catchUp(saved) : null;
  const game = new Game(saved?.state ?? newGameState(), saved?.timeScale ?? 7);
  const save = () => writeSave(store, game.state, game.clock.timeScale);
  // 給瀏覽器端的自動化測試與除錯使用。
  const debugHandle = { game } as Record<string, unknown>;
  (window as unknown as { cycle: unknown }).cycle = debugHandle;
  const sheet = new Sheet(document.body);
  const toasts = new Toasts(document.body);
  const ctx: PanelContext = { game, sheet, toasts };

  const view = new TankView(app, {
    onSelectFish: (id) => {
      view.selectFish(id);
      const fish = game.state.fish.find((f) => f.id === id);
      sheet.open(fish?.alive === false ? '死掉的魚' : '觀察這條魚', () => fishPanel(ctx, id), { live: true });
    },
    onSelectPlant: (id) => sheet.open('水草', () => plantPanel(ctx, id), { live: true }),
  });
  sheet.onClose = () => view.selectFish(null);
  debugHandle.view = view;
  app.stage.addChild(view.root);

  // HUD：時間、溫度計、時間倍率
  const clock = h('span.clock');
  const temp = h('span.temp');
  const speed = h('select', { 'aria-label': '時間倍率' }) as HTMLSelectElement;
  for (const opt of SPEED_OPTIONS) speed.append(h('option', { value: String(opt.scale) }, opt.label));
  speed.value = String(game.clock.timeScale);
  speed.addEventListener('change', () => {
    game.clock.timeScale = Number(speed.value);
    save();
  });
  const menu = () =>
    h(
      'div.stack',
      {},
      h('button.btn', { onclick: () => sheet.open('開發者數值', () => debugPanel(ctx), { live: true }) }, '開發者數值'),
      h('p.hint', {}, '遊戲每 10 秒自動存檔；關掉網頁期間的時間，下次打開會以 ×7 補算（最多兩週）。'),
      h(
        'button.btn',
        {
          onclick: () => {
            if (!confirm('確定要放棄目前的水缸，重新開始嗎？')) return;
            clearSave(store);
            game.load(newGameState());
            save();
            sheet.close();
            toasts.show('開了一個新缸');
          },
        },
        '新遊戲',
      ),
    );
  const debugBtn = h('button.icon-btn', { onclick: () => sheet.open('選單', menu), 'aria-label': '選單' }, '⚙');
  hud.append(clock, temp, h('span.spacer'), speed, debugBtn);

  // 操作列
  const deadBtn = h('button', {}, h('span.ico', {}, '🥅'), '撈死魚');
  const tools: Array<[string, string, () => void]> = [
    ['🍤', '餵食', () => sheet.open('餵食', () => feedPanel(ctx))],
    ['🪣', '換水', () => sheet.open('換水', () => waterChangePanel(ctx))],
    ['🧪', '測試劑', () => sheet.open('水質測試', () => testKitPanel(ctx), { live: true })],
    ['🛒', '商店', () => sheet.open('商店', () => shopPanel(ctx))],
    ['🔧', '設備', () => sheet.open('設備與維護', () => maintenancePanel(ctx))],
  ];
  for (const [ico, label, onclick] of tools) toolbar.append(h('button', { onclick }, h('span.ico', {}, ico), label));
  deadBtn.addEventListener('click', () => {
    const n = game.act(removeDeadFish);
    toasts.show(n > 0 ? `撈出 ${n} 條死魚` : '缸裡沒有死魚');
  });
  toolbar.append(deadBtn);

  game.onEvent((e) => {
    const msg = describeEvent(game.state, e);
    if (msg) toasts.show(msg.text, msg.tone);
  });
  game.onChange(() => {
    sheet.refresh();
    save();
  });

  if (offline && offline.hours >= 1) {
    const days = offline.hours / 24;
    toasts.show(`你不在的期間過了 ${days >= 1 ? `${days.toFixed(1)} 天` : `${Math.round(offline.hours)} 小時`}${offline.capped ? '（只補算到兩週）' : ''}`);
    for (const e of offline.events) {
      const msg = describeEvent(game.state, e);
      if (msg) toasts.show(msg.text, msg.tone);
    }
  }
  if (window.matchMedia('(orientation: portrait)').matches) toasts.show('把手機轉成橫向，水缸會更大');
  setInterval(save, 10_000);
  // 切到背景時畫面停止更新；回來時以 ×7 補算這段時間，和關掉網頁一樣。
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      save();
    } else if (hiddenAt !== null) {
      const away = catchUp({ version: 1, savedAt: hiddenAt, timeScale: game.clock.timeScale, state: game.state });
      hiddenAt = null;
      away.events.forEach((e) => {
        const msg = describeEvent(game.state, e);
        if (msg) toasts.show(msg.text, msg.tone);
      });
    }
  });
  window.addEventListener('pagehide', save);

  let refreshTimer = 0;
  app.ticker.add((ticker) => {
    game.advance(ticker.deltaMS);
    view.update(game.state, ticker.deltaMS / 1000);

    const t = game.state.hours * 3600;
    const day = Math.floor(t / GAME_SECONDS_PER_DAY) + 1;
    const hh = Math.floor((t % GAME_SECONDS_PER_DAY) / 3600);
    const mm = Math.floor((t % 3600) / 60);
    clock.textContent = `第 ${day} 天 ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${isLightOn(game.state) ? '☀︎' : '☾'}`;
    temp.textContent = `🌡 ${game.state.water.tempC.toFixed(1)}°C`;
    deadBtn.classList.toggle('alert', game.state.fish.some((f) => !f.alive));

    // 面板開著時每半秒更新一次數值
    refreshTimer += ticker.deltaMS;
    if (refreshTimer > 500 && sheet.isLive) {
      refreshTimer = 0;
      sheet.refresh();
    }
  });
}

start();
