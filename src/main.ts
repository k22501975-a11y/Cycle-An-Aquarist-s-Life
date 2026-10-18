import { Application } from 'pixi.js';
import { AudioEngine } from './audio/engine';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from './audio/settings';
import { eventSound } from './audio/sounds';
import { applySeason, Game, newGameState, SPEED_OPTIONS } from './game/game';
import { browserStore, catchUp, clearSave, loadSave, parseSave, serializeSave, writeSave } from './game/save';
import { installCrashGuard } from './ui/crash';
import { canPromptInstall, isInstalled, isIos, promptInstall, setupPwa } from './ui/pwa';
import { loadPaintedArt } from './render/painted';
import { defaultQuality, isQuality, type Quality, QUALITY_LABELS, qualitySpec } from './render/quality';
import { TankView } from './render/tank-view';
import * as sim from './sim';
import { FISH_SPECIES, isFilterRunning, isLightOn, removeDeadFish, tankSize, useTestKit } from './sim';
import { h } from './ui/dom';
import { ICONS } from './ui/icons';
import { describeEvent, fishName, fishStrain } from './ui/labels';
import {
  debugPanel,
  feedPanel,
  fishPanel,
  maintenancePanel,
  plantPanel,
  shopPanel,
  tanksPanel,
  testKitPanel,
  trimListPanel,
  waterChangePanel,
  type PanelContext,
} from './ui/panels';
import { Guide } from './ui/guide';
import { recordsPanel } from './ui/records';
import { loadCodexSeen, saveCodexSeen, unlockCodex } from './ui/codex';
import { codexPanel } from './ui/codex-panel';
import { Sheet, Toasts } from './ui/sheet';
import { clockLabel, householdTodos, waterCapsules } from './ui/status';
import { cornerRect, pickCorner, type Corner, type Rect } from './ui/dodge';
import './ui/styles.css';

/** 寬螢幕（桌機、平板橫向）：待辦卡與選取卡放在下方櫃台兩側；其他時候待辦收進狀態列、選取卡浮在水缸上。 */
const WIDE = window.matchMedia('(min-width: 1000px) and (min-height: 560px)');

/** 內容沒變就不重建（定時刷新時重建按鈕，會吃掉正在按的點擊）。 */
/** 多久沒操作就降低畫面更新率（毫秒）。 */
const IDLE_MS = 20_000;

function memo(): (key: string) => boolean {
  let last = '';
  return (key) => {
    if (key === last) return false;
    last = key;
    return true;
  };
}

function icon(svg: string): HTMLElement {
  const el = h('span.ico');
  el.innerHTML = svg;
  return el;
}

async function start(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const hud = document.getElementById('hud')!;
  const dock = document.getElementById('dock')!;

  const app = new Application();
  await app.init({ resizeTo: stage, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio), autoDensity: true });
  stage.appendChild(app.canvas);
  await loadPaintedArt();

  // 讀取存檔並補算離開期間的時間
  const store = browserStore();
  const loaded = loadSave(store);
  const saved = loaded.file;
  if (saved) for (const t of [saved.state, ...(saved.tanks ?? [])]) applySeason(t);
  const offline = saved ? catchUp(saved) : null;
  const game = new Game(saved?.state ?? newGameState(), saved?.timeScale ?? 7, saved?.tanks ?? [], saved?.active ?? 0);
  for (const t of game.tanks) applySeason(t);
  const extraTanks = () => ({ tanks: game.tanks.slice(1), active: game.active });
  const save = () => writeSave(store, game.tanks[0], game.clock.timeScale, Date.now(), extraTanks());
  // 開發用：在瀏覽器主控台用 cycle.game、cycle.sim 直接操作（截圖、調平衡）。
  const debugHandle = { game, sim } as Record<string, unknown>;
  (window as unknown as { cycle: unknown }).cycle = debugHandle;
  const sheet = new Sheet(document.body);
  const toasts = new Toasts(document.body);
  // 聲音：瀏覽器要等第一次點擊才能出聲
  let audioSettings = loadAudioSettings(store);
  const audio = new AudioEngine(audioSettings);
  document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  document.addEventListener('keydown', () => audio.unlock(), { capture: true });
  // 一般按鈕都有輕輕的點擊聲；工具列和選單另外處理
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('button') && !target.closest('.tool')) audio.play('tap');
  });
  const updateAudio = (patch: Partial<AudioSettings>) => {
    audioSettings = { ...audioSettings, ...patch };
    audio.applySettings(audioSettings);
    saveAudioSettings(store, audioSettings);
  };
  // 顯示偏好（放大文字）：和存檔分開
  const UI_KEY = 'cycle.ui.v1';
  const autoQuality = defaultQuality(window.innerWidth, window.matchMedia?.('(pointer: coarse)').matches ?? false);
  const uiPrefs = (() => {
    try {
      const raw = JSON.parse(store.getItem(UI_KEY) ?? '{}');
      return { bigText: raw.bigText === true, quality: isQuality(raw.quality) ? raw.quality : autoQuality };
    } catch {
      return { bigText: false, quality: autoQuality };
    }
  })();
  const saveUiPrefs = () => {
    try {
      store.setItem(UI_KEY, JSON.stringify(uiPrefs));
    } catch {
      // 存不了就算了
    }
  };
  const setBigText = (on: boolean) => {
    uiPrefs.bigText = on;
    document.documentElement.classList.toggle('big-text', on);
    saveUiPrefs();
  };
  setBigText(uiPrefs.bigText);
  const codexSeen = loadCodexSeen(store);
  // 會後悔的操作（換水、洗濾材、換過濾器、下藥）：先記下整缸狀態，通知上可以按「復原」。
  const undoable = (run: () => void, text: string, tone: 'warn' | 'info' = 'info') => {
    const before = structuredClone(game.state);
    run();
    toasts.show(text, tone, {
      label: '復原',
      run: () => {
        game.restoreActive(before);
        toasts.show('已經復原');
      },
    });
  };
  const ctx: PanelContext = { game, sheet, toasts, sound: (id) => audio.play(id), undoable };
  // 存檔匯出成檔案（換手機、怕瀏覽器清掉資料時用）
  const exportSave = () => {
    const blob = new Blob([serializeSave(game.tanks[0], game.clock.timeScale, Date.now(), undefined, extraTanks())], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `cycle-save-day${Math.floor(game.state.hours / 24) + 1}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importSave = () => {
    const input = h('input', { type: 'file', accept: 'application/json,.json' }) as HTMLInputElement;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const res = parseSave(await file.text());
      if (!res.ok) {
        toasts.show(res.reason === 'newer' ? '這個存檔來自比較新的版本，請先更新遊戲' : '讀不出這個存檔檔案', 'bad');
        return;
      }
      if (!confirm('要用這個檔案取代目前的水缸嗎？目前的進度會被覆蓋。')) return;
      const before = structuredClone(game.tanks);
      const beforeActive = game.active;
      game.clock.timeScale = res.file.timeScale;
      game.load(res.file.state, res.file.tanks ?? [], res.file.active ?? 0);
      save();
      sheet.close();
      select(null);
      toasts.show('匯入了存檔', 'info', { label: '復原', run: () => (game.load(before[0], before.slice(1), beforeActive), save()) });
    });
    input.click();
  };
  const crash = installCrashGuard({ save, exportSave });
  // 可安裝的 App：有新版時提示重新整理（先存檔）
  setupPwa((apply) => toasts.show('有新版本了', 'info', { label: '更新', run: () => (save(), apply()) }));
  const installSection = () => {
    if (isInstalled()) return [h('p.hint', {}, '已經用安裝好的 App 開啟。')];
    if (canPromptInstall())
      return [
        h('button.btn', {
          onclick: async () => {
            if (await promptInstall()) toasts.show('裝好了，之後從主畫面的圖示開啟');
            sheet.refresh();
          },
        }, '安裝到主畫面'),
        h('p.hint', {}, '裝好後會全螢幕開啟，沒網路也能玩。'),
      ];
    if (isIos()) return [h('p.hint', {}, '在 Safari 按下方的「分享」，選「加入主畫面」，就能全螢幕開啟、沒網路也能玩。')];
    return [h('p.hint', {}, '用瀏覽器選單的「安裝應用程式」或「加到主畫面」，就能全螢幕開啟、沒網路也能玩。')];
  };
  debugHandle.audio = audio;

  // ---- 選取卡：點一條魚，顯示名字、品系、健康與壓力 ----
  const selCard = h('div.card.glass.selcard');
  let selected: number | null = null;
  const selChanged = memo();
  const renderSelCard = () => {
    const fish = game.state.fish.find((f) => f.id === selected);
    if (!selChanged(fish ? `${fish.id}:${fish.alive}:${Math.round(fish.health * 50)}:${Math.round(fish.stress * 50)}:${fishName(fish)}` : '-')) return;
    selCard.classList.toggle('empty', !fish);
    if (!fish) {
      selCard.replaceChildren(h('div.card-title', {}, '觀察'), h('p.hint', {}, '點缸裡的魚，看看牠的狀況。'));
      return;
    }
    const strain = fishStrain(fish);
    const sex = fish.sex === 'male' ? '♂' : '♀';
    const title = `${fishName(fish)} ${sex}`;
    const sub = strain ? `品系・${strain}` : FISH_SPECIES[fish.species].name;
    const bar = (label: string, value: number, tone: string) =>
      h('div.bar-row', {}, h('span', {}, label), h('div.bar', {}, h(`i.${tone}`, { style: { width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` } })));
    const close = h('button.card-x', { 'aria-label': '取消選取', onclick: () => select(null) }, '✕');
    if (!fish.alive) {
      selCard.replaceChildren(close, h('div.card-title', {}, title), h('div.card-sub', {}, sub), h('p.dead', {}, '已經死了'), h('button.btn.small.primary', { onclick: () => sheet.open('死掉的魚', () => fishPanel(ctx, fish.id), { live: true }) }, '看原因'));
      return;
    }
    selCard.replaceChildren(
      close,
      h('div.card-title', {}, title),
      h('div.card-sub', {}, sub),
      bar('健康', fish.health, fish.health > 0.6 ? 'ok' : fish.health > 0.3 ? 'warn' : 'bad'),
      bar('壓力', fish.stress, fish.stress < 0.4 ? 'warn' : 'bad'),
      h('button.btn.small', { onclick: () => sheet.open('觀察這條魚', () => fishPanel(ctx, fish.id), { live: true }) }, '詳細'),
    );
  };
  const select = (id: number | null) => {
    selected = id;
    view.selectFish(id);
    selCard.classList.toggle('open', id !== null);
    renderSelCard();
    if (id !== null) requestAnimationFrame(() => placeSelCard());
  };
  debugHandle.select = select;

  const view = new TankView(app, {
    onSelectFish: (id) => select(id),
    onSelectPlant: (id) => sheet.open('水草', () => plantPanel(ctx, id), { live: true }),
  });
  debugHandle.view = view;
  // 畫質：低畫質關掉景深模糊、柔光，降低解析度與粒子數量
  const setQuality = (q: Quality) => {
    uiPrefs.quality = q;
    const spec = qualitySpec(q, window.devicePixelRatio || 1);
    app.renderer.resolution = spec.resolution;
    app.resize();
    view.setQuality(spec);
    saveUiPrefs();
  };
  setQuality(uiPrefs.quality);
  app.stage.addChild(view.root);

  // ---- 狀態列：時間、水質膠囊（沒測過顯示「?」）、待辦、選單 ----
  const clockValue = h('span.value');
  const clock = h('div.time', {}, h('span.label', {}, '水族人生'), clockValue);
  const coinsValue = h('b');
  const coinsBtn = h('button.coins', { 'aria-label': '錢包', title: '錢包：點一下打開商店', onclick: () => sheet.open('商店', () => shopPanel(ctx)) }, h('i.coin'), coinsValue);
  const renderCoins = () => {
    const coins = sim.economy(game.state).coins;
    const text = coins.toLocaleString('zh-TW');
    if (coinsValue.textContent !== text) coinsValue.textContent = text;
    coinsBtn.classList.toggle('debt', coins < 0);
  };
  // 多缸：目前在看哪一缸，點一下切換或加缸
  const tankName = h('b');
  const tankCount = h('span.count');
  const tankBtn = h('button.tank-chip', { 'aria-label': '我的水缸', title: '我的水缸：切換、加一缸', onclick: () => sheet.open('我的水缸', () => tanksPanel(ctx)) }, icon(ICONS.tank), tankName, tankCount);
  const renderTankChip = () => {
    const multi = game.tanks.length > 1;
    const text = multi ? sim.tankLabel(game.tanks, game.active) : '水缸';
    const count = multi ? `${game.active + 1}/${game.tanks.length}` : '';
    if (tankName.textContent !== text) tankName.textContent = text;
    if (tankCount.textContent !== count) tankCount.textContent = count;
    tankBtn.title = `我的水缸：${text}（切換、加一缸）`;
    // 其他缸有嚴重的事：小紅點
    const alarm = game.tanks.some((t, i) => i !== game.active && householdTodos([t], 0).some((x) => x.tone === 'bad'));
    tankBtn.classList.toggle('alert', alarm);
  };
  const caps = h('button.caps', { 'aria-label': '水質趨勢', title: '點一下看水質趨勢', onclick: () => sheet.open('紀錄', () => recordsPanel(ctx)) });
  const todoBadge = h('span.badge');
  const todoCard = h('div.card.glass.todo');
  const todosChanged = memo();
  const renderTodos = () => {
    const list = householdTodos(game.tanks, game.active);
    if (!todosChanged(JSON.stringify(list))) return;
    todoCard.replaceChildren(
      h('button.card-link', { onclick: () => sheet.open('紀錄', () => recordsPanel(ctx, 'events')) }, '紀錄 ›'),
      h('div.card-title', {}, '今日待辦'),
      ...list.slice(0, 3).map((t) => h(`div.todo-item.${t.tone}`, {}, t.text)),
    );
    const urgent = list.filter((t) => t.tone !== 'ok').length;
    todoBadge.textContent = urgent > 0 ? String(urgent) : '';
    todoBadge.classList.toggle('show', urgent > 0);
  };
  const todoSheet = () =>
    h(
      'div.stack',
      {},
      ...householdTodos(game.tanks, game.active).map((t) => h(`div.todo-item.${t.tone}`, {}, t.text)),
      h('button.btn', { onclick: () => sheet.open('紀錄', () => recordsPanel(ctx, 'events')) }, '看事件紀錄'),
    );
  const todoBtn = h('button.hud-btn.todo-btn', { 'aria-label': '待辦', onclick: () => sheet.open('待辦', todoSheet, { live: true }) }, icon(ICONS.todo), todoBadge);
  const capsChanged = memo();
  const renderCaps = () => {
    const list = waterCapsules(game.state);
    if (!capsChanged(JSON.stringify(list))) return;
    caps.replaceChildren(
      ...list.map((c) => h(`span.cap.${c.tone}${c.stale ? '.stale' : ''}`, { title: c.title }, h('i.dot'), h('span.lbl', {}, c.label), h('b', {}, c.value))),
    );
  };
  // 設定頁：聲音、顯示、時間、存檔、開發者
  const settings = () =>
    h(
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
            value: String(Math.round(audioSettings[key] * 100)),
            'aria-label': label,
            oninput: (e: Event) => updateAudio({ [key]: Number((e.target as HTMLInputElement).value) / 100 }),
          }),
        ),
      ),
      h(
        'label.check-row',
        {},
        h('input', { type: 'checkbox', checked: audioSettings.muted, onchange: (e: Event) => updateAudio({ muted: (e.target as HTMLInputElement).checked }) }),
        h('span', {}, '靜音'),
      ),
      h('p.hint', {}, '背景音樂是即時彈奏的指彈吉他，每次都不一樣；晚上關燈後會彈得比較輕。'),
      h('h3', {}, '顯示'),
      h(
        'label.check-row',
        {},
        h('input', { type: 'checkbox', checked: uiPrefs.bigText, onchange: (e: Event) => setBigText((e.target as HTMLInputElement).checked) }),
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
              `button.tab${uiPrefs.quality === q ? '.active' : ''}`,
              {
                onclick: () => {
                  setQuality(q);
                  sheet.refresh();
                },
              },
              QUALITY_LABELS[q],
            ),
          ),
        ),
      ),
      h('p.hint', {}, '手機發燙或卡頓時調低：低畫質會關掉景深模糊和柔光，水中微粒也會變少。'),
      h('div.item', {}, h('b', {}, '語言'), h('span.owned', {}, '繁體中文')),
      h('p.hint', {}, '燈號除了顏色也用形狀區分：圓形正常、三角形注意、菱形危險。'),
      h('h3', {}, '時間'),
      h('p.hint', {}, '遊戲時間是現實的 7 倍：現實 1 天＝遊戲 1 週，現實 1 小時＝遊戲 7 小時。關掉網頁時時間照常前進，下次打開會補算（最多兩週）。'),
      h(
        'details.dev',
        {},
        h('summary', {}, '開發用：加快時間'),
        h(
          'div.tabs',
          {},
          ...SPEED_OPTIONS.map((opt) =>
            h(
              `button.tab${game.clock.timeScale === opt.scale ? '.active' : ''}`,
              {
                onclick: () => {
                  game.clock.timeScale = opt.scale;
                  save();
                  sheet.refresh();
                },
              },
              opt.label,
            ),
          ),
        ),
      ),
      h('h3', {}, '存檔'),
      h('div.row', {}, h('button.btn', { onclick: exportSave }, '匯出存檔'), h('button.btn', { onclick: importSave }, '從檔案匯入')),
      h('p.hint', {}, '遊戲每 10 秒自動存檔，每 30 分鐘自動備份一次；存檔壞掉時會自動用備份還原。換手機時可以匯出成檔案帶過去。'),
      h('h3', {}, '安裝'),
      ...installSection(),
      h('h3', {}, '開發者'),
      h('button.btn', { onclick: () => sheet.open('開發者數值', () => debugPanel(ctx), { live: true }) }, '開發者數值'),
    );
  const menu = () =>
    h(
      'div.stack',
      {},
      h('button.btn', { onclick: () => sheet.open('我的水缸', () => tanksPanel(ctx)) }, '我的水缸：切換、加一缸'),
      h('button.btn', { onclick: () => sheet.open('圖鑑', () => codexPanel(ctx, codexSeen)) }, '圖鑑：魚蝦、水草、設備、疾病'),
      h('button.btn', { onclick: () => sheet.open('紀錄', () => recordsPanel(ctx)) }, '水質趨勢與事件紀錄'),
      h('button.btn', { onclick: () => (sheet.close(), guide.restart()) }, '重新看阿德老闆的教學'),
      h('button.btn', { onclick: () => sheet.open('設定', settings) }, '設定：聲音、顯示、時間、存檔'),
      h(
        'button.btn',
        {
          onclick: () => {
            if (!confirm('確定要放棄目前的水缸，重新開始嗎？')) return;
            clearSave(store);
            game.load(newGameState());
            save();
            sheet.close();
            select(null);
            toasts.show('開了一個新缸');
          },
        },
        '新遊戲',
      ),
    );
  const menuBtn = h('button.hud-btn', { onclick: () => sheet.open('選單', menu), 'aria-label': '選單' }, icon(ICONS.menu));
  hud.classList.add('glass');
  hud.append(clock, coinsBtn, tankBtn, h('span.hud-sep'), caps, todoBtn, menuBtn);

  // ---- 下方櫃台：待辦卡｜圓形工具列｜選取卡 ----
  const tools = h('div.tools.glass');
  // 精繪圖示（AI 生圖，圓角方框款）：放大裁成圓形放進按鈕；載入失敗就露出原本的線條圖示
  const TOOL_ART: Partial<Record<keyof typeof ICONS, string>> = {
    feed: 'icon-feed',
    water: 'icon-waterchange',
    test: 'icon-testkit',
    trim: 'icon-trim',
    shop: 'icon-shop',
    gear: 'icon-gear',
    net: 'icon-net',
  };
  const tool = (key: keyof typeof ICONS, label: string, color: string, onclick: () => void) => {
    const disc = h('span.disc', {}, icon(ICONS[key]));
    const art = TOOL_ART[key];
    if (art) {
      const img = h('img.art', { src: `${import.meta.env.BASE_URL}art/ui/${art}.webp`, alt: '', draggable: 'false' });
      img.addEventListener('error', () => {
        img.remove();
        disc.classList.remove('has-art');
      });
      disc.classList.add('has-art');
      disc.append(img);
    }
    const b = h('button.tool', { onclick }, disc, h('span.lbl', {}, label));
    b.addEventListener('click', () => audio.play(key === 'net' ? 'net' : key === 'test' ? 'test' : 'open'));
    b.style.setProperty('--c', color);
    tools.append(b);
    return b;
  };
  tool('feed', '餵食', '#e8a24a', () => sheet.open('餵食', () => feedPanel(ctx)));
  tool('water', '換水', '#4fb8e0', () => sheet.open('換水', () => waterChangePanel(ctx)));
  tool('test', '測試', '#a98be8', () => {
    const cost = sim.price('use:test');
    if (!sim.canAfford(game.state, cost)) {
      toasts.show(`錢不夠買試劑（一次 ${cost} 元）`, 'warn');
      return;
    }
    game.act((st) => {
      sim.spend(st, cost);
      useTestKit(st);
    });
    renderCaps();
    sheet.open('水質測試', () => testKitPanel(ctx), { live: true });
  });
  tool('trim', '修剪', '#7ccf8a', () => sheet.open('修剪水草', () => trimListPanel(ctx)));
  tool('shop', '商店', '#ef8a6a', () => sheet.open('商店', () => shopPanel(ctx)));
  tool('gear', '設備', '#e3bd6d', () => sheet.open('設備與維護', () => maintenancePanel(ctx)));
  const netBtn = tool('net', '撈死魚', '#e88aa8', () => {
    const n = game.act(removeDeadFish);
    toasts.show(n > 0 ? `撈出 ${n} 條死魚` : '缸裡沒有死魚');
  });
  dock.append(todoCard, tools);
  // 選取卡的位置依螢幕寬度切換：寬螢幕在櫃台右邊，其他時候浮在水缸右上角。
  const placeCards = () => {
    if (WIDE.matches) dock.append(selCard);
    else stage.append(selCard);
    requestAnimationFrame(() => measure());
  };
  placeCards();
  WIDE.addEventListener('change', placeCards);

  // 窄螢幕時選取卡浮在水缸上：跟著選取的魚換角落，不要擋住牠。
  let cardArea: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let cardCorner: Corner = 'top-right';
  const placeSelCard = () => {
    if (WIDE.matches) {
      selCard.style.top = selCard.style.bottom = selCard.style.left = selCard.style.right = '';
      return;
    }
    const fishPos = selected !== null ? view.fishScreenPos(selected) : null;
    cardCorner = pickCorner(cardCorner, fishPos, cardArea, selCard.offsetWidth, selCard.offsetHeight);
    const r = cornerRect(cardCorner, cardArea, selCard.offsetWidth, selCard.offsetHeight, 14);
    selCard.style.top = `${Math.round(r.y)}px`;
    selCard.style.left = `${Math.round(r.x)}px`;
    selCard.style.right = selCard.style.bottom = 'auto';
  };

  // 水缸撐滿整個畫面；告訴畫面狀態列與按鈕列蓋住多少，魚就不會游到它們後面。
  const tankLabel = h('div.tank-label');
  stage.append(tankLabel);
  const guide = new Guide(stage, store, (id) => audio.play(id), () => requestAnimationFrame(() => measure()));
  const measure = () => {
    const stageRect = stage.getBoundingClientRect();
    const top = hud.getBoundingClientRect().bottom - stageRect.top;
    const bottom = stageRect.bottom - tools.getBoundingClientRect().top;
    view.setInsets({ top: Math.round(top), bottom: Math.round(bottom) });
    // 任務小卡在左上角；浮動選取卡排在它下面，下緣留給左下角的缸名標籤。
    guide.pill.style.top = `${Math.round(top + 10)}px`;
    const pillH = guide.pillVisible ? guide.pill.offsetHeight + 8 : 0;
    const dockTop = dock.getBoundingClientRect().top - stageRect.top;
    cardArea = { x: 0, y: top + 10 + pillH, w: stageRect.width, h: Math.max(0, dockTop - top - 10 - pillH - 34) };
    placeSelCard();
    stage.style.setProperty('--dock-top', `${Math.round(stageRect.bottom - dockTop - stageRect.top)}px`);
    tankLabel.style.bottom = `${Math.round(stageRect.bottom - dock.getBoundingClientRect().top + 8)}px`;
    const size = tankSize(game.state.equipment.tank);
    const named = game.tanks.length > 1 ? `${sim.tankLabel(game.tanks, game.active)}・` : '';
    tankLabel.textContent = `${named}${game.state.equipment.tank.name}・${size.w}×${size.h}×${size.d} cm`;
  };
  new ResizeObserver(measure).observe(hud);
  new ResizeObserver(measure).observe(dock);
  window.addEventListener('resize', measure);
  measure();

  // 其他缸的事件也要通知，前面加上缸名
  const tankPrefix = (tank: number) => (game.tanks.length > 1 && tank !== game.active ? `${sim.tankLabel(game.tanks, tank)}：` : '');
  game.onEvent((e, tank) => {
    audio.play(eventSound(e.type));
    const msg = describeEvent(game.tanks[tank] ?? game.state, e);
    if (msg) toasts.show(tankPrefix(tank) + msg.text, msg.tone);
  });
  game.onChange(() => {
    sheet.refresh();
    measure();
    renderSelCard();
    renderTodos();
    renderCaps();
    renderTankChip();
    save();
  });

  if (loaded.status === 'restored') toasts.show('存檔讀不出來，已經用自動備份還原', 'warn');
  else if (loaded.status === 'newer') toasts.show('這個存檔來自比較新的版本，先幫你另外保留起來，這裡開了一個新缸', 'warn');
  else if (loaded.status === 'corrupt') toasts.show('存檔壞掉了，也沒有備份，只好開一個新缸', 'bad');
  if (offline && offline.hours >= 1) {
    const days = offline.hours / 24;
    toasts.show(`你不在的期間過了 ${days >= 1 ? `${days.toFixed(1)} 天` : `${Math.round(offline.hours)} 小時`}${offline.capped ? '（只補算到兩週）' : ''}`);
    offline.byTank.forEach((events, tank) => {
      for (const e of events) {
        const msg = describeEvent(game.tanks[tank] ?? game.state, e);
        if (msg) toasts.show(tankPrefix(tank) + msg.text, msg.tone);
      }
    });
  }
  if (window.matchMedia('(orientation: portrait)').matches) toasts.show('把手機轉成橫向，水缸會更大');
  setInterval(save, 10_000);
  // 切到背景時畫面停止更新；回來時以 ×7 補算這段時間，和關掉網頁一樣。
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    audio.setPaused(document.visibilityState === 'hidden');
    if (document.visibilityState === 'hidden') {
      app.ticker.stop();
      hiddenAt = Date.now();
      save();
    } else if (hiddenAt !== null) {
      app.ticker.start();
      const away = catchUp({ version: 1, savedAt: hiddenAt, timeScale: game.clock.timeScale, state: game.tanks[0], tanks: game.tanks.slice(1) });
      hiddenAt = null;
      away.byTank.forEach((events, tank) =>
        events.forEach((e) => {
          const msg = describeEvent(game.tanks[tank] ?? game.state, e);
          if (msg) toasts.show(tankPrefix(tank) + msg.text, msg.tone);
        }),
      );
    }
  });
  window.addEventListener('pagehide', save);

  renderSelCard();
  renderTodos();
  renderCaps();
  renderCoins();
  guide.start();
  let refreshTimer = 0;
  // 一段時間沒操作就降到 30 fps，省電；一碰螢幕馬上恢復
  let lastInput = performance.now();
  const wake = () => {
    lastInput = performance.now();
    app.ticker.maxFPS = 0;
  };
  for (const type of ['pointerdown', 'pointermove', 'wheel', 'keydown']) window.addEventListener(type, wake, { passive: true });
  app.ticker.add((ticker) => {
    try {
      tick(ticker.deltaMS);
    } catch (error) {
      app.ticker.stop();
      crash(error);
    }
  });
  function tick(deltaMS: number) {
    const ticker = { deltaMS };
    game.advance(ticker.deltaMS);
    view.update(game.state, ticker.deltaMS / 1000);

    clockValue.textContent = `${clockLabel(game.state.hours)}${game.clock.timeScale === 0 ? '・暫停' : ''}`;
    netBtn.classList.toggle('alert', game.state.fish.some((f) => !f.alive));

    // 每半秒更新一次卡片與數值
    refreshTimer += ticker.deltaMS;
    if (refreshTimer > 500) {
      refreshTimer = 0;
      for (const t of game.tanks) applySeason(t);
      if (sheet.isLive) sheet.refresh();
      renderSelCard();
      placeSelCard();
      renderTodos();
      renderCaps();
      renderCoins();
      renderTankChip();
      guide.update(game.state);
      for (const entry of unlockCodex(codexSeen, game.state)) {
        saveCodexSeen(store, codexSeen);
        toasts.show(`圖鑑新增了「${entry.name}」`);
      }
      if (performance.now() - lastInput > IDLE_MS && !sheet.isOpen) app.ticker.maxFPS = 30;
      const st = game.state;
      audio.setAmbience({
        filterOn: isFilterRunning(st),
        airPumpOn: !!st.equipment.airPump?.on && !st.environment.powerOut,
        calm: game.clock.timeScale === 0 ? 1 : isLightOn(st) ? 0 : 0.8,
      });
    }
  }
}

start();
