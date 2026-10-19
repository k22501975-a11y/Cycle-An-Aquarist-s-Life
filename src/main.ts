import { Application } from 'pixi.js';
import { AudioEngine } from './audio/engine';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from './audio/settings';
import { eventSound } from './audio/sounds';
import { applySeason, Game, newGameState } from './game/game';
import { crisisText } from './game/crisis';
import { browserStore, catchUp, clearSave, loadSave, parseSave, serializeSave, writeSave } from './game/save';
import { menuTile, ownerImg } from './ui/art-icons';
import { cloudTimeScale, SpeedControl } from './ui/speed-control';
import { installCrashGuard } from './ui/crash';
import { Analytics } from './net/analytics';
import { isNativeApp, saveTextFile } from './ui/native';
import { CloudClient } from './net/cloud';
import { autoUpload, checkCloudOnStart, cloudPanel, type CloudPanelDeps } from './ui/cloud-panel';
import { friendsPanel, giftPanel, type FriendsDeps } from './ui/friends-panel';
import { knownArrivals, marketPanel, syncMarket, type MarketDeps } from './ui/market-panel';
import { mallPanel, syncMall, type MallDeps } from './ui/mall-panel';
import { CATEGORY_LABELS, nativePlatform, Notifier, planNotices, webPushPlatform, type PlannedNotice } from './net/push';
import { Forecaster } from './game/forecaster';
import { canPromptInstall, isInstalled, isIos, promptInstall, setupPwa } from './ui/pwa';
import { loadPaintedArt, startupArt } from './render/painted';
import { FrameMonitor, lowerQuality } from './game/frame-monitor';
import { FpsMeter, formatFps } from './game/fps-meter';
import { defaultQuality, isQuality, type Quality, QUALITY_LABELS, qualitySpec } from './render/quality';
import { TankView } from './render/tank-view';
import { SETUP_CAPTIONS } from './render/setup-show';
import { ScapeBar } from './ui/scape-bar';
import * as sim from './sim';
import { FISH_SPECIES, isFilterRunning, isLightOn, removeDeadFish, tankSize, useTestKit } from './sim';
import { h } from './ui/dom';
import { ICONS } from './ui/icons';
import { describeEvent, fishName, fishStrain } from './ui/labels';
import {
  debugPanel,
  feedPanel,
  fishPanel,
  splitPanel,
  snailPanel,
  maintenancePanel,
  plantPanel,
  shopPanel,
  tanksPanel,
  testKitPanel,
  trimListPanel,
  waterChangePanel,
  type PanelContext,
  type ShopTab,
} from './ui/panels';
import { Guide } from './ui/guide';
import { Celebration, type CelebrateSpec } from './ui/celebrate';
import { firstTime, type MomentId } from './ui/moments';
import { causeAdvice, HUNGER_LABEL, needsAdvice } from './ui/owner-advice';
import { ownerSay } from './ui/owner-ask';
import { fryArt, guppyArt } from './ui/shop-cards';
import { StrainTracker, strainOwnerLine } from './ui/strain-moment';
import { recordsPanel } from './ui/records';
import { loadSeenOrders, markOrdersSeen, orderAlert, orderArt, ordersPanel } from './ui/orders-panel';
import { flyCoins } from './ui/coin-fly';
import { morningCard } from './ui/morning-card';
import { morningReport, snapshot, type ReportItem } from './ui/morning-report';
import { loadCodexSeen, saveCodexSeen, unlockCodex } from './ui/codex';
import { codexPanel } from './ui/codex-panel';
import { Sheet, Toasts } from './ui/sheet';
import { clockLabel, householdTodos, waterCapsules, type Todo } from './ui/status';
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

  // 讀取存檔並補算離開期間的時間
  const store = browserStore();
  const loaded = loadSave(store);
  const saved = loaded.file;
  if (saved) for (const t of [saved.state, ...(saved.tanks ?? [])]) applySeason(t);
  const offline = saved ? catchUp(saved) : null;
  const game = new Game(saved?.state ?? newGameState(), saved?.timeScale ?? 7, saved?.tanks ?? [], saved?.active ?? 0);
  for (const t of game.tanks) applySeason(t);
  // 只先等這些缸畫得到的圖（Issue #81），其他的等主畫面出來後在背景載
  await loadPaintedArt(startupArt(game.tanks));
  const extraTanks = () => ({ tanks: game.tanks.slice(1), active: game.active });
  const save = () => writeSave(store, game.tanks[0], game.clock.timeScale, Date.now(), extraTanks());
  // 開發用：在瀏覽器主控台用 cycle.game、cycle.sim 直接操作（截圖、調平衡）。
  const debugHandle = { game, sim } as Record<string, unknown>;
  (window as unknown as { cycle: unknown }).cycle = debugHandle;
  const sheet = new Sheet(document.body);
  const toasts = new Toasts(document.body);
  const celebration = new Celebration(document.body);
  /** 「第一次」的演出：慶祝卡＋撥弦琶音，每件事只演一次。 */
  const moment = (id: MomentId, spec: CelebrateSpec): boolean => {
    if (!firstTime(store, id)) return false;
    audio.play('fanfare');
    celebration.show(spec);
    return true;
  };
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
      return { bigText: raw.bigText === true, quality: isQuality(raw.quality) ? raw.quality : autoQuality, qualityManual: raw.qualityManual === true, showFps: raw.showFps === true };
    } catch {
      return { bigText: false, quality: autoQuality, qualityManual: false, showFps: false };
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
  const ctx: PanelContext = { game, sheet, toasts, sound: (id) => audio.play(id), undoable, moment, fishPic: (fish) => view.portrait(fish) };
  // 存檔匯出成檔案（換手機、怕瀏覽器清掉資料時用）
  const exportSave = () =>
    void saveTextFile(`cycle-save-day${Math.floor(game.state.hours / 24) + 1}.json`, serializeSave(game.tanks[0], game.clock.timeScale, Date.now(), undefined, extraTanks())).catch(() =>
      toasts.show('存檔沒有匯出', 'warn'),
    );
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
  // 雲端存檔：有設定伺服器網址（VITE_API_URL）才開放
  const cloud = new CloudClient(import.meta.env.VITE_API_URL, store);
  const cloudDeps: CloudPanelDeps = {
    cloud,
    sheet,
    toasts,
    saveJson: () => serializeSave(game.tanks[0], game.clock.timeScale, Date.now(), undefined, extraTanks()),
    applyCloud: (file, revision, advanced) => {
      const res = parseSave(JSON.stringify(file));
      if (!res.ok) return false;
      // 伺服器補算過的（L2）不用再補：這台的時鐘可能就是不對的那個
      if (!advanced) catchUp(res.file);
      game.clock.timeScale = res.file.timeScale;
      game.load(res.file.state, res.file.tanks ?? [], res.file.active ?? 0);
      for (const t of game.tanks) applySeason(t);
      cloud.markSynced(revision);
      save();
      select(null);
      return true;
    },
  };
  debugHandle.cloud = cloud;
  // 匿名數據分析：玩家同意才會送（設定 › 隱私）
  const analytics = new Analytics(import.meta.env.VITE_API_URL, store);

  // ---- 參觀好友的缸：畫面換成朋友的缸（照常游動、會動的模擬），自己的缸在背景繼續跑 ----
  let visiting: { name: string; state: sim.TankState; likes: number } | null = null;
  const visitClock = new sim.GameClock(7);
  const visitBar = h('div.visit-bar.glass');
  const leaveVisit = () => {
    visiting = null;
    document.body.classList.remove('visiting');
    visitBar.remove();
    select(null);
    requestAnimationFrame(() => measure());
  };
  const renderVisitBar = () => {
    if (!visiting) return;
    const v = visiting;
    visitBar.replaceChildren(
      h('div.visit-title', {}, h('span.label', {}, '參觀中'), h('b', {}, `${v.name} 的${v.state.label || v.state.equipment.tank.name}`), h('span.likes', {}, `♥ ${v.likes}`)),
      h(
        'div.row',
        {},
        h('button.btn', {
          onclick: async () => {
            const res = await cloud.like(v.name);
            if (!res.ok) return toasts.show(res.message, 'warn');
            v.likes = res.value.likes;
            renderVisitBar();
            audio.play('quest');
            toasts.show(`幫 ${v.name} 的缸按了讚`);
          },
        }, '按讚'),
        h('button.btn', { onclick: () => sheet.open(`送禮給 ${v.name}`, () => giftPanel(friendsDeps, v.name, 20)) }, '送禮'),
        h('button.btn.primary', { onclick: leaveVisit }, '回家'),
      ),
    );
  };
  const visit = async (username: string) => {
    const res = await cloud.visit(username);
    if (!res.ok) return toasts.show(res.message, 'warn');
    if (!res.value.save) return toasts.show(`${username} 還沒有把水缸存到雲端`);
    const parsed = parseSave(JSON.stringify(res.value.save));
    if (!parsed.ok) return toasts.show('讀不出朋友的水缸，可能要先更新遊戲', 'warn');
    // 朋友上次存檔之後的時間也照算，看到的是他的缸現在的樣子
    catchUp(parsed.file);
    const tanks = [parsed.file.state, ...(parsed.file.tanks ?? [])];
    const st = tanks[parsed.file.active ?? 0] ?? tanks[0];
    // 朋友缸裡的 id 和自己的會重複；換到另一段，畫面才不會把朋友的魚當成自己的同一條
    const VISIT_ID = 1_000_000_000;
    for (const f of st.fish) f.id += VISIT_ID;
    for (const p of st.plants) p.id += VISIT_ID;
    st.nextId += VISIT_ID;
    visiting = { name: res.value.username, state: st, likes: res.value.likes };
    sheet.close();
    select(null);
    document.body.classList.add('visiting');
    analytics.track('friend_visit');
    renderVisitBar();
    stage.append(visitBar);
    requestAnimationFrame(() => measure());
  };
  const friendsDeps: FriendsDeps = { cloud, game, sheet, toasts, visit: (name) => void visit(name), openCloud: () => sheet.open('雲端存檔', () => cloudPanel(cloudDeps)) };
  // 推播：關掉遊戲前預測接下來會發生的事，交給伺服器（網頁）或手機（App）到時間提醒
  const notifier = new Notifier(store, isNativeApp() ? nativePlatform() : webPushPlatform(cloud, store));
  const forecaster = new Forecaster();
  let forecastAt = 0;
  let forecastAlerts: sim.ForecastAlert[] = [];
  let pushUser = cloud.session?.username ?? null;
  const refreshForecast = async () => {
    if (!notifier.enabled || visiting) return;
    const at = Date.now();
    forecastAlerts = await forecaster.run(game.tanks, sim.FORECAST_HOURS);
    forecastAt = at;
  };
  const plannedNotices = (): PlannedNotice[] => {
    const list = planNotices(forecastAlerts, notifier.prefs, forecastAt, game.clock.timeScale > 0 ? sim.DEFAULT_TIME_SCALE : 0);
    // App 收不到伺服器的通知，到貨時間自己排（網頁版由伺服器送）
    if (notifier.platform?.kind === 'native' && notifier.prefs.categories.market)
      list.push(...knownArrivals().map((a) => ({ at: a.at, category: 'market' as const, title: "Aquarist's Life", body: `「${a.title}」到貨了，記得對水再放進缸裡`, tag: `arrive-${a.id}` })));
    return list.sort((a, b) => a.at - b.at).slice(0, 20);
  };
  const planPush = async () => {
    if (!notifier.enabled) return;
    const user = cloud.session?.username ?? null;
    if (user !== pushUser) {
      pushUser = user;
      await notifier.refresh();
    }
    await notifier.plan(plannedNotices());
  };
  const marketDeps: MarketDeps = { cloud, game, sheet, toasts, sound: ctx.sound, openCloud: () => sheet.open('雲端存檔', () => cloudPanel(cloudDeps)), syncSave: () => autoUpload(cloudDeps) };
  const mallDeps: MallDeps = marketDeps;
  const checkGifts = async () => {
    if (!cloud.session) return;
    const res = await cloud.gifts();
    if (res.ok && res.value.length > 0)
      toasts.show(`${res.value[0].from}${res.value.length > 1 ? ` 等朋友` : ''}送你禮物`, 'info', { label: '看看', run: () => sheet.open('好友', () => friendsPanel(friendsDeps)) });
  };
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
    const cond = fish?.alive ? sim.fishCondition(game.state, fish) : null;
    // 肖像有快取，同一個外觀拿到的是同一個字串；長大換外觀時卡片跟著換圖
    const pic = fish?.alive ? view.portrait(fish) : null;
    if (!selChanged(fish ? `${fish.id}:${pic?.length}:${fish.alive}:${Math.round(fish.health * 50)}:${Math.round(fish.stress * 50)}:${fishName(fish)}:${cond?.hunger}:${cond?.causes[0]?.key}` : '-')) return;
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
    if (!cond) return;
    const hungry = cond.hunger === 'hungry' || cond.hunger === 'starving';
    // 魚不太舒服、又找得到原因：多一顆有老闆頭像的「為什麼？」，老闆用一句話說原因和怎麼做
    const ask = needsAdvice(cond)
      ? h('button.btn.small.primary.ask-owner', { onclick: () => void ownerSay(causeAdvice(fishName(fish), cond.causes)) }, ownerImg('ask-avatar'), '為什麼？')
      : null;
    selCard.replaceChildren(
      close,
      ...(pic ? [h('img.sel-pic', { src: pic, alt: '', draggable: 'false' })] : []),
      h('div.card-title', {}, title, h(`span.hunger-chip.${cond.hunger}`, {}, HUNGER_LABEL[cond.hunger])),
      h('div.card-sub', {}, sub),
      bar('健康', fish.health, fish.health > 0.6 ? 'ok' : fish.health > 0.3 ? 'warn' : 'bad'),
      bar('壓力', fish.stress, fish.stress < 0.4 ? 'warn' : 'bad'),
      bar('飽足', 1 - cond.hungerValue, hungry ? (cond.hunger === 'starving' ? 'bad' : 'warn') : 'ok'),
      h('div.row', {}, ask, h('button.btn.small', { onclick: () => sheet.open('觀察這條魚', () => fishPanel(ctx, fish.id), { live: true }) }, '詳細')),
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
    onScapeSelect: (target) => scapeBar.select(target),
    onScapeDrop: (target, x) => scapeBar.drop(target, x),
    // 開缸演出（F1-b）：每一步一個音效和一行說明，最後是「你的第一個缸」
    onSetupStep: (step) => {
      if (step === 'done') {
        setupSkip.remove();
        moment('first_tank', { art: 'gear/tank-empty.webp', title: '你的第一個缸', sub: '水注滿、設備也裝好了', owner: '先別急著放魚。倒一瓶硝化菌液，讓水先養個幾天。' });
        guide.start();
        return;
      }
      audio.play(step === 'sand' ? 'feed' : step === 'water' ? 'water' : step === 'gear' ? 'buy' : 'restore');
      // 燈有定時：還沒到開燈時間就說幾點會亮，不說「開燈！」卻是暗的
      const light = game.state.equipment.light;
      toasts.show(step === 'light' && light && !sim.isLightOn(game.state) ? `燈設好定時了，${light.startHour}:00 會亮` : SETUP_CAPTIONS[step]);
    },
  });
  debugHandle.view = view;
  // 開缸演出看過的人可以跳過
  const setupSkip = h('button.setup-skip', { type: 'button', onclick: () => view.skipSetup() }, '跳過 ›');
  const playSetup = () => {
    view.playSetup();
    stage.append(setupSkip);
  };
  // 第一次打開遊戲：從空缸開始演一次開缸
  if (!saved) playSetup();
  // 造景模式（aquascape-editor.md）：底部工具列換成造景操作列，在缸裡拖曳石頭、沉木、水草
  let scaping = false;
  const scapeBar = new ScapeBar({
    game,
    toasts,
    onChange: (edit) => view.setScapeEdit(edit),
    onDone: () => leaveScape(),
  });
  const enterScape = () => {
    if (visiting) return;
    sheet.close();
    select(null);
    scaping = true;
    scapeBar.reset();
    view.setScapeEdit(scapeBar.state);
    document.body.classList.add('scaping');
    stage.append(scapeBar.el);
    requestAnimationFrame(() => measure());
  };
  const leaveScape = () => {
    scaping = false;
    view.setScapeEdit(null);
    document.body.classList.remove('scaping');
    scapeBar.el.remove();
    requestAnimationFrame(() => measure());
  };
  ctx.openScape = enterScape;
  debugHandle.scape = { enter: enterScape, leave: leaveScape, bar: scapeBar };
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
  // 卡頓時自動降一級畫質（玩家自己選過就不動）
  const frameMonitor = new FrameMonitor();
  app.ticker.add(() => {
    if (uiPrefs.qualityManual || !frameMonitor.sample(app.ticker.deltaMS, performance.now())) return;
    const lower = lowerQuality(uiPrefs.quality);
    if (!lower) return;
    setQuality(lower);
    toasts.show(`畫面有點卡，畫質自動調成「${QUALITY_LABELS[lower]}」。可以在設定裡改回來`, 'info');
  });
  app.stage.addChild(view.root);
  // 開發用幀率顯示：設定裡打開，或網址加 ?fps
  const fpsMeter = new FpsMeter();
  const fpsEl = h('div.fps-meter');
  let fpsShown = false;
  let fpsTimer = 0;
  const setShowFps = (on: boolean) => {
    uiPrefs.showFps = on;
    saveUiPrefs();
    fpsShown = on || new URLSearchParams(location.search).has('fps');
    if (fpsShown) document.body.appendChild(fpsEl);
    else fpsEl.remove();
  };
  setShowFps(uiPrefs.showFps);

  // ---- 狀態列：時間、水質膠囊（沒測過顯示「?」）、待辦、選單 ----
  const clockValue = h('span.value');
  const clock = h('div.time', {}, h('span.label', {}, "Aquarist's Life"), clockValue);
  // 時鐘旁的速度按鈕：暫停、正常、快轉（雲端模式只能暫停或正常）
  const speed = new SpeedControl({
    get: () => game.clock.timeScale,
    set: (scale) => {
      game.clock.timeScale = scale;
      save();
    },
    cloud: () => !!cloud.session,
  });
  // 過一晚（F2）：跳到隔天早上 8 點，醒來看早上報告；雲端模式時間跟著伺服器走，不能跳
  const sleepBtn = h('button.sleep-btn', { 'aria-label': '過一晚', title: '過一晚：跳到明天早上 8 點，看昨晚發生了什麼', onclick: () => goNight() }, icon(ICONS.moon), h('span', {}, '過一晚'));
  // 商店開在任務要買的那一頁（買水草的任務就直接是水草）
  const openShop = (tab?: ShopTab) => sheet.open('商店', () => shopPanel(ctx, tab ?? guide.shopTab ?? 'fish'));
  const coinsValue = h('b');
  const coinsBtn = h('button.coins', { 'aria-label': '錢包', title: '錢包：點一下打開商店', onclick: () => openShop() }, h('i.coin'), coinsValue);
  // 拿到錢時金幣飛進錢包（F8）
  ctx.reward = (from, amount) => flyCoins(from, coinsBtn, amount);
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
  // 分缸提示可以點：打開一鍵分缸
  const todoRow = (t: Todo) =>
    t.split
      ? h(`button.todo-item.${t.tone}.split`, { onclick: () => sheet.open('分缸', () => splitPanel(ctx, t.split!)) }, h('img.todo-icon', { src: `${import.meta.env.BASE_URL}art/ui/icon-split.webp`, alt: '' }), t.text)
      : t.snails
        ? h(`button.todo-item.${t.tone}.split`, { onclick: () => sheet.open('螺', () => snailPanel(ctx)) }, h('img.todo-icon', { src: `${import.meta.env.BASE_URL}art/snail/snail-bladder.webp`, alt: '' }), t.text)
        : h(`div.todo-item.${t.tone}`, {}, t.text);
  const todoBadge = h('span.badge');
  const todoCard = h('div.card.glass.todo');
  const todosChanged = memo();
  const renderTodos = () => {
    const list = householdTodos(game.tanks, game.active);
    if (!todosChanged(JSON.stringify(list))) return;
    todoCard.replaceChildren(
      h('button.card-link', { onclick: () => sheet.open('紀錄', () => recordsPanel(ctx, 'events')) }, '紀錄 ›'),
      h('div.card-title', {}, '今日待辦'),
      ...list.slice(0, 3).map(todoRow),
    );
    const urgent = list.filter((t) => t.tone !== 'ok').length;
    todoBadge.textContent = urgent > 0 ? String(urgent) : '';
    todoBadge.classList.toggle('show', urgent > 0);
  };
  const todoSheet = () =>
    h(
      'div.stack',
      {},
      ...householdTodos(game.tanks, game.active).map(todoRow),
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
  const notifySection = (): Node[] => {
    if (!notifier.available)
      return [h('p.hint', {}, isIos() && !isInstalled() ? 'iPhone 要先把遊戲加到主畫面，才收得到通知。' : cloud.available ? '這個瀏覽器收不到通知。' : '通知要等伺服器上線才能用（Android App 版不用等）。')];
    const reopen = () => sheet.open('設定', settings);
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
                void refreshForecast();
              }
              reopen();
            },
          }, '開啟通知'),
      ...(p.enabled
        ? (Object.keys(CATEGORY_LABELS) as (keyof typeof CATEGORY_LABELS)[]).map((c) =>
            h('label.check-row', {}, h('input', { type: 'checkbox', checked: p.categories[c], onchange: (e: Event) => void notifier.setCategory(c, (e.target as HTMLInputElement).checked) }), h('span', {}, CATEGORY_LABELS[c])),
          )
        : []),
      ...(p.enabled && notifier.platform?.kind === 'web' && !cloud.session ? [h('p.hint', {}, '市場和好友的通知要登入雲端存檔才收得到。')] : []),
      ...(p.enabled && notifier.platform?.kind === 'native' ? [h('p.hint', {}, 'App 版目前收得到水缸的提醒和到貨通知；有人買了你的東西、好友送禮，要打開遊戲才看得到。')] : []),
    ];
  };
  const privacySection = () => [
    analytics.available
      ? h(
          'label.check-row',
          {},
          h('input', {
            type: 'checkbox',
            checked: analytics.consent === true,
            onchange: (e: Event) => {
              analytics.setConsent((e.target as HTMLInputElement).checked);
              consentCard.remove();
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
  ];
  // 第一次玩一陣子之後問一次要不要幫忙（不打斷新手引導的第一個畫面）
  const consentCard = h(
    'div.consent-card.glass',
    {},
    h('div', {}, h('b', {}, '幫忙改進遊戲？'), h('div.hint', {}, '回報匿名的遊戲紀錄（例如魚為什麼死掉），讓我們知道哪裡太難。不連到帳號，隨時能在設定裡關掉。')),
    h(
      'div.row',
      {},
      h('button.btn.primary', { onclick: () => answerConsent(true) }, '好'),
      h('button.btn', { onclick: () => answerConsent(false) }, '不要'),
      h('a.btn.ghost', { href: './legal/privacy.html', target: '_blank', rel: 'noopener' }, '詳細說明'),
    ),
  );
  const answerConsent = (on: boolean) => {
    analytics.setConsent(on);
    consentCard.remove();
    if (on) {
      analytics.track('session_start', sessionProps());
      toasts.show('謝謝！可以在設定 › 隱私隨時關掉');
    }
  };
  const sessionProps = () => ({ tanks: game.tanks.length, fish: game.tanks.reduce((n, t) => n + t.fish.filter((f) => f.alive).length, 0), day: Math.floor(game.state.hours / 24) });
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
      h('p.hint', {}, '背景音樂是即時彈奏的慢板指彈吉他，每次都不一樣；晚上關燈後會彈得更輕。音樂和音效的音量可以分開調。'),
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
                  uiPrefs.qualityManual = true;
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
      h('div.item', {}, h('b', {}, '版本'), h('span.owned', {}, __APP_VERSION__)),
      h('p.hint', {}, '燈號除了顏色也用形狀區分：圓形正常、三角形注意、菱形危險。'),
      h('h3', {}, '時間'),
      h('p.hint', {}, '遊戲時間是現實的 7 倍：現實 1 天＝遊戲 1 週，現實 1 小時＝遊戲 7 小時。關掉網頁時時間照常前進，下次打開會補算（最多兩週）。'),
      h('p.hint', {}, '暫停和快轉在主畫面時鐘旁邊的速度按鈕。'),
      h('h3', {}, '存檔'),
      h('div.row', {}, h('button.btn', { onclick: exportSave }, '匯出存檔'), h('button.btn', { onclick: importSave }, '從檔案匯入')),
      h('p.hint', {}, '遊戲每 10 秒自動存檔，每 30 分鐘自動備份一次；存檔壞掉時會自動用備份還原。換手機時可以匯出成檔案帶過去。'),
      h('h3', {}, '雲端存檔'),
      h('button.btn', { onclick: () => sheet.open('雲端存檔', () => cloudPanel(cloudDeps)) }, cloud.session ? `雲端存檔（${cloud.session.username}）` : '登入雲端存檔'),
      h('h3', {}, '通知'),
      ...notifySection(),
      h('h3', {}, '隱私'),
      ...privacySection(),
      // App 版本來就是裝好的，不用顯示安裝說明
      ...(isNativeApp() ? [] : [h('h3', {}, '安裝'), ...installSection()]),
      h('h3', {}, '開發者'),
      h('button.btn', { onclick: () => sheet.open('開發者數值', () => debugPanel(ctx), { live: true }) }, '開發者數值'),
      h('label.check-row', {}, h('input', { type: 'checkbox', checked: uiPrefs.showFps, onchange: (e: Event) => setShowFps((e.target as HTMLInputElement).checked) }), h('span', {}, '顯示幀率（實機量效能用）')),
    );
  const menu = () =>
    h(
      'div.stack',
      {},
      h(
        'div.menu-grid',
        {},
        menuTile('tanks', '我的水缸', '切換、加一缸', () => sheet.open('我的水缸', () => tanksPanel(ctx))),
        menuTile('friends', '好友', '參觀、按讚、送禮', () => sheet.open('好友', () => friendsPanel(friendsDeps))),
        menuTile('market', '市場', '買賣魚蝦和水草', () => sheet.open('市場', () => marketPanel(marketDeps))),
        menuTile('mall', '商城', '點數、特效藥、套缸', () => sheet.open('商城', () => mallPanel(mallDeps))),
        menuTile('codex', '圖鑑', '魚蝦、水草、疾病', () => sheet.open('圖鑑', () => codexPanel(ctx, codexSeen))),
        menuTile('records', '紀錄', '水質趨勢、事件', () => sheet.open('紀錄', () => recordsPanel(ctx))),
        menuTile('guide', '教學', '再聽阿德老闆說一次', () => (sheet.close(), guide.restart())),
        menuTile('settings', '設定', '聲音、顯示、存檔', () => sheet.open('設定', settings)),
      ),
      menuTile(
        'newgame',
        '新遊戲',
        '放棄目前的水缸，從頭開始',
        () => {
          if (!confirm('確定要放棄目前的水缸，重新開始嗎？')) return;
          clearSave(store);
          game.load(newGameState());
          save();
          sheet.close();
          select(null);
          playSetup();
        },
        '.danger',
      ),
    );
  const menuBtn = h('button.hud-btn', { onclick: () => sheet.open('選單', menu), 'aria-label': '選單' }, icon(ICONS.menu));
  hud.classList.add('glass');
  hud.append(clock, speed.el, sleepBtn, coinsBtn, tankBtn, h('span.hud-sep'), caps, todoBtn, menuBtn);

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
    orders: 'icon-orders',
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
  const testBtn = tool('test', '測試', '#a98be8', () => {
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
  tool('shop', '商店', '#ef8a6a', () => openShop());
  tool('gear', '設備', '#e3bd6d', () => sheet.open('設備與維護', () => maintenancePanel(ctx)));
  // 店家訂單（#143）：自己的入口，有能交的單亮綠色數字並發光，有沒看過的新單亮小紅點
  const seenOrders = loadSeenOrders(store);
  const ordersBadge = h('span.badge');
  const ordersBtn = tool('orders', '訂單', '#f0c45a', () => {
    markOrdersSeen(store, seenOrders, game.state);
    sheet.open('客人的訂單', () => ordersPanel(ctx));
  });
  ordersBtn.append(ordersBadge);
  const renderOrders = () => {
    const { ready, fresh } = orderAlert(game.tanks, seenOrders);
    ordersBadge.textContent = ready.length > 0 ? String(ready.length) : '';
    ordersBadge.className = ready.length > 0 ? 'badge ok' : fresh > 0 ? 'badge dot' : 'badge';
    ordersBtn.classList.toggle('glow', ready.length > 0);
    // 別的慶祝卡還在演就等下一輪，免得互相蓋掉
    if (ready.length > 0 && !celebration.isOpen)
      moment('first_order_ready', {
        art: orderArt(ready[0]),
        title: '有訂單可以交貨了！',
        sub: sim.orderTitle(ready[0]),
        owner: '你養的魚有客人要。按下方的「訂單」就能交貨，錢會直接進錢包',
      });
  };
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
  guide.openShop = (tab) => openShop(tab);
  guide.reward = (id, coins) => game.actAll((tanks) => sim.claimQuestReward(tanks[0], id, coins));
  guide.goalsChanged = () => game.actAll(() => undefined);
  const measure = () => {
    const stageRect = stage.getBoundingClientRect();
    const top = hud.getBoundingClientRect().bottom - stageRect.top;
    // 參觀時底部工具列藏起來，改留參觀列的空間
    const bottom = visiting ? visitBar.offsetHeight + 24 : scaping ? scapeBar.el.offsetHeight + 24 : stageRect.bottom - tools.getBoundingClientRect().top;
    view.setInsets({ top: Math.round(top), bottom: Math.round(bottom) });
    // 任務小卡在左上角；浮動選取卡排在它下面，下緣留給左下角的缸名標籤。
    guide.pill.style.top = `${Math.round(top + 10)}px`;
    // 通知讓出任務卡的寬度
    document.body.style.setProperty('--pill-w', guide.pillVisible ? `${guide.pill.offsetWidth + 14}px` : '0px');
    const pillH = guide.pillVisible ? guide.pill.offsetHeight + 8 : 0;
    const dockTop = dock.getBoundingClientRect().top - stageRect.top;
    cardArea = { x: 0, y: top + 10 + pillH, w: stageRect.width, h: Math.max(0, dockTop - top - 10 - pillH - 34) };
    placeSelCard();
    stage.style.setProperty('--dock-top', `${Math.round(stageRect.bottom - dockTop - stageRect.top)}px`);
    document.body.style.setProperty('--dock-top', `${Math.round(stageRect.bottom - dockTop - stageRect.top)}px`);
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
    // 過一晚的時候不跳提示，早上報告會一條一條列出來
    if (game.sleeping) return;
    if (e.type === 'fish_died') {
      const t = game.tanks[tank] ?? game.state;
      const fish = t.fish.find((f) => f.id === e.subjectId);
      analytics.track('fish_died', { cause: e.cause ?? 'unknown', species: fish?.species ?? 'unknown', day: Math.floor(t.hours / 24) });
    }
    audio.play(eventSound(e.type));
    if (e.type === 'fry_born' && (e.count ?? 0) > 0) {
      // 生小魚是大事：跳出慶祝卡，在看的那一缸聚光特寫母魚
      const t = game.tanks[tank] ?? game.state;
      const mom = t.fish.find((f) => f.id === e.subjectId);
      const shrimp = !!mom && sim.isShrimpSpecies(mom.species);
      if (tank === game.active && e.subjectId !== undefined) view.celebrate(e.subjectId);
      const first = firstTime(store, 'first_fry');
      if (first) audio.play('fanfare');
      celebration.show({
        art: fryArt(mom?.species ?? 'guppy'),
        title: `${tankPrefix(tank)}${shrimp ? '孵出' : '生了'} ${e.count} ${shrimp ? '隻小蝦' : '尾小魚'}！`,
        sub: `${mom ? fishName(mom) : '母魚'}當媽媽了。成魚會吃小魚，水草越密越好躲`,
        owner: !first ? undefined : shrimp ? '第一窩小蝦！多放莫絲或水草，小蝦躲得住才長得大。' : '第一胎！小魚長到轉色期才看得出公母，到時候挑尾巴大、顏色亮的留下來配對。',
      });
      return;
    }
    const msg = describeEvent(game.tanks[tank] ?? game.state, e);
    if (msg) toasts.show(tankPrefix(tank) + msg.text, msg.tone);
  });
  // 快轉時出狀況：遊戲已經切回正常速度，提示玩家並給「去處理」（#142）
  const GEAR_CRISES = new Set(['heater_broke', 'heater_stuck', 'heater_exposed', 'controller_cut', 'power_out', 'too_hot', 'too_cold']);
  // ---- 過一晚（F2）的狀態：sleepingNow 是夜幕到報告卡關掉，inSleepCall 只有 game.sleep() 那一下 ----
  let sleepingNow = false;
  let inSleepCall = false;
  game.onCrisis((c) => {
    speed.render();
    // 只有 game.sleep() 那一下不跳：半夜的危機會寫在早上報告卡最上面；報告卡開著時快轉出的事照常提示
    // （game.sleep() 是事件送完、sleeping 設回 false 之後才通知危機，所以用自己的旗子）
    if (inSleepCall) return;
    const fix = GEAR_CRISES.has(c.reason)
      ? {
          label: '去處理',
          run: () => {
            game.switchTo(c.tank);
            sheet.open('設備與維護', () => maintenancePanel(ctx));
          },
        }
      : undefined;
    toasts.show(tankPrefix(c.tank) + crisisText(c), 'warn', fix);
  });
  // 選育成功：自家繁殖的公魚第一次長出沒見過的品系
  const strains = new StrainTracker(store);
  const celebrateStrains = () => {
    const [top, ...rest] = strains.check(game.tanks);
    if (!top) return;
    const p = sim.phenotype(top.fish.genome!);
    const fin = p.bigC ? 'bigC' : p.swallow ? 'swallow' : p.ribbon ? 'ribbon' : p.tailShape === 'halfmoon' ? 'halfmoon' : undefined;
    if (top.tank === game.active) view.celebrate(top.fish.id);
    audio.play('fanfare');
    celebration.show({
      art: guppyArt(sim.lookIndex(p), fin),
      src: view.portrait(top.fish) ?? undefined,
      title: `${tankPrefix(top.tank)}選育成功：${top.name}！`,
      sub: `自家繁殖第 ${top.fish.generation} 代・${sim.GUPPY_RARITY_LABELS[top.rarity]}・店家收購約 ${sim.fishBuybackPrice(top.fish)} 元`,
      owner: strainOwnerLine(top.rarity),
    });
    for (const f of rest) toasts.show(`${tankPrefix(f.tank)}又選出新品系：${f.name}`);
  };
  // ---- 過一晚（F2）：畫面暗下來、跳到早上，醒來一張報告卡 ----

  const reportPicture = (item: ReportItem): string | null => {
    const t = game.tanks[item.tank] ?? game.state;
    const fish = item.subjectId !== undefined ? t.fish.find((f) => f.id === item.subjectId) : undefined;
    if (item.kind === 'birth') return `${import.meta.env.BASE_URL}art/${fryArt(fish?.species ?? 'guppy')}`;
    if (item.kind === 'snails') return `${import.meta.env.BASE_URL}art/snail/snail-bladder.webp`;
    if (fish && fish.alive && (item.kind === 'grown' || item.kind === 'disease')) return view.portrait(fish);
    return null;
  };
  const goReport = (item: ReportItem) => {
    game.switchTo(item.tank);
    switch (item.action) {
      case 'remove_dead':
        netBtn.click();
        break;
      case 'test_water':
        testBtn.click();
        break;
      case 'water_change':
        sheet.open('換水', () => waterChangePanel(ctx));
        break;
      case 'feed':
        sheet.open('餵食', () => feedPanel(ctx));
        break;
      case 'equipment':
        sheet.open('設備與維護', () => maintenancePanel(ctx));
        break;
      case 'orders':
        ordersBtn.click();
        break;
      case 'snails':
        sheet.open('螺', () => snailPanel(ctx));
        break;
      case 'trim':
        sheet.open('修剪水草', () => trimListPanel(ctx));
        break;
      case 'fish':
      case 'treat':
        if (item.subjectId !== undefined) select(item.subjectId);
        break;
    }
  };
  const goNight = () => {
    if (sleepingNow) return;
    // 開缸演出還在演：演完會跳「你的第一個缸」，夜幕會把它蓋掉
    if (view.settingUp) {
      toasts.show('等開缸演完再過夜，也可以先按「跳過」');
      return;
    }
    if (cloud.session) {
      toasts.show('雲端模式的時間跟著伺服器走，不能直接跳過一晚', 'warn');
      return;
    }
    sleepingNow = true;
    // 夜幕蓋著的時候慶祝卡先排隊，報告卡關掉再一張一張演
    celebration.hold();
    sheet.close();
    select(null);
    audio.play('open');
    const shade = h('div.night', { 'aria-hidden': 'true' }, h('span.night-moon'), h('span.night-z', {}, 'z'), h('span.night-z', {}, 'z'), h('span.night-z', {}, 'z'));
    document.body.append(shade);
    requestAnimationFrame(() => shade.classList.add('in'));
    window.setTimeout(() => {
      const before = snapshot(game.tanks);
      inSleepCall = true;
      let r: ReturnType<typeof game.sleep>;
      try {
        r = game.sleep();
      } finally {
        inSleepCall = false;
      }
      // 半夜出狀況：快轉的話切回正常速度，醒來先處理
      if (r.crisis && game.clock.timeScale > sim.DEFAULT_TIME_SCALE) game.clock.timeScale = sim.DEFAULT_TIME_SCALE;
      const report = morningReport(before, game.tanks, r.hours, r.crisis);
      speed.render();
      save();
      analytics.track('sleep', { hours: r.hours, stopped: r.crisis !== null, items: report.items.length });
      shade.classList.add('dawn');
      const card = morningCard(report, { picture: reportPicture, go: goReport }, () => {
        shade.classList.remove('in');
        window.setTimeout(() => shade.remove(), 450);
        sleepingNow = false;
        celebration.release();
      });
      shade.setAttribute('aria-hidden', 'false');
      shade.append(card);
      audio.play(r.crisis ? 'warn' : 'quest');
    }, 900);
  };
  debugHandle.sleep = goNight;
  debugHandle.celebration = celebration;

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
  // 雲端：開遊戲時看看別的裝置有沒有玩過；之後每 10 分鐘和切到背景時自動上傳
  void checkCloudOnStart(cloudDeps).then(checkGifts).then(() => syncMarket(marketDeps)).then(() => syncMall(mallDeps));
  // 市場：賣出的魚自動出貨、貨款入帳、到貨提醒
  setInterval(() => void syncMarket(marketDeps), 60_000);
  // 推播預測：開著遊戲時每 3 分鐘重算一次，關掉時直接用
  void notifier.refresh().then(() => notifier.clear()).then(() => refreshForecast());
  setInterval(() => void refreshForecast(), 3 * 60_000);
  window.addEventListener('pagehide', () => void planPush());
  setInterval(() => void autoUpload(cloudDeps), 10 * 60_000);
  analytics.track('session_start', sessionProps());
  guide.questDone = (step, id) => {
    analytics.track('quest_done', { step });
    if (id === 'cycled')
      moment('cycled', {
        art: 'gear/bottle-bacteria.webp',
        title: '養水完成！',
        sub: '硝化菌長好了，氨和亞硝酸鹽都是 0。現在可以慢慢多加魚',
      });
  };
  setInterval(() => void analytics.flush(), 60_000);
  if (analytics.available && analytics.consent === null) setTimeout(() => stage.append(consentCard), 3 * 60_000);
  // 切到背景時畫面停止更新；回來時以 ×7 補算這段時間，和關掉網頁一樣。
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    audio.setPaused(document.visibilityState === 'hidden');
    if (document.visibilityState === 'hidden') {
      app.ticker.stop();
      hiddenAt = Date.now();
      save();
      void autoUpload(cloudDeps);
      void analytics.flush(true);
      // 先送上次的預測，再用現在的狀態重算一次（頁面還活著的話會換掉）
      void planPush().then(() => refreshForecast()).then(() => planPush());
    } else if (hiddenAt !== null) {
      void notifier.clear();
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
  // 開缸演出播完才開始教學，不然老闆的對話框會擋住整段演出
  if (!view.settingUp) guide.start();
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
      const t0 = performance.now();
      // 模擬用現實經過的時間（elapsedMS 不受 Pixi 每幀 100ms 的上限影響，#113）；動畫用 deltaMS，卡頓時不會跳太大
      tick(ticker.elapsedMS, ticker.deltaMS);
      if (fpsShown) {
        const now = performance.now();
        fpsMeter.add(ticker.deltaMS, now - t0, now);
        if (now - fpsTimer > 500) {
          fpsTimer = now;
          fpsEl.textContent = formatFps(fpsMeter.stats());
        }
      }
    } catch (error) {
      app.ticker.stop();
      crash(error);
    }
  });
  function tick(elapsedMS: number, deltaMS: number) {
    const ticker = { deltaMS };
    // 雲端模式最多 ×7：每幀檢查，登入、讀檔、匯入、從雲端下載後都會套到（#112）
    game.clock.timeScale = cloudTimeScale(game.clock.timeScale, !!cloud.session);
    game.advance(elapsedMS);
    if (visiting) {
      const n = Math.min(visitClock.advance(elapsedMS), 60);
      for (let i = 0; i < n; i++) sim.step(visiting.state);
    }
    view.update(visiting?.state ?? game.state, ticker.deltaMS / 1000);

    clockValue.textContent = `${clockLabel(game.state.hours)}${game.clock.timeScale === 0 ? '・暫停' : ''}`;
    speed.render();
    netBtn.classList.toggle('alert', game.state.fish.some((f) => !f.alive));

    // 每半秒更新一次卡片與數值。用現實經過的時間：deltaMS 每幀最多只算 100ms，
    // 畫面很卡時會變成好幾秒才更新一次（任務、待辦、金幣跟著慢；新手任務流程測試在 CI 上因此卡住）
    refreshTimer += elapsedMS;
    if (refreshTimer > 500) {
      refreshTimer = 0;
      for (const t of game.tanks) applySeason(t);
      if (sheet.isLive) sheet.refresh();
      renderSelCard();
      placeSelCard();
      renderTodos();
      renderCaps();
      renderCoins();
      renderOrders();
      renderTankChip();
      guide.update(game.state, game.tanks);
      celebrateStrains();
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

  void loadPaintedArt();
}

start();
