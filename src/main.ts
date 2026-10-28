import { GlApplication } from './render/gl-app';
import { introReady, whenIntroDone } from './intro';
import { LazyAudio } from './audio/lazy-audio';
import { loadAudioSettings, saveAudioSettings, type AudioSettings } from './audio/settings';
import { eventSound, type SoundId } from './audio/sounds';
import { applySeason, blankGameState, Game } from './game/game';
import { crisisText } from './game/crisis';
import type { SettingsDeps } from './ui/settings-panel';
import { browserStore, catchUp, clearSave, loadSave, parseSave, serializeSave, writeSave } from './game/save';
import { catchUpSave } from './game/catchup-runner';
import { menuTile, ownerImg } from './ui/art-icons';
import { cloudTimeScale, SpeedControl } from './ui/speed-control';
import { installCrashGuard, showStartupError } from './ui/crash';
import { Analytics } from './net/analytics';
import { isNativeApp, saveTextFile } from './ui/native';
import { CloudClient } from './net/cloud';
import { FEATURES } from './features';
// 雲端、好友、市場、商城在 MVP 是藏起來的（features.ts）：只引入型別，程式用到時才載入，不算進主程式
import type { CloudPanelDeps } from './ui/cloud-panel';
import type { FriendsDeps } from './ui/friends-panel';
import type { MarketDeps } from './ui/market-panel';
import type { MallDeps } from './ui/mall-panel';
import { nativePlatform, Notifier, planNotices, webPushPlatform, type PlannedNotice } from './net/push';
import { Forecaster } from './game/forecaster';
import { setupPwa } from './ui/pwa';
import { loadPaintedArt, startupArt } from './render/painted';
import { FrameMonitor, lowerQuality } from './game/frame-monitor';
import { FpsMeter, formatFps } from './game/fps-meter';
import { defaultQuality, isQuality, type Quality, QUALITY_LABELS, qualitySpec } from './render/quality';
import { TankView } from './render/tank-view';
import { SETUP_CAPTIONS, SETUP_ORDER, SETUP_PROMPTS, type SetupStep } from './render/setup-show';
import type { ScapeBar } from './ui/scape-bar';
import * as sim from './sim';
import { FISH_SPECIES, isFilterRunning, isLightOn, removeDeadFish, useTestKit } from './sim';
import { h } from './ui/dom';
import { keeperRibbon } from './ui/keeper-ribbon';
import { ICONS } from './ui/icons';
import { DEATH_ADVICE, describeEvent, FIRST_PESTS_LINE, firstDeathOwnerLine, fishName, fishStrain, pluralEventText } from './ui/labels';
import { mergeEventToasts, type EventToast } from './ui/notify-gate';
import { personaChip } from './ui/persona';
import { dreamCard, dreamStrip } from './ui/dream-card';
import { openingHud, type OpeningHud } from './ui/opening-hud';
import { DAILY_SHORT, dailyArt, dailyCard, dailyDoneText } from './ui/daily-card';
import type { PanelContext, ShopTab } from './ui/panels';
import { Guide } from './ui/guide';
import { questTray } from './ui/quest-tray';
import { FIRST_PESTS_TIP, FIRST_TANK_LINE } from './ui/tutorial';
import { Celebration, type CelebrateSpec } from './ui/celebrate';
import { firstTime, loadMoments, type DeathAdviceCause, type MomentId } from './ui/moments';
import { causeAdvice, HUNGER_LABEL, illnessOf, needsAdvice } from './ui/owner-advice';
import { kickOwnerQueue, ownerGuide, ownerSay, setOwnerBlocker } from './ui/owner-ask';
import { fryArt, guppyArt, maleFinOf, plantArt } from './ui/shop-cards';
import { StrainTracker, strainOwnerLine } from './ui/strain-moment';
import { loadSeenOrders, markOrdersSeen, orderAlert, orderArt, orderReadyWhat } from './ui/order-alert';
import { TankMarks } from './ui/tank-marks';
import type { ReportItem } from './ui/morning-report';
import { loadCodexSeen, saveCodexSeen } from './ui/codex-seen';
import { Sheet, Toasts, actionLive } from './ui/sheet';
import { capsSummary, clockLabel, householdTodos, waterCapsules, type Todo } from './ui/status';
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

  const app = new GlApplication();
  // 聲音合成引擎另外一包，跟 Pixi 初始化、存檔、圖片同時在背景下載（不佔入口大小，第一次點擊前也還不能出聲）
  const audioEngine = import('./audio/engine');
  audioEngine.catch(() => {}); // 載不到（網頁版離線）就沒有聲音，不算當機
  // 讀取存檔
  const store = browserStore();
  const loaded = loadSave(store);
  if (loaded.file) for (const t of [loaded.file.state, ...(loaded.file.tanks ?? [])]) applySeason(t);
  // 開機要等的三件事同時做（G6）：Pixi 初始化、下載這些缸畫得到的圖（Issue #81，其他的等主畫面出來後在背景載）、
  // 補算離開期間的時間（離開久的在背景執行緒算，見 catchUpSave）
  const before = loaded.file ? [loaded.file.state, ...(loaded.file.tanks ?? [])] : [];
  const [, , caught] = await Promise.all([
    app.init({ resizeTo: stage, backgroundAlpha: 0, antialias: true, resolution: Math.min(2, window.devicePixelRatio), autoDensity: true }),
    loadPaintedArt(startupArt(before)),
    loaded.file ? catchUpSave(loaded.file) : null,
  ]);
  stage.appendChild(app.canvas);
  const saved = caught?.file ?? null;
  const offline = caught?.offline ?? null;
  const game = new Game(saved?.state ?? blankGameState(), saved?.timeScale ?? 7, saved?.tanks ?? [], saved?.active ?? 0);
  for (const t of game.tanks) applySeason(t);
  // 補算期間才出現的（生了小魚、長出螺）和新遊戲的缸再補載，已經載過的不會重載
  await loadPaintedArt(startupArt(game.tanks));
  const extraTanks = () => ({ tanks: game.tanks.slice(1), active: game.active });
  const save = () => writeSave(store, game.tanks[0], game.clock.timeScale, Date.now(), extraTanks());
  // 開發用：在瀏覽器主控台用 cycle.game、cycle.sim 直接操作（截圖、調平衡）；流程測試也靠它。
  // sim 整包延後載入（不直接掛 sim 命名空間，不然沒用到的 export 全進開機必載），載好才掛 window.cycle
  const debugHandle = { game } as Record<string, unknown>;
  void import('./sim/debug-handle').then((all) => {
    debugHandle.sim = all;
    (window as unknown as { cycle: unknown }).cycle = debugHandle;
  });
  const sheet = new Sheet(document.body);
  const toasts = new Toasts(document.body);
  debugHandle.toasts = toasts;
  const celebration = new Celebration(document.body);
  /** 開缸演出到「你的第一個缸」卡片關掉之前，老闆先不開口（#171）。 */
  let guideHeld = false;
  /** 「第一次」的演出：慶祝卡＋撥弦琶音，每件事只演一次。 */
  const moment = (id: MomentId, spec: CelebrateSpec): boolean => {
    if (!firstTime(store, id)) return false;
    audio.play('fanfare', false);
    celebration.show(spec);
    return true;
  };
  // 聲音：瀏覽器要等第一次點擊才能出聲
  let audioSettings = loadAudioSettings(store);
  const audio = new LazyAudio(audioSettings);
  void audio.load(() => audioEngine);
  // 震動只跟著玩家的動作（模擬觸發的音效只出聲）
  document.addEventListener('pointerdown', () => (audio.unlock(), audio.noteInput()), { capture: true });
  document.addEventListener('keydown', () => (audio.unlock(), audio.noteInput()), { capture: true });
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
    const until = performance.now() + 60_000;
    toasts.show(text, tone, {
      label: '復原',
      // 復原是把整缸換回操作前的樣子：隔太久再按會把這段時間發生的事一起抹掉，只給 1 分鐘（#273）
      until,
      run: () => {
        // 通知匣開著放超過 1 分鐘才按：按鈕還在，但不復原（架構審查 #277）
        if (performance.now() >= until) {
          toasts.show('已經超過 1 分鐘，不能復原了', 'warn');
          return;
        }
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
  // 雲端存檔：功能開關打開、又有設定伺服器網址（VITE_API_URL）才開放；關著時市場、好友、商城的同步都不會動
  const cloud = new CloudClient(FEATURES.cloudSave ? import.meta.env.VITE_API_URL : undefined, store);
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
  // 這幾個介面拆成另外的檔案，用到才載入（主程式 gzip 有 300 KB 上限，見 scripts/check-assets.mjs）
  // 網頁版離線時第一次打開會載不到：提示一聲就停在這裡，不讓它變成當機畫面
  const lazyUi =
    <T,>(load: () => Promise<T>) =>
    () =>
      load().catch(() => {
        toasts.show('載入失敗，連上網路後重新整理再試一次', 'warn');
        return new Promise<T>(() => {});
      });
  const cloudUi = lazyUi(() => import('./ui/cloud-panel'));
  const friendsUi = lazyUi(() => import('./ui/friends-panel'));
  const mallUi = lazyUi(() => import('./ui/mall-panel'));
  const loadMarket = lazyUi(() => import('./ui/market-panel'));
  const settingsUi = lazyUi(() => import('./ui/settings-panel'));
  // 面板、紀錄、圖鑑、早上報告：開機後閒下來就在背景載好（見檔尾 prefetchDeferred），載好之後照舊同步打開
  const importDeferred = () => import('./ui/deferred-ui');
  type DeferredUi = Awaited<ReturnType<typeof importDeferred>>;
  let deferredUi: DeferredUi | null = null;
  const loadDeferred = lazyUi(importDeferred);
  /** 載好了就馬上做（跟原本一樣同步）；還沒載好（剛開機就點）就等載完再做。 */
  const withPanels = (run: (p: DeferredUi) => void) => {
    if (deferredUi) run(deferredUi);
    else
      void loadDeferred().then((p) => {
        deferredUi = p;
        run(p);
      });
  };
  // 還沒載好時連點好幾個面板，只打開最後點的那個（不要載完後一層層疊出來）
  let sheetRequest = 0;
  const panelSheet = (title: string, render: (p: DeferredUi) => Node, options?: { live?: boolean; pinned?: boolean }) => {
    const request = ++sheetRequest;
    withPanels((p) => {
      if (request === sheetRequest) sheet.open(title, () => render(p), options);
    });
  };
  /** 自動餵食器：先打開商品卡，按「買下裝上」才扣錢（daily-loop.md §7）。 */
  const offerFeeder = (tank: number) =>
    panelSheet('自動餵食器', (p) =>
      p.feederOffer({
        buy: () => {
          sheet.close();
          const why = game.actAll((tanks) => sim.buyFeeder(tanks, tank));
          toasts.show(why ?? `${sim.tankLabel(game.tanks, tank)}的自動餵食器${sim.feederInstalledText(2)}`, why ? 'warn' : 'info');
        },
        close: () => sheet.close(),
      }),
    );
  /** 特效（金幣飛進錢包）也在那包裡：載好了馬上演；還沒載好就等載完再演，載不到就不演，不跳提示。 */
  const withEffects = (run: (p: DeferredUi) => void) => {
    if (deferredUi) run(deferredUi);
    else
      void importDeferred().then(
        (p) => run((deferredUi ??= p)),
        () => {},
      );
  };
  /** 背景先載：失敗（網頁版離線）不吵，真的要打開時再提示。 */
  const prefetchDeferred = () =>
    void importDeferred().then(
      (p) => (deferredUi ??= p),
      () => {},
    );
  /** 市場載入過才會有在路上的貨（App 版排到貨通知用）。 */
  let marketMod: Awaited<ReturnType<typeof loadMarket>> | null = null;
  const marketUi = async () => (marketMod ??= await loadMarket());
  const openCloud = () => void cloudUi().then((m) => sheet.open('雲端存檔', () => m.cloudPanel(cloudDeps)));
  const openFriends = () => void friendsUi().then((m) => sheet.open('好友', () => m.friendsPanel(friendsDeps)));
  // 背景同步：雲端沒開或沒登入時這些本來就什麼都不做（伺服器網址沒設時每個請求都直接回 unavailable），先檢查就不用載入
  const autoUpload = async () => (cloud.available && cloud.session ? (await cloudUi()).autoUpload(cloudDeps) : false);
  const checkCloudOnStart = async () => {
    if (cloud.available && cloud.session) await (await cloudUi()).checkCloudOnStart(cloudDeps);
  };
  const syncMarket = async () => (cloud.available && cloud.session ? (await marketUi()).syncMarket(marketDeps) : null);
  const syncMall = async () => {
    if (cloud.available && cloud.session) await (await mallUi()).syncMall(mallDeps);
  };
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
        h('button.btn', { onclick: () => void friendsUi().then((m) => sheet.open(`送禮給 ${v.name}`, () => m.giftPanel(friendsDeps, v.name, 20))) }, '送禮'),
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
  const friendsDeps: FriendsDeps = { cloud, game, sheet, toasts, visit: (name) => void visit(name), openCloud };
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
      list.push(...(marketMod?.knownArrivals() ?? []).map((a) => ({ at: a.at, category: 'market' as const, title: "Aquarist's Life", body: `「${a.title}」到貨了，記得對水再放進缸裡`, tag: `arrive-${a.id}` })));
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
  const marketDeps: MarketDeps = { cloud, game, sheet, toasts, sound: ctx.sound, openCloud, syncSave: autoUpload };
  const mallDeps: MallDeps = marketDeps;
  ctx.useMall = async (item, apply, refusal) => (await mallUi()).useMallItem(mallDeps, item, apply, refusal);
  const checkGifts = async () => {
    if (!cloud.session) return;
    const res = await cloud.gifts();
    if (res.ok && res.value.length > 0)
      toasts.show(`${res.value[0].from}${res.value.length > 1 ? ` 等朋友` : ''}送你禮物`, 'info', { label: '看看', run: openFriends });
  };
  // 可安裝的 App：有新版時提示重新整理（先存檔）
  setupPwa((apply) => toasts.show('有新版本了', 'info', { label: '更新', run: () => (save(), apply()) }));
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
    if (!selChanged(fish ? `${fish.id}:${pic?.length}:${fish.alive}:${Math.round(fish.health * 50)}:${Math.round(fish.stress * 50)}:${fishName(fish)}:${cond?.hunger}:${cond?.causes[0]?.key}:${!!fish.keeper}:${Math.round(fish.pregnancy * 50)}` : '-')) return;
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
      selCard.replaceChildren(close, h('div.card-title', {}, title), h('div.card-sub', {}, sub), h('p.dead', {}, '已經死了'), h('button.btn.small.primary', { onclick: () => panelSheet('死掉的魚', (p) => p.fishPanel(ctx, fish.id), { live: true }) }, '看原因'));
      return;
    }
    if (!cond) return;
    const hungry = cond.hunger === 'hungry' || cond.hunger === 'starving';
    const belly = sim.bellyText(game.state, fish);
    // 魚不太舒服、又找得到原因：多一顆有老闆頭像的「為什麼？」，老闆用一句話說原因和怎麼做
    const ask = needsAdvice(cond) || illnessOf(fish)
      ? h('button.btn.small.primary.ask-owner', { onclick: () => void ownerSay(causeAdvice(fishName(fish), cond.causes, fish), undefined, undefined, true) }, ownerImg('ask-avatar'), '為什麼？')
      : null;
    selCard.replaceChildren(
      close,
      ...(pic ? [h('img.sel-pic', { src: pic, alt: '', draggable: 'false' })] : []),
      h('div.card-title', {}, title, fish.keeper ? keeperRibbon() : null, h(`span.hunger-chip.${cond.hunger}`, {}, HUNGER_LABEL[cond.hunger])),
      h('div.card-sub', {}, sub, personaChip(fish)),
      bar('健康', fish.health, fish.health > 0.6 ? 'ok' : fish.health > 0.3 ? 'warn' : 'bad'),
      bar('壓力', fish.stress, fish.stress < 0.4 ? 'warn' : 'bad'),
      bar('飽足', 1 - cond.hungerValue, hungry ? (cond.hunger === 'starving' ? 'bad' : 'warn') : 'ok'),
      // 懷孕的母魚：任務卡叫玩家「點她看看肚子」，卡上就要看得到肚子（g35）
      ...(belly ? [h('p.sel-belly', {}, belly)] : []),
      h('div.row', {}, ask, h('button.btn.small', { onclick: () => panelSheet('觀察這條魚', (p) => p.fishPanel(ctx, fish.id), { live: true }) }, '詳細')),
    );
  };
  const select = (id: number | null) => {
    selected = id;
    // 點魚看看、點蝦看看，點到目標題的那尾（最快轉色的、種魚、懷孕的母魚、紅眼睛的小魚）也算
    if (id !== null) sim.markDailyFish(game.tanks, id);
    // 比一比只點了一尾：提示再點另一尾才算（g25）
    const partner = id === null ? null : sim.comparePartner(game.tanks, id);
    // 另一尾在這缸就讓牠亮一下，不然玩家看不出編號是哪尾（g26）；在別缸就說是哪一缸
    const here = partner && game.state.fish.includes(partner);
    if (partner && here) view.spotlight('fish', partner.id);
    if (partner) toasts.show(here ? '再點另一尾發亮的，比一比誰的顏色深' : `再到${sim.tankLabel(game.tanks, game.tanks.findIndex((t) => t.fish.includes(partner)))}點${fishName(partner)}，比一比誰的顏色深`);
    const picked = id === null ? undefined : game.state.fish.find((f) => f.id === id);
    if (picked) sim.noteBellySeen(picked);
    view.selectFish(id);
    selCard.classList.toggle('open', id !== null);
    renderSelCard();
    if (id !== null) requestAnimationFrame(() => placeSelCard());
  };
  debugHandle.select = select;

  const view = new TankView(app, {
    // 點到魚、螺、水草：沒有音效，手機上給一下短震動（G1）
    onSelectFish: (id) => (id !== null && audio.buzz('tap'), select(id)),
    // 在缸裡點到螺：打開螺的面板（每日小事「找到螺點一下」也就做完了）
    onTapSnail: () => (audio.buzz('tap'), panelSheet('螺', (p) => p.snailPanel(ctx))),
    onSelectPlant: (id) => {
      audio.buzz('tap');
      sim.markDaily(game.tanks, 'plant');
      panelSheet('水草', (p) => p.plantPanel(ctx, id), { live: true });
    },
    onScapeSelect: (target) => scapeBar?.select(target),
    onScapeDrop: (target, x) => scapeBar?.drop(target, x),
    // 手指餵食（F6）：撒下去的第一口被誰吃到，在那尾魚頭上浮一行小字，看得出誰貪吃
    onFeedTap: () => onFeedTap(),
    onFirstBite: (id) => {
      const fish = game.state.fish.find((f) => f.id === id);
      if (!fish || game.state.fish.filter((f) => f.alive && !sim.isShrimpSpecies(f.species)).length < 2) return;
      const pos = view.fishScreenPos(id);
      if (!pos) return;
      // 魚在水面搶食，頭上的空間常被狀態列蓋住：太靠上就放在魚的下面
      const hudBottom = hud.getBoundingClientRect().bottom - stage.getBoundingClientRect().top;
      const below = pos.y < hudBottom + 56;
      const tag = h(`div.bite-tag${below ? '.below' : ''}`, { 'aria-hidden': 'true' }, `${sim.personalitySpec(fish).label}的 ${fishName(fish)} 搶到第一口`);
      tag.style.left = `${Math.round(Math.max(90, Math.min(stage.clientWidth - 90, pos.x)))}px`;
      tag.style.top = `${Math.round(pos.y)}px`;
      stage.append(tag);
      window.setTimeout(() => tag.remove(), 2400);
    },
    // 開缸（F1-b，mvp.md §4.4.4）：玩家每做完一步，提示換下一步；開機做完是「你的第一個缸」
    onSetupStep: (_finished, next) => {
      if (next !== 'done') return renderSetupPrompt();
      // 開機做完：時間從這時開始走，第一天的小事、待辦也從這時才出（#204）
      game.act((s) => sim.powerOn(s));
      save();
      setupPrompt.remove();
      document.body.classList.remove('setting-up');
      moment('first_tank', { art: 'gear/tank-empty.webp', title: '你的第一個缸', sub: '水注滿、設備也開機了', owner: FIRST_TANK_LINE });
      // 「你的第一個缸」卡片關掉後老闆才開口，不然對話框會從卡片後面露出來（#171）
      celebration.whenClear(() => {
        guideHeld = false;
        toasts.release();
        guide.start(game.state);
      });
    },
  });
  debugHandle.view = view;
  // 開缸 4 步的提示列：進度點＋一顆大按鈕。點缸裡任何地方也算（注水要按住，放開就停）；演出中再點一下跳到這步結尾
  const setupDots = h('div.setup-dots');
  const setupLabel = h('span.setup-label');
  const setupBtn4 = h('button.btn.primary.setup-go', { type: 'button' }, setupLabel);
  const setupPrompt = h('div.setup-prompt', {}, setupDots, setupBtn4);
  const SETUP_SOUND: Record<SetupStep, SoundId> = { sand: 'feed', gear: 'buy', water: 'water', power: 'restore' };
  const renderSetupPrompt = () => {
    const step = view.setupStep;
    if (!step || step === 'done') return;
    const at = SETUP_ORDER.indexOf(step);
    setupDots.replaceChildren(...SETUP_ORDER.map((_, i) => h(`i${i < at ? '.on' : i === at ? '.now' : ''}`)));
    const waiting = view.setupWaiting;
    setupLabel.textContent = waiting ? SETUP_PROMPTS[waiting] : step === 'water' ? '注水中…放開就停' : `${SETUP_CAPTIONS[step]}…（點一下加速）`;
    setupPrompt.classList.toggle('waiting', !!waiting);
    setupPrompt.dataset.step = step;
  };
  const setupPress = () => {
    const step = view.setupStep;
    if (!step || step === 'done') return;
    // 開場還在淡出（約 0.7 秒）時點到的只是要跳過動畫，不算倒沙（#371）
    if (document.getElementById('intro')) return;
    // 動手倒沙：收起夢想魚小卡，那行字換成下一步；打開挑設備面板時整個收起（§8.1）
    if (step === 'sand') {
      welcomeHud?.closeDream();
      welcomeHud?.setLine('鋪好沙以後，點一下裝上設備');
    } else {
      welcomeHud?.close();
      welcomeHud = null;
    }
    if (step === 'gear' && view.setupWaiting && sim.needsSetup(game.state)) return openGearPicker();
    if (view.setupPress()) {
      audio.play(SETUP_SOUND[step]);
      // 燈有定時：還沒到開燈時間就說幾點會亮，不說「開機！」卻是暗的
      const light = game.state.equipment.light;
      toasts.showNow(step === 'power' && light && !sim.isLightOn(game.state) ? `開機了！燈設好定時，${light.startHour}:00 會亮` : SETUP_CAPTIONS[step]);
    }
    renderSetupPrompt();
  };
  const setupRelease = () => {
    view.setupRelease();
    renderSetupPrompt();
  };
  for (const el of [setupBtn4, stage]) {
    el.addEventListener('pointerdown', (e) => {
      if (!view.settingUp) return;
      e.preventDefault();
      setupPress();
    });
  }
  // 鍵盤：Enter／空白鍵在按鈕上按下等於點一下（注水照樣要按住）
  setupBtn4.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && view.settingUp) {
      e.preventDefault();
      setupPress();
    }
  });
  setupBtn4.addEventListener('keyup', (e) => (e.key === 'Enter' || e.key === ' ') && view.settingUp && setupRelease());
  window.addEventListener('pointerup', () => view.settingUp && setupRelease());
  window.addEventListener('pointercancel', () => view.settingUp && setupRelease());
  const playSetup = () => {
    guideHeld = true;
    // 開缸時其他通知（今天的小事、畫質自動調整…）先排隊，「你的第一個缸」關掉再跳（#199）。
    // 開缸 4 步等玩家動手，多久都可能，不設保險：開機做完一定會走到 whenClear 放出來（重新整理會從倒沙重來）
    toasts.hold(0);
    view.playSetup();
    // 演出時只留缸：上方列、任務卡、工具列先藏起來（#171）
    document.body.classList.add('setting-up');
    document.body.append(setupPrompt);
    renderSetupPrompt();
  };
  // 開缸演出（F1-b）在挑完設備、按下「開缸」後才演（見 openSetup）
  // 造景模式（aquascape-editor.md）：底部工具列換成造景操作列，在缸裡拖曳石頭、沉木、水草
  let scaping = false;
  // 造景操作列跟其他面板一起延後載入（ui/deferred-ui.ts，開機閒下來就先載好）；第一次進造景模式才建立
  let scapeBar: ScapeBar | null = null;
  const makeScapeBar = (p: DeferredUi) =>
    new p.ScapeBar({
      game,
      toasts,
      onChange: (edit) => view.setScapeEdit(edit),
      onDone: () => leaveScape(),
      openShop: (tab) => (leaveScape(), openShop(tab)),
      onDrop: () => {
        if (placingNew) {
          placingNew = false;
          window.setTimeout(() => scaping && leaveScape(), 700);
        }
        if (!scapeCoach) return;
        firstTime(store, 'first_scape_drag');
        stopCoach();
      },
    });
  // 造景引導（F1-c）：第一次進造景模式，一隻手在石頭（或水草）上左右比劃「按住拖拖看」，拖過一次就不再出現
  let scapeCoach: { el: HTMLElement; raf: number } | null = null;
  const stopCoach = () => {
    if (!scapeCoach) return;
    cancelAnimationFrame(scapeCoach.raf);
    scapeCoach.el.remove();
    scapeCoach = null;
  };
  const startCoach = (text?: string) => {
    // 剛買來要擺的（text）每次都比劃；一般進造景模式只有第一次
    if (scapeCoach || (!text && loadMoments(store).has('first_scape_drag'))) return;
    const el = h('div.scape-coach', { 'aria-hidden': 'true' }, h('span.scape-coach-hand'), h('span.scape-coach-text', {}, text ?? '按住，左右拖拖看'));
    stage.append(el);
    const coach = { el, raf: 0 };
    const follow = () => {
      const pos = view.scapeHintPos();
      el.hidden = !pos;
      if (pos) {
        el.style.left = `${Math.round(pos.x)}px`;
        el.style.top = `${Math.round(pos.y)}px`;
      }
      coach.raf = requestAnimationFrame(follow);
    };
    follow();
    scapeCoach = coach;
  };
  /** 剛買的拿在手上：放下去就自動收起造景模式，不用再按「完成」（#235）。 */
  let placingNew = false;
  /** then：進了造景模式之後要做的事（操作列還沒載好時，等載好再一起做）。 */
  const enterScape = (then?: (bar: ScapeBar) => void) => {
    if (visiting) return;
    withPanels((p) => {
      if (visiting) return;
      const bar = (scapeBar ??= makeScapeBar(p));
      placingNew = false;
      sheet.close();
      select(null);
      scaping = true;
      bar.reset();
      view.setScapeEdit(bar.state);
      document.body.classList.add('scaping');
      stage.append(bar.el);
      requestAnimationFrame(() => measure());
      startCoach();
      then?.(bar);
    });
  };
  const leaveScape = () => {
    scaping = false;
    view.setScapeEdit(null);
    document.body.classList.remove('scaping');
    scapeBar?.el.remove();
    stopCoach();
    requestAnimationFrame(() => measure());
  };
  ctx.openScape = () => enterScape();
  /** 每日小事的造景題（g13）：進造景模式就先選好一樣東西，不用在缸裡一格一格試點。 */
  const enterScapeOn = (prefer: 'plant' | 'stone') =>
    enterScape((bar) => {
      const st = game.state;
      const stone = (st.equipment.hardscape ?? []).length > 0 ? ({ kind: 'hardscape', index: 0 } as const) : null;
      const plant = st.plants[0] ? ({ kind: 'plant', id: st.plants[0].id } as const) : null;
      const target = prefer === 'plant' ? (plant ?? stone) : (stone ?? plant);
      if (target) bar.focus(target);
    });
  // 剛買的石頭、水草（P4）：不是馬上種好，而是拿在手上，拖到缸裡想擺的位置放開
  ctx.placeNew = (target) =>
    enterScape((bar) => {
      stopCoach();
      placingNew = true;
      bar.focus(target);
      startCoach(target.kind === 'plant' ? '拖到想種的位置，放開就種下' : '拖到想擺的位置');
    });
  // 手指餵食（P5）：按「餵食」進餵食模式，點水面哪裡飼料就從哪裡撒下去，魚過去搶；種類、等級收進「進階」
  let feedingMode = false;
  let fedThisRound = 0;
  /** 缸裡沒吃完的飼料已經超過一餐半（核心 tapFeed 的 overfed）。 */
  let overfed = false;
  const feedDots = h('span.feed-dots', { 'aria-hidden': 'true' });
  const feedSay = h('span.feed-say', {}, '點水面撒飼料');
  let feedDoneTimer = 0;
  const leaveFeeding = () => {
    window.clearTimeout(feedDoneTimer);
    if (!feedingMode) return;
    feedingMode = false;
    // 有撒到：別缸餓了就一起餵一餐，畫面不跳缸（#325）
    if (fedThisRound > 0 && game.tanks.length > 1) {
      const fed = game.actAll((tanks) => sim.feedOtherTanks(tanks, game.active, game.state.feedPlan));
      if (fed.length > 0) toasts.show(`${fed.map((i) => sim.tankLabel(game.tanks, i)).join('、')}也一起餵了`);
    }
    view.setFeedMode(false);
    document.body.classList.remove('feeding');
    feedBar.remove();
  };
  const renderFeedBar = () => {
    // 一餐分三下撒：三個點填滿就夠了，再撒會剩在缸底
    const taps = Math.round(fedThisRound * 3);
    feedDots.replaceChildren(...[0, 1, 2].map((i) => h(`i${i < taps ? '.on' : ''}`)), ...(taps > 3 ? [h('b', {}, `+${taps - 3}`)] : []));
    feedBar.classList.toggle('over', overfed);
    feedSay.textContent = overfed ? '吃不完的會沉底爛掉' : taps === 0 ? '點水面撒飼料' : taps < 3 ? '再撒一點' : '這一餐夠了';
  };
  const feedBar = h(
    'div.feed-bar.glass',
    {},
    h('img.feed-bar-art', { src: `${import.meta.env.BASE_URL}art/ui/icon-feed.webp`, alt: '', draggable: 'false' }),
    feedSay,
    feedDots,
    h('button.btn.small', { onclick: () => (leaveFeeding(), panelSheet('餵食', (p) => p.feedPanel(ctx))) }, '進階'),
    h('button.btn.small.primary', { onclick: () => leaveFeeding() }, '好了'),
  );
  const startFeeding = () => {
    if (feedingMode) return leaveFeeding();
    // 停在還沒放魚的新缸：切到有魚、最餓的那缸去餵（#315）
    const target = sim.feedTarget(game.tanks, game.active);
    if (target !== game.active) {
      if (scaping) leaveScape();
      game.switchTo(target);
      toasts.show(`這缸還沒有魚，切到${sim.tankLabel(game.tanks, target)}餵`);
    }
    // 沒有魚：面板會說要先去買魚
    if (!game.state.fish.some((f) => f.alive)) return panelSheet('餵食', (p) => p.feedPanel(ctx));
    if (scaping) leaveScape();
    sheet.close();
    select(null);
    feedingMode = true;
    fedThisRound = 0;
    overfed = false;
    view.setFeedMode(true);
    document.body.classList.add('feeding');
    renderFeedBar();
    stage.append(feedBar);
  };
  // 面板那包通常開機後就載好了，這時是同步的；剛開機就點的話等載完才撒
  const onFeedTap = () =>
    withPanels((p) => {
      if (!feedingMode) return;
      const got = p.feedTap(ctx);
      if (!got) return leaveFeeding();
      fedThisRound += sim.TAP_FEED_MEALS;
      overfed = got.overfed;
      renderFeedBar();
      // 三個點滿了（「這一餐夠了」）就自己收，不用按「好了」（#257）；再撒一下就重新計時
      window.clearTimeout(feedDoneTimer);
      if (Math.round(fedThisRound * 3) >= 3) feedDoneTimer = window.setTimeout(() => leaveFeeding(), 1800);
    });
  sheet.onOpen = () => (leaveFeeding(), document.body.classList.remove('watching'), toasts.clear());
  debugHandle.feeding = { start: startFeeding, leave: leaveFeeding };
  debugHandle.scape = { enter: enterScape, leave: leaveScape, get bar() {
    return scapeBar;
  } };
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
    toasts.show(`畫面有點卡，畫質調成「${QUALITY_LABELS[lower]}」`, 'info');
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
  const sleepBtn = h('button.sleep-btn', { 'aria-label': '過一晚', title: '過一晚：跳到明天早上 8 點，看昨晚發生了什麼', onclick: () => goNight() }, icon(ICONS.moon), h('span.sleep-label', {}, '過一晚'));
  // 商店開在任務要買的那一頁（買水草的任務就直接是水草）
  const openShop = (tab?: ShopTab) => panelSheet('商店', (p) => p.shopPanel(ctx, tab ?? guide.shopTab ?? 'fish'));
  const coinsValue = h('b');
  const coinsBtn = h('button.coins', { 'aria-label': '錢包', title: '錢包：點一下打開商店', onclick: () => openShop() }, h('i.coin'), coinsValue);
  // 拿到錢時金幣飛進錢包（F8）
  // 獎勵特效分級（V5）：小事寶箱是小的（金幣＋一圈亮點），交單是中的（再加光環和金額），大的是全螢幕慶祝卡
  ctx.reward = (from, amount, tier = 'small') => {
    withEffects((p) => {
      p.flyCoins(from, coinsBtn, amount);
      p.rewardBurst(from, tier, tier === 'medium' ? `+${amount}` : undefined);
    });
  };
  // 對水對得完美：新魚一進缸就聚光展開尾巴（F5）
  ctx.welcome = (ids, perfect) => {
    if (perfect && ids[0] !== undefined) view.celebrate(ids[0]);
  };
  const renderCoins = () => {
    const coins = sim.economy(game.state).coins;
    const text = coins.toLocaleString('zh-TW');
    if (coinsValue.textContent !== text) coinsValue.textContent = text;
    coinsBtn.classList.toggle('debt', coins < 0);
  };
  // 多缸：目前在看哪一缸，點一下切換或加缸
  const tankName = h('b');
  const tankCount = h('span.count');
  const tankBtn = h('button.tank-chip', { 'aria-label': '我的水缸', title: '我的水缸：切換、加一缸', onclick: () => panelSheet('我的水缸', (p) => p.tanksPanel(ctx)) }, icon(ICONS.tank), tankName, tankCount);
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
    // 只有一缸時不佔上方列的位置（選單裡有「我的水缸」可以加缸）
    tankBtn.hidden = !multi;
  };
  // 窄螢幕（畫面評測第 8 輪 #251、#252）：5 顆合成一顆「水質」，點一下才展開 5 項，展開後再點看趨勢
  const ONE_CAP = window.matchMedia('(max-width: 1279px)');
  const caps = h('button.caps', {
    'aria-label': '水質',
    title: '點一下看水質',
    onclick: () => {
      if (ONE_CAP.matches && !caps.classList.contains('open')) return caps.classList.add('open');
      caps.classList.remove('open');
      panelSheet('紀錄', (p) => p.recordsPanel(ctx));
    },
  });
  window.addEventListener('pointerdown', (e) => caps.contains(e.target as Node) || caps.classList.remove('open'), { capture: true });
  // 分缸提示可以點：打開一鍵分缸
  const todoRow = (t: Todo) =>
    t.nursery
      ? h(
          `div.todo-item.${t.tone}.nursery`,
          {},
          h('span', {}, t.text.replace(/[，：].*$/, '')),
          h('button.btn.small.primary', { onclick: () => withPanels((p) => (t.nursery === 'put' ? p.putDueInNursery(ctx) : p.buyNurseryForDue(ctx))) }, t.nursery === 'put' ? '放進育幼盒' : `去買育幼盒 ${sim.price('nursery:box')} 元`),
        )
      : t.split
      ? h(`button.todo-item.${t.tone}.split`, { onclick: () => panelSheet('分缸', (p) => p.splitPanel(ctx, t.split!)) }, h('img.todo-icon', { src: `${import.meta.env.BASE_URL}art/ui/icon-split.webp`, alt: '' }), t.text)
      : t.snails
        ? h(`button.todo-item.${t.tone}.split`, { onclick: () => panelSheet('螺', (p) => p.snailPanel(ctx)) }, h('img.todo-icon', { src: `${import.meta.env.BASE_URL}art/snail/snail-bladder.webp`, alt: '' }), t.text)
        : t.go
          ? // 點了直接去處理（U3）：開對應的面板或看那條魚
            h(`button.todo-item.${t.tone}.go`, { onclick: () => (sheet.close(), goReport({ tank: t.tank ?? game.active, action: t.go, subjectId: t.subjectId } as ReportItem)) }, t.text, h('span.todo-go', { 'aria-hidden': 'true' }, '›'))
          : h(`div.todo-item.${t.tone}`, {}, t.text);
  const todoBadge = h('span.badge');
  const todoCard = h('div.card.glass.todo');
  const todosChanged = memo();
  const renderTodos = () => {
    const list = householdTodos(game.tanks, game.active);
    if (!todosChanged(JSON.stringify(list))) return;
    todoCard.replaceChildren(
      h('button.card-link', { onclick: () => panelSheet('紀錄', (p) => p.recordsPanel(ctx, 'events')) }, '紀錄 ›'),
      h('div.card-title', {}, '今日待辦'),
      ...list.slice(0, 3).map(todoRow),
    );
    const urgent = list.filter((t) => t.tone !== 'ok').length;
    todoBadge.textContent = urgent > 0 ? String(urgent) : '';
    todoBadge.classList.toggle('show', urgent > 0);
    renderBell();
  };
  const capsChanged = memo();
  const renderCaps = () => {
    const list = waterCapsules(game.state);
    const sum = capsSummary(game.tanks, game.active);
    if (!capsChanged(JSON.stringify([list, sum]))) return;
    caps.replaceChildren(
      h(`span.cap.cap-sum.${sum.tone}`, sum.title ? { title: sum.title } : {}, h('i.dot'), h('span.lbl', {}, sum.label), h('b', {}, sum.value)),
      h(
        'span.cap-list',
        {},
        ...list.map((c) => h(`span.cap.${c.tone}${c.stale ? '.stale' : ''}`, { title: c.title }, h('i.dot'), h('span.lbl', {}, c.label), h('b', {}, c.value))),
        h('span.cap-more', {}, '看趨勢 ›'),
      ),
    );
  };
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
  // 設定頁（ui/settings-panel.ts）：跟其他面板一起延後載入
  const settingsDeps: SettingsDeps = {
    sheet,
    toasts,
    cloud,
    notifier,
    analytics,
    audio: () => audioSettings,
    updateAudio,
    ui: uiPrefs,
    setBigText,
    setQuality,
    setShowFps,
    exportSave,
    importSave,
    openCloud,
    openDebug: () => panelSheet('開發者數值', (p) => p.debugPanel(ctx), { live: true }),
    refreshForecast,
    consentAnswered: () => consentCard.remove(),
  };
  const openSettings = () => {
    const request = ++sheetRequest;
    void settingsUi().then((m) => {
      if (request === sheetRequest) sheet.open('設定', () => m.settingsPanel(settingsDeps));
    });
  };
  const menu = () =>
    h(
      'div.stack',
      {},
      h(
        'div.menu-grid',
        {},
        menuTile('tanks', '我的水缸', '切換、加一缸', () => panelSheet('我的水缸', (p) => p.tanksPanel(ctx))),
        FEATURES.friends ? menuTile('friends', '好友', '參觀、按讚、送禮', openFriends) : null,
        FEATURES.market ? menuTile('market', '市場', '買賣魚蝦和水草', () => void marketUi().then((m) => sheet.open('市場', () => m.marketPanel(marketDeps)))) : null,
        FEATURES.mall ? menuTile('mall', '商城', '點數、特效藥、套缸', () => void mallUi().then((m) => sheet.open('商城', () => m.mallPanel(mallDeps)))) : null,
        menuTile('codex', '圖鑑', '魚蝦、水草、疾病', () => panelSheet('圖鑑', (p) => p.codexPanel(ctx, codexSeen))),
        menuTile('records', '紀錄', '水質趨勢、事件', () => panelSheet('紀錄', (p) => p.recordsPanel(ctx))),
        menuTile('guide', '教學', '再聽阿德老闆說一次', () => (sheet.close(), guide.restart())),
        menuTile('settings', '設定', '聲音、顯示、存檔', openSettings),
      ),
      menuTile(
        'newgame',
        '新遊戲',
        '放棄目前的水缸，從頭開始',
        () => {
          if (!confirm('確定要放棄目前的水缸，重新開始嗎？')) return;
          clearSave(store);
          game.load(blankGameState());
          save();
          sheet.close();
          select(null);
          openSetup();
        },
        '.danger',
      ),
    );
  const menuBtn = h('button.hud-btn', { onclick: () => sheet.open('選單', menu), 'aria-label': '選單' }, icon(ICONS.menu));
  hud.classList.add('glass');
  // 通知匣（YenWel：通知太亂）：沒跳出來的通知都在這裡，鈴鐺上的數字是沒看過的則數
  const bellBadge = h('span.badge');
  const ago = (at: number) => {
    const m = Math.floor((Date.now() - at) / 60_000);
    return m < 1 ? '剛剛' : m < 60 ? `${m} 分鐘前` : `${Math.floor(m / 60)} 小時前`;
  };
  // 待辦併進鈴鐺（畫面評測第 8 輪 #252）：上方列少一顆鈕，打開先看要處理的，下面是通知
  const inboxSheet = () =>
    h(
      'div.stack',
      {},
      ...householdTodos(game.tanks, game.active).map(todoRow),
      ...(toasts.inbox.length === 0
        ? [h('p.hint', {}, '目前沒有通知')]
        : toasts.inbox.map((n) =>
            h(
              `div.inbox-row.${n.tone}`,
              {},
              h('i.toast-icon', { 'aria-hidden': 'true' }),
              h('span', {}, n.text, n.count > 1 ? h('b.toast-count', {}, ` ×${n.count}`) : null),
              actionLive(n.action) ? h('button.btn.small', { onclick: () => (sheet.close(), n.action!.run()) }, n.action.label) : h('small', {}, ago(n.at)),
            ),
          )),
      h('button.btn', { onclick: () => panelSheet('紀錄', (p) => p.recordsPanel(ctx, 'events')) }, '看事件紀錄'),
    );
  const openInbox = () => {
    toasts.markRead();
    sheet.open('通知', inboxSheet);
  };
  const bellBtn = h('button.hud-btn.bell-btn', { 'aria-label': '通知', onclick: openInbox }, icon(ICONS.bell), bellBadge);
  // 徽章只是一個小金點，不寫數字（紅底數字比紅色的魚還搶眼）
  const renderBell = () => bellBadge.classList.toggle('show', toasts.unread > 0 || todoBadge.classList.contains('show'));
  toasts.onInbox = () => {
    bellBadge.textContent = toasts.unread > 0 ? String(Math.min(99, toasts.unread)) : '';
    renderBell();
    bellBtn.classList.remove('ring');
    if (toasts.unread > 0) {
      void bellBtn.offsetWidth; // 重新觸發搖鈴動畫
      bellBtn.classList.add('ring');
    }
  };
  hud.append(clock, speed.el, sleepBtn, coinsBtn, tankBtn, h('span.hud-sep'), caps, bellBtn, menuBtn);

  // ---- 下方櫃台：待辦卡｜圓形工具列｜選取卡 ----
  const tools = h('div.tools.glass');
  // 精繪圖示（AI 生圖，圓角方框款）：放大裁成圓形放進按鈕；載入失敗就露出原本的線條圖示
  const TOOL_ART: Partial<Record<keyof typeof ICONS, string>> = {
    feed: 'icon-feed',
    water: 'icon-waterchange',
    test: 'icon-testkit',
    trim: 'icon-trim',
    scape: 'icon-scape',
    shop: 'icon-shop',
    gear: 'icon-gear',
    net: 'icon-net',
    orders: 'icon-orders',
  };
  // 平常只露常用的 4 個，其他收在「更多」裡（畫面評測第 8 輪 #252）；任務要點的、有訂單能交的、有死魚的會自己露出來
  const MAIN_TOOLS: (keyof typeof ICONS)[] = ['feed', 'water', 'test', 'shop'];
  /** 任務要點的按鈕會發光（P1）。 */
  const toolButtons: Partial<Record<keyof typeof ICONS, HTMLElement>> = {};
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
    const b = h(`button.tool${MAIN_TOOLS.includes(key) ? '' : '.extra'}`, { onclick, title: label }, disc, h('span.lbl', {}, label));
    toolButtons[key] = b;
    b.addEventListener('click', () => audio.play(key === 'net' ? 'net' : key === 'test' ? 'test' : 'open'));
    b.style.setProperty('--c', color);
    tools.append(b);
    return b;
  };
  tool('feed', '餵食', '#e8a24a', () => startFeeding());
  // 換水：點一下照建議的量換（#261）；長按才開面板自己調比例（#257，企劃 2026-10-21）
  let waterHeld = false;
  let waterHold = 0;
  const waterBtn = tool('water', '換水', '#4fb8e0', () => {
    if (waterHeld) return void (waterHeld = false);
    withPanels((p) => p.quickWaterChange(ctx));
  });
  waterBtn.addEventListener('pointerdown', () => {
    waterHeld = false;
    waterHold = window.setTimeout(() => ((waterHeld = true), panelSheet('換水', (p) => p.waterChangePanel(ctx))), 500);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) waterBtn.addEventListener(ev, () => window.clearTimeout(waterHold));
  waterBtn.addEventListener('contextmenu', (e) => e.preventDefault());
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
    panelSheet('水質測試', (p) => p.testKitPanel(ctx), { live: true });
    sheet.closeLater('水質測試', 5000);
  });
  tool('shop', '商店', '#ef8a6a', () => openShop());
  tool('trim', '修剪', '#7ccf8a', () => panelSheet('修剪水草', (p) => p.trimListPanel(ctx)));
  // 造景（F1-c）：養水的那幾天能做的事，入口放在主畫面
  tool('scape', '造景', '#9fd6a0', () => enterScape());
  tool('gear', '設備', '#e3bd6d', () => panelSheet('設備與維護', (p) => p.maintenancePanel(ctx)));
  // 店家訂單（#143）：自己的入口，有能交的單亮綠色數字並發光，有沒看過的新單亮小紅點
  const seenOrders = loadSeenOrders(store);
  const ordersBadge = h('span.badge');
  const ordersBtn = tool('orders', '訂單', '#f0c45a', () => {
    markOrdersSeen(store, seenOrders, game.state);
    panelSheet('客人的訂單', (p) => p.ordersPanel(ctx));
  });
  ordersBtn.append(ordersBadge);
  // 缸上的小標記（daily-loop.md §2）：水草長了、小螺多了、新訂單，早上報告卡關掉後放上去，點了才說一句
  const tankMarks = new TankMarks({
    stage,
    pos: (m) => view.markPos(m.kind, m.plantId),
    tank: () => game.active,
    openOrders: () => ordersBtn.click(),
    topInset: () => hud.getBoundingClientRect().bottom - stage.getBoundingClientRect().top,
  });
  const renderOrders = () => {
    const { ready, fresh } = orderAlert(game.tanks, seenOrders);
    ordersBadge.textContent = ready.length > 0 ? String(ready.length) : '';
    ordersBadge.className = ready.length > 0 ? 'badge ok' : fresh > 0 ? 'badge dot' : 'badge';
    ordersBtn.classList.toggle('glow', ready.length > 0);
    // 別的慶祝卡還在演就等下一輪，免得互相蓋掉；造景模式中也先不演（全螢幕卡會蓋住正在拖的水草，教學第 4 步買草附送的螺就交得出起步單），收起造景再演
    if (ready.length > 0 && !celebration.isOpen && !scaping)
      moment('first_order_ready', {
        art: orderArt(ready[0]),
        title: '有訂單可以交貨了！',
        sub: sim.orderTitle(ready[0]),
        owner: `${orderReadyWhat(ready[0])}有客人要。按下方的「訂單」就能交貨，錢會直接進錢包`,
      });
  };
  const netBtn = tool('net', '撈死魚', '#e88aa8', () => {
    const n = game.act(removeDeadFish);
    toasts.show(n > 0 ? `撈出 ${n} 條死魚` : '缸裡沒有死魚');
  });
  const moreLbl = h('span.lbl', {}, '更多');
  const setMore = (open: boolean) => {
    tools.classList.toggle('open', open);
    moreLbl.textContent = open ? '收起' : '更多';
    moreBtn.setAttribute('aria-expanded', String(open));
  };
  const moreBtn = h('button.tool.tool-more', { title: '更多工具', 'aria-expanded': 'false', onclick: () => setMore(!tools.classList.contains('open')) }, h('span.disc', {}, h('i.more-dots', { 'aria-hidden': 'true' })), moreLbl);
  moreBtn.style.setProperty('--c', '#8fb7c4');
  tools.append(moreBtn);
  // 點了收起來的工具、或點到別的地方，就收回去
  tools.addEventListener('click', (e) => (e.target as Element).closest('.tool.extra') && setMore(false));
  window.addEventListener('pointerdown', (e) => tools.contains(e.target as Node) || setMore(false), { capture: true });
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
  // 缸名牌（#235）：點一下就地改名，不用開選單「我的水缸」；取名任務時發光
  const tankLabel = h('button.tank-label', { onclick: () => renameInline() });
  stage.append(tankLabel);
  const renameInline = () => {
    if (visiting || stage.querySelector('.tank-rename')) return;
    const st = game.state;
    const close = () => form.remove();
    const commit = (raw: string) => {
      const name = raw.trim().slice(0, 12);
      close();
      if (!name || name === st.label) return;
      game.actAll(() => (st.label = name));
    };
    const input = h('input.tank-rename-input', { value: st.label ?? '', placeholder: '幫這缸取個名字', maxLength: 12, enterKeyHint: 'done' }) as HTMLInputElement;
    const chip = (name: string) => h('button.chip', { type: 'button', onclick: () => commit(name) }, name);
    const form = h(
      'form.tank-rename.glass',
      { onsubmit: (e: Event) => (e.preventDefault(), commit(input.value)) },
      h('div.tank-rename-row', {}, input, h('button.btn.small.primary', { type: 'submit' }, '好'), h('button.btn.small', { type: 'button', onclick: close }, '✕')),
      h('div.tank-rename-chips', {}, ...['孔雀魚之家', '第一缸', '夢想魚基地'].map(chip)),
    );
    input.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    form.style.bottom = tankLabel.style.bottom;
    stage.append(form);
    input.focus();
  };
  const guide = new Guide(stage, store, (id) => audio.play(id, false), () => requestAnimationFrame(() => measure()));
  toasts.quietCount = !guide.tutorialOver;
  // 老闆一次只說一件事（G9）：新手引導在說、慶祝卡（也有老闆的話）在演時，事件帶出來的老闆對話先排隊
  setOwnerBlocker(() => guide.talking || celebration.isOpen);
  guide.openShop = (tab) => openShop(tab);
  guide.openScape = () => enterScape();
  guide.quickTray = (kind) =>
    questTray(
      kind,
      game.state,
      (pick) => withPanels((p) => void p.quickBuy(ctx, pick)),
      () => openShop(kind === 'fish' ? 'fish' : kind === 'plant' ? 'plants' : 'gear'),
    );
  guide.note = (text) => toasts.log(text);
  // 下一步（U1）：點任務卡帶到要做的地方
  /** 任務卡「新缸先養水」（#428）打開的那張「新缸要怎麼養水？」；選了就開始養，說約幾天好（空缸倒菌液常常馬上就夠）。 */
  let cycleSheet: Node | null = null;
  const cycleChoice = (p: DeferredUi, tank: number | undefined): Node => {
    const card = p.cycleCard(game.tanks);
    if (!card) return h('p.sheet-note', {}, '新缸已經養好水了');
    return p.choiceVisual(card, (key) => {
      const why = game.actAll((tanks) => p.chooseOption(tanks, 'C8', key));
      if (why) return why;
      sheet.close();
      audio.play('quest', false);
      const done = key === 'media' ? '分了一份舊缸濾材過去' : '倒了硝化菌液';
      const ready = tank !== undefined && sim.isCycled(game.tanks[tank]);
      toasts.show(ready ? `${done}，新缸的菌夠了，可以把小魚搬過去` : `${done}，新缸約 ${key === 'media' ? 2 : 3} 天養好水，養好就叫你搬小魚`);
      return null;
    });
  };
  guide.goNext = (target, tank) => {
    const sick = () => game.state.fish.find((f) => f.alive && (f.ich.stage === 'visible' || sim.hasVisible(f)));
    // 選育：先看缸裡最漂亮的公魚（觀察卡上有配對、留種的按鈕）
    const showy = () => game.state.fish.filter((f) => f.alive && f.sex === 'male' && f.generation !== undefined).sort((a, b) => (b.generation ?? 0) - (a.generation ?? 0))[0];
    switch (target) {
      case 'equipment':
        if (tank !== undefined) game.switchTo(tank);
        return panelSheet('設備與維護', (p) => p.maintenancePanel(ctx));
      case 'remove_dead':
        if (tank !== undefined) game.switchTo(tank);
        return netBtn.click();
      case 'feed':
        return startFeeding();
      case 'test':
        return testBtn.click();
      case 'orders':
        return ordersBtn.click();
      case 'sell':
        return openShop('sell');
      case 'shop_fish':
        return openShop('fish');
      case 'shop_gear':
        return openShop('gear');
      case 'shop_plants':
        return openShop('plants');
      case 'shop_tank':
        return panelSheet('我的水缸', (p) => p.tanksPanel(ctx));
      case 'nursery':
        if (game.state.nurseryBox) withPanels((p) => p.putDueInNursery(ctx));
        else panelSheet('育幼盒', (p) => p.nurseryPanel(ctx));
        return;
      case 'nursery_soon':
        // 育幼盒空了、母魚快生（polish-to-9.md §9.1）：切到那缸，直接把她放進去
        if (tank !== undefined) game.switchTo(tank);
        withPanels((p) => p.putSoonInNursery(ctx));
        return;
      case 'treat': {
        // 生病的魚可能在別缸：直接打開用藥（#291），老闆先說是什麼病、下什麼藥。
        // 先找還等著下藥的那缸（#356：這缸下過藥了，病魚在另一缸沒藥），都下過了才找有病魚的
        const ill = (t: sim.TankState) => t.fish.some((f) => f.alive && illnessOf(f));
        const fits = game.tanks.some(sim.needsMedicine) ? sim.needsMedicine : ill;
        const at = game.tanks.findIndex(fits);
        if (!fits(game.state) && at >= 0) game.switchTo(at);
        const fish = sick();
        // 白點藥效中：先說不用再下，叫玩家調水溫等（#324）
        const ich = sim.ichTreatment(game.tanks);
        const medDays = sim.ichMedDays(game.state);
        // 藥撐不到白點掉光（多半是剛換水沖淡了）：叫玩家補一份，不說「不用再下」（#384）
        const rinsed = game.state.lastWaterChangeHours !== undefined && game.state.hours - game.state.lastWaterChangeHours < 24;
        const advice = ich?.short
          ? `藥效只剩約 ${ich.medDays} 天，撐不到白點掉（約 ${ich.days} 天）${rinsed ? '，剛剛換水把藥沖淡了' : ''}。再補一份白點藥，${ich.heatC ? `${ich.fixHeater ? '加熱棒壞了，換一支再' : '水溫'}調到 ${ich.heatC}°C，` : ''}藥要撐到白點掉光後一天。`
          : ich
            ? `水裡還有白點藥，藥效約剩 ${ich.medDays} 天，不用再下。${ich.heatC ? `${ich.fixHeater ? '加熱棒壞了，換一支再' : '水溫'}調到 ${ich.heatC}°C，` : ''}約 ${ich.days} 天白點會掉。`
            : fish
            ? `${medDays > 0 ? `這缸白點藥效還剩 ${medDays} 天。` : ''}${causeAdvice(fishName(fish), [], fish)}`
            : '缸裡現在看不到生病的魚。';
        const title = game.tanks.length > 1 ? `用藥：${sim.tankLabel(game.tanks, game.active)}` : '用藥';
        return panelSheet(title, (p) => p.treatPanel(ctx, advice));
      }
      case 'select':
        return select(showy()?.id ?? null);
      case 'mother': {
        // 母魚可能在別缸：先切過去再打開她的卡片（跟下一步的判斷用同一個函式）
        const mom = sim.showingMother(game.tanks);
        if (mom) game.switchTo(mom.tank);
        return select(mom?.fish.id ?? null);
      }
      case 'fry_box':
        return panelSheet('育幼盒', (p) => p.nurseryPanel(ctx));
      case 'fastest': {
        const fast = sim.fastestColoring(game.tanks);
        if (fast) game.switchTo(fast.tank);
        return select(fast?.fish.id ?? null);
      }
      case 'scape':
        return enterScape();
      case 'insulate': {
        // 冬天沒加熱棒（#397）：一鍵臨時保溫
        if (tank !== undefined) game.switchTo(tank);
        const ok = game.act((st) => sim.insulateTank(st));
        toasts.show(ok ? `包上毛巾、泡進溫水瓶，水溫回升 ${sim.INSULATE_BUMP_C}°C，接下來半天散熱慢一半` : (sim.insulateRefusal(game.state) ?? '現在不用保溫'), ok ? 'info' : 'warn');
        return;
      }
      case 'heater_credit': {
        // 冬天沒錢換加熱棒（#397）：跟阿德賒一支
        if (tank !== undefined) game.switchTo(tank);
        const owed = game.act((st) => sim.takeHeaterCredit(st));
        if (!owed) return toasts.show(sim.heaterCreditRefusal(game.state) ?? '現在不用賒', 'warn');
        audio.play('quest', false);
        toasts.show(`阿德：「老客人先拿去，有錢再還。」裝上了${game.state.equipment.heater?.spec.name ?? '加熱棒'}，欠 ${owed} 元，之後每筆收入扣一半來還`);
        return;
      }
      case 'buy_heater': {
        // 冬天錢不夠換同款（#404）：買一支撐得住的便宜加熱棒裝上
        if (tank !== undefined) game.switchTo(tank);
        const spec = game.act((st) => sim.buyCheapHeater(st));
        if (!spec) return toasts.show('現在買不了加熱棒', 'warn');
        audio.play('quest', false);
        toasts.show(`裝上了${spec.name}，水溫會慢慢回升`);
        return;
      }
      case 'move_fry': {
        // 小魚在被吃、另一缸養好水了（#425）：一鍵慢慢對水搬過去，切到新缸看牠們
        if (tank === undefined) return;
        const moved = game.actAll((tanks) => sim.moveFryHome(tanks, tank));
        if (!moved) return toasts.show('現在沒有養好水、沒有大魚的缸可以放小魚', 'warn');
        game.switchTo(moved.to);
        audio.play('quest', false);
        const who = moved.shrimp === 0 ? '小魚' : moved.shrimp === moved.count ? '小蝦' : '小魚蝦';
        toasts.show(`${moved.count} 尾${who}慢慢對水，搬進${sim.tankLabel(game.tanks, moved.to)}了，這裡沒有大魚會吃牠們`);
        return;
      }
      case 'cycle_tank':
        // 小魚要搬家、新缸還沒養水（#428）：切到新缸，打開「新缸要怎麼養水？」，選了就開始養
        if (tank !== undefined) game.switchTo(tank);
        // 卡片的按鈕是載入後才補上的：面板重畫時沿用同一張，不然重畫會換成還空著的新卡，按下去沒反應
        cycleSheet = null;
        return panelSheet('新缸養水', (p) => (cycleSheet ??= cycleChoice(p, tank)));
      case 'move_warm': {
        // 冬天加熱棒弄不到（#400）：冷缸的魚連袋子泡進有加熱棒的缸
        if (tank === undefined) return;
        const moved = game.actAll((tanks) => sim.moveAndInsulate(tanks, tank));
        if (!moved) return toasts.show('現在沒有暖缸放得下', 'warn');
        game.switchTo(moved.to);
        toasts.show(`把 ${moved.count} 尾連袋子泡進${sim.tankLabel(game.tanks, moved.to)}，水溫差不多了再放出來${moved.boxed > 0 ? `，${moved.boxed} 尾小魚先放進育幼盒，免得被大魚吃` : ''}${moved.insulated ? `；${sim.tankLabel(game.tanks, tank)}留下的包上毛巾保溫` : ''}`);
        return;
      }
    }
  };
  guide.cheer = (from, coins) => ctx.reward?.(from, coins, 'small');
  // 餵食任務（#235）：放好魚就直接進餵食模式，點水面就撒，不用先找「餵食」；只自動一次，玩家收起來就照按鈕來
  let autoFed = false;
  const trayCoins = memo();
  let naming = false;
  const quickQuest = () => {
    const q = guide.quick;
    if (q === 'feed' && !autoFed && !feedingMode && !sheet.isOpen && !scaping && !guideHeld && !celebration.isOpen) {
      autoFed = true;
      startFeeding();
    }
    // 取名任務開始、結束：名牌換字要重排
    if ((q === 'name') !== naming) {
      naming = q === 'name';
      measure();
    }
    if (guide.trayVisible && trayCoins(String(sim.economy(game.state).coins))) guide.refreshTray();
  };
  let litTarget: HTMLElement | null = null;
  /** 任務要點的那顆按鈕發光；面板開著、在造景時先不亮。 */
  const lightTarget = () => {
    const t = sheet.isOpen ? null : guide.target;
    const el = t === 'menu' ? menuBtn : t ? (toolButtons[t] ?? null) : null;
    if (el === litTarget) return;
    litTarget?.classList.remove('quest-target');
    el?.classList.add('quest-target');
    litTarget = el;
  };
  // 觀賞模式（畫面評測第 8 輪 #252）：10 秒沒操作，介面淡到 30%；點兩下水缸只留魚，右上角一顆小鈕叫回來。
  // 面板開著、在餵食或造景時不淡；有任務要點的按鈕時照樣淡，只留那顆按鈕亮著（styles.css，畫面評測第 9 輪 #265）
  let idleTimer = 0;
  const stayAwake = () => {
    document.body.classList.remove('idle');
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      if (sheet.isOpen || feedingMode || scaping) return stayAwake();
      document.body.classList.add('idle');
      // 第一次淡下去時說一聲怎麼只看魚
      if (!store.getItem('cycle.watchHint')) {
        store.setItem('cycle.watchHint', '1');
        toasts.show('點兩下水缸，可以收起介面只看魚');
      }
    }, 10_000);
  };
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, stayAwake, { capture: true, passive: true });
  stayAwake();
  const setWatching = (on: boolean) => document.body.classList.toggle('watching', on);
  // 餵食模式點水面是在撒飼料，不是要收圖卡（#275 第 16 輪：餵完第 3 下剛好換任務，圖卡一展開就被收掉）
  stage.addEventListener('pointerdown', (e) => e.target instanceof HTMLCanvasElement && !feedingMode && guide.tuckTray(true));
  stage.addEventListener('dblclick', (e) => {
    if (e.target instanceof HTMLCanvasElement && !feedingMode && !scaping && !sheet.isOpen) setWatching(!document.body.classList.contains('watching'));
  });
  document.body.append(h('button.watch-exit', { 'aria-label': '叫回介面', title: '叫回介面', onclick: () => setWatching(false) }, h('i.watch-eye', { 'aria-hidden': 'true' })));
  // 開缸（F1-a）：新遊戲先挑設備，開完缸時間才開始走；關掉面板時主畫面留一個「開缸」按鈕
  // 開局（polish-to-9.md §8.1）：歡迎是缸上方的一行字、夢想魚預告是右上角的小卡，都不擋缸；倒沙時換成下一步，到裝設備那步收起來
  let welcomed = false;
  let welcomeHud: OpeningHud | null = null;
  const showWelcome = () => {
    if (welcomed) return;
    welcomed = true;
    welcomeHud = openingHud();
  };
  // 開缸順序（polish-to-9.md §8.1）：開場動畫一收起就停在空缸上，先親手倒沙，到「裝上設備」那一步才挑設備（推薦組合排第一）
  const openSetup = () => whenIntroDone(() => (showWelcome(), playSetup()));
  const openGearPicker = () =>
    panelSheet(
      '裝上設備',
      (p) =>
        p.setupPanel(ctx, () => {
          save();
          // 挑好設備：接著演「裝上設備」，之後注水、開機
          setupPress();
        }),
      // 開缸必經：點背景不關（#371）
      { pinned: true },
    );
  // 每日 3 件小事（F3）：換天出新題、做完一件跳通知（寫明還差哪件）。左上角常駐小卡列出三件，做完打勾，三件都做完按寶箱（#185）
  let dailyDay = sim.dailyTasks(game.tanks)?.day;
  const dailyHolder = h('div.daily-holder');
  stage.append(dailyHolder);
  // 夢想魚路線（P2）：常駐在任務卡上方，點開看夢想魚卡
  const dreamHolder = h('div.dream-holder');
  stage.append(dreamHolder);
  const dreamChanged = memo();
  // 上一次的孫代機率：變了就在路線卡上跳數字（polish-to-9.md §10.4）
  let dreamPct: number | undefined;
  const renderDream = () => {
    const hide = sim.needsSetup(game.tanks[0]) || view.settingUp;
    const route = hide ? null : sim.dreamRoute(game.tanks);
    if (!dreamChanged(JSON.stringify(route))) return;
    const from = dreamPct;
    dreamPct = route?.odds?.pct ?? dreamPct;
    dreamHolder.replaceChildren(...(route ? [dreamStrip(route, () => sheet.open('夢想魚', () => dreamCard(sim.dreamRoute(game.tanks))), from)] : []));
    requestAnimationFrame(() => measure());
  };
  const dailyChanged = memo();
  const claimDailyChest = () => {
    const got = game.actAll((tanks) => sim.claimDaily(tanks));
    if (!got) return;
    audio.play('fanfare');
    if (got.coins > 0) ctx.reward?.(dailyHolder.getBoundingClientRect(), got.coins, 'small');
    // 寶箱獎勵池（U5）：開到東西要說放在哪裡
    // 大寶箱是一件造景物加一株水草
    const where = got.plantId ? '，到商店「設備」免費擺進缸、「水草」免費種下' : got.item === 'hardscape' ? '，到商店「設備」免費擺進缸' : got.item === 'plant' ? '，到商店「水草」免費種下' : got.item === 'bacteria' ? '，到商店「設備」免費倒' : got.item === 'food' ? '，週末結算時先用它' : '';
    toasts.show(`${got.big ? `連續 ${sim.BIG_CHEST_DAYS} 天做完小事，大寶箱！` : ''}寶箱裡有：${got.text}${where}`);
    renderDaily();
  };
  const goDaily = (id: sim.DailyTaskId) => {
    const maintenance = () => panelSheet('設備與維護', (p) => p.maintenancePanel(ctx));
    const snails = () => panelSheet('螺', (p) => p.snailPanel(ctx));
    // 螺的題目：先切到有這種螺的缸（g23：看著沒有螺的繁殖缸按「撈」，題目沒算）
    const snailsIn = (has: (t: sim.TankState) => boolean) => () => {
      const at = game.tanks.findIndex(has);
      if (at >= 0 && at !== game.active && !has(game.state)) game.switchTo(at);
      snails();
    };
    // 目標題：切到那尾魚在的缸、打開牠的卡片（點開就算看過了）
    const fish = (fishId: number | undefined) => () => {
      const at = fishId === undefined ? -1 : game.tanks.findIndex((t) => t.fish.some((f) => f.id === fishId && f.alive));
      if (at < 0) return toasts.show('在缸裡點一尾魚，看看牠今天怎麼樣');
      if (at !== game.active) game.switchTo(at);
      select(fishId!);
    };
    const today = sim.dailyTasks(game.tanks);
    const task = today?.tasks.find((t) => t.id === id);
    const subject = fish(task?.subjectId);
    // 先切到這一缸再打開面板（有育幼盒的、最擠的、母魚在的那缸）
    const inTank = (at: number, open: () => void) => () => {
      if (at >= 0 && at !== game.active) game.switchTo(at);
      open();
    };
    const tankOf = (fishId: number | undefined) => game.tanks.findIndex((t) => t.fish.some((f) => f.id === fishId && f.alive));
    const worst = () => {
      const crowd = game.tanks.map(sim.crowdingRatio);
      return crowd.indexOf(Math.max(...crowd));
    };
    const go: Record<sim.DailyTaskId, () => void> = {
      goalBelly: subject,
      goalColor: subject,
      goalKeeper: subject,
      goalAlbino: () => toasts.show('在新的一窩裡點一尾紅眼睛的小魚'),
      goalOrders: () => panelSheet('客人的訂單', (p) => p.ordersPanel(ctx)),
      // 比一比：先點還沒看過的那尾
      goalCompare: () => fish(task?.subjectId !== undefined && !today?.seen?.includes(task.subjectId) ? task.subjectId : task?.otherId)(),
      goalFirstBrood: subject,
      goalColorDays: subject,
      goalFins: subject,
      goalSplit: subject,
      goalKeeperFed: subject,
      goalNurseryBox: inTank(
        game.tanks.findIndex((t) => !!t.nurseryBox),
        () => panelSheet('育幼盒', (p) => p.nurseryPanel(ctx)),
      ),
      goalTemp: inTank(tankOf(task?.subjectId), maintenance),
      goalHide: subject,
      goalCountBrood: subject,
      goalFryFed: startFeeding,
      goalCrowded: () => panelSheet('我的水缸', (p) => p.tanksPanel(ctx)),
      goalMove: () => {
        const at = worst();
        if (at !== game.active) game.switchTo(at);
        const advice = sim.splitAdvice(game.state)[0];
        panelSheet('分缸', (p) => p.splitPanel(ctx, advice?.plan ?? 'half'));
      },
      goalSnake: subject,
      test: () => testBtn.click(),
      feed: startFeeding,
      // 該換水的缸裡最擠的那缸：先切過去
      water: () => {
        const at = sim.waterTaskTank(game.tanks);
        if (at !== game.active) game.switchTo(at);
        panelSheet('換水', (p) => p.waterChangePanel(ctx));
      },
      topup: maintenance,
      nursery: () => panelSheet('育幼盒', (p) => p.nurseryPanel(ctx)),
      gear: maintenance,
      observe: () => toasts.show('在缸裡點一尾魚，看看牠今天怎麼樣'),
      snail: snails,
      shrimp: () => toasts.show('在缸裡點一隻蝦，看看牠今天怎麼樣'),
      plant: () => toasts.show('在缸裡點一株水草，看看長得好不好'),
      records: () => panelSheet('紀錄', (p) => p.recordsPanel(ctx)),
      codex: () => panelSheet('圖鑑', (p) => p.codexPanel(ctx, codexSeen)),
      orders: () => panelSheet('客人的訂單', (p) => p.ordersPanel(ctx)),
      scape: () => enterScapeOn('stone'),
      scapePlant: () => enterScapeOn('plant'),
      scapeFlip: () => enterScapeOn('stone'),
      scapeLayer: () => enterScapeOn('stone'),
      scapeScale: () => enterScapeOn('stone'),
      // 擺上新石頭：直接拿起手上那塊，拖到想擺的位置放開（不用先去商店找）
      scapePlace: () => {
        const bag = sim.economy(game.state).hardscapeBag ?? [];
        if (bag.length > 0 && game.act((st) => sim.placeFromBag(st, bag[0]))) ctx.placeNew?.({ kind: 'hardscape', index: (game.state.equipment.hardscape ?? []).length - 1 });
        else openShop('gear');
      },
      trim: () => panelSheet('修剪水草', (p) => p.trimListPanel(ctx)),
      cuttings: () => openShop('plants'),
      clutch: snailsIn((t) => (t.snails?.clutches.length ?? 0) > 0),
      pests: snailsIn((t) => sim.pestCount(t) > 0),
      deadSnail: snailsIn((t) => (t.snails?.snails ?? []).some((x) => !x.alive)),
      rinse: maintenance,
    };
    go[id]();
  };
  const renderDaily = () => {
    const d = sim.dailyTasks(game.tanks);
    const claimable = sim.canClaimDaily(game.tanks);
    // 要在缸裡點的小事還沒做：魚或螺身上一圈金色光圈提示（#188 第 3 點）
    const todo = (id: sim.DailyTaskId) => !!d?.tasks.some((t) => t.id === id && !t.done);
    view.setTargetHint(todo('observe') ? 'fish' : todo('snail') ? 'snail' : null);
    if (!dailyChanged(JSON.stringify([d?.day, d?.tasks, d?.claimed, claimable]))) return;
    // 平常收成一顆小膠囊（「今天的小事 ○●○」），點一下才展開三件事；做了一件就收起來（YenWel：左邊太亂、看不到魚）
    const name = (fishId: number) => {
      const f = game.tanks.flatMap((t) => t.fish).find((x) => x.id === fishId);
      return f ? fishName(f) : null;
    };
    const card = dailyCard(d, claimable, { go: (id) => (dailyHolder.classList.remove('open'), goDaily(id)), claim: claimDailyChest, name });
    card?.querySelector('.daily-head')?.addEventListener('click', () => (dailyHolder.classList.toggle('open'), measure()));
    dailyHolder.replaceChildren(...(card ? [card] : []));
    requestAnimationFrame(() => measure());
  };
  const checkDaily = () => {
    // 開缸前、開缸 4 步還沒做完：不出小事（mvp.md §4.4.4 第 5 點）
    if (sim.needsSetup(game.tanks[0]) || view.settingUp) return;
    const fresh = sim.updateDaily(game.tanks);
    const d = sim.dailyTasks(game.tanks);
    if (!d) return renderDaily();
    if (d.day !== dailyDay) {
      dailyDay = d.day;
      // 過一晚時早上報告卡會列出來，不另外跳通知
      // 今天的題目左上角的小卡就看得到，不另外跳通知（通知太亂）
    }
    // 一件一件做完只在小卡上打勾；三件都做完才跳一則
    if (fresh.length && sim.canClaimDaily(game.tanks)) toasts.show(dailyDoneText(d, fresh[fresh.length - 1]));
    if (fresh.length && sim.canClaimDaily(game.tanks)) audio.play('quest');
    renderDaily();
  };
  ctx.openSetup = openSetup;
  const setupBtn = h('button.btn.primary.setup-cta', { onclick: openSetup, hidden: true }, '開缸：挑魚缸和設備');
  stage.append(setupBtn);
  guide.reward = (id, coins) => game.actAll((tanks) => sim.claimQuestReward(tanks[0], id, coins));
  guide.goalsChanged = () => game.actAll(() => undefined);
  const measure = () => {
    const stageRect = stage.getBoundingClientRect();
    const top = hud.getBoundingClientRect().bottom - stageRect.top;
    // 參觀時底部工具列藏起來，改留參觀列的空間
    const bottom = visiting ? visitBar.offsetHeight + 24 : scaping && scapeBar ? scapeBar.el.offsetHeight + 24 : stageRect.bottom - tools.getBoundingClientRect().top;
    view.setInsets({ top: Math.round(top), bottom: Math.round(bottom) });
    // 左上角只留一排小膠囊（YenWel：「太亂了很躁」「都看不到魚了」）：夢想魚｜任務｜今天的小事，缸要露出來
    let x = 14;
    let rowH = 0;
    for (const [el, shown] of [
      [dreamHolder, dreamHolder.offsetHeight > 0],
      [guide.pill, guide.pillVisible],
      [dailyHolder, dailyHolder.offsetHeight > 0],
    ] as const) {
      el.style.top = `${Math.round(top + 10)}px`;
      el.style.left = `calc(env(safe-area-inset-left) + ${x}px)`;
      if (!shown) continue;
      x += el.offsetWidth + 6;
      // 展開的小事清單是蓋在缸上的下拉，不推開下面的東西
      rowH = Math.max(rowH, el === dailyHolder ? 40 : el.offsetHeight);
    }
    // 通知讓出這一排的寬度
    document.body.style.setProperty('--pill-w', `${x}px`);
    // 一鍵買的圖卡排在這一排下面（#235）
    guide.tray.style.top = `${Math.round(top + 16 + rowH)}px`;
    const trayH = guide.pillVisible && guide.trayVisible ? guide.tray.offsetHeight + 8 : 0;
    const dockTop = dock.getBoundingClientRect().top - stageRect.top;
    const above = 16 + rowH + trayH;
    cardArea = { x: 0, y: top + above, w: stageRect.width, h: Math.max(0, dockTop - top - above - 34) };
    placeSelCard();
    stage.style.setProperty('--dock-top', `${Math.round(stageRect.bottom - dockTop - stageRect.top)}px`);
    document.body.style.setProperty('--dock-top', `${Math.round(stageRect.bottom - dockTop - stageRect.top)}px`);
    tankLabel.style.bottom = `${Math.round(stageRect.bottom - dock.getBoundingClientRect().top + 8)}px`;
    const naming = guide.quick === 'name';
    tankLabel.classList.toggle('quest-target', naming);
    // 只留缸名（點了改名）；型號和尺寸在設備面板看得到，放這裡一長串字壓在沙上（#273）
    tankLabel.textContent = naming ? '✎ 點這裡幫缸取名' : `✎ ${sim.tankLabel(game.tanks, game.active)}`;
  };
  new ResizeObserver(measure).observe(hud);
  new ResizeObserver(measure).observe(dock);
  window.addEventListener('resize', measure);
  measure();

  // 其他缸的事件也要通知，前面加上缸名
  const tankPrefix = (tank: number) => (game.tanks.length > 1 && tank !== game.active ? `${sim.tankLabel(game.tanks, tank)}：` : '');
  /** 過一晚時老闆送了育幼盒：報告卡關掉後再帶玩家放母魚（記是哪一缸）。 */
  let nurseryGiftTank: number | null = null;
  /** 過一晚時第一次死魚：報告卡關掉後阿德老闆再來安慰（U4）。 */
  let firstDeathLine: string | null = null;
  /** 第一次在缸裡看到搭便車的螺（polish-to-9.md §4）：過一晚的話等報告卡關掉再說。 */
  let firstPestsLine: string | null = null;
  /** 第一次有母魚快生了，老闆送育幼盒，一個步驟帶玩家把她放進去（mvp.md §4.4.2 第 2 點）。 */
  const nurseryGuide = async (tank: number) => {
    const t = game.tanks[tank] ?? game.state;
    const mom = sim.dueMothers(t)[0];
    const name = mom ? fishName(mom) : '那尾母魚';
    audio.play('quest', false);
    const yes = await ownerGuide(`${name}肚子很鼓，快生了！我送你一個育幼盒，已經掛在缸邊。把她放進去，生下的小魚掉進隔間，大魚就吃不到。之後要更多再到商店買。`, '放進去');
    if (!yes) {
      toasts.show('育幼盒在「設備與維護」裡，待辦也有按鈕可以放');
      return;
    }
    game.switchTo(tank);
    withPanels((p) => p.putDueInNursery(ctx));
  };
  /** 每缸上次提醒「小魚被吃」是第幾個遊戲天。 */
  const fryEatenToast = new Map<number, number>();
  /** 這一幀冒出來、還沒跳的事件通知（flushEventToasts 同類合併）。 */
  const eventToasts: EventToast[] = [];
  game.onEvent((e, tank) => {
    // 阿德老闆送育幼盒（#187）：過一晚時等報告卡關掉再帶
    if (e.type === 'nursery_gift') {
      if (game.sleeping || sleepingNow) nurseryGiftTank = tank;
      else void nurseryGuide(tank);
    }
    // 第一次死魚（不管什麼死法）：阿德老闆安慰一次、說怎麼避免（U4）；過一晚的話等報告卡關掉再說
    if (e.type === 'fish_died' && firstTime(store, 'first_death')) {
      const cause = e.cause as DeathAdviceCause | undefined;
      if (cause && cause in DEATH_ADVICE) firstTime(store, `died_${cause}`); // 同一段說明下面不再講第二次
      const t = game.tanks[tank] ?? game.state;
      const line = firstDeathOwnerLine(e, [...t.fish, ...(t.quarantine?.fish ?? [])].find((f) => f.id === e.subjectId));
      if (game.sleeping || sleepingNow) firstDeathLine = line;
      else void ownerSay(line);
    }
    if (e.type === 'pests_seen' && firstTime(store, 'first_pests')) {
      // 不是危機，不跳對話框：一行提示，點「為什麼？」看完整說明（design/tutorial-lines.md §5）
      if (game.sleeping || sleepingNow) firstPestsLine = FIRST_PESTS_LINE;
      else guide.showTip(FIRST_PESTS_TIP, FIRST_PESTS_LINE);
    }
    // 過一晚的時候不跳提示，早上報告會一條一條列出來
    if (game.sleeping) return;
    if (e.type === 'fish_died') {
      const t = game.tanks[tank] ?? game.state;
      const fish = t.fish.find((f) => f.id === e.subjectId);
      analytics.track('fish_died', { cause: e.cause ?? 'unknown', species: fish?.species ?? 'unknown', day: Math.floor(t.hours / 24) });
      // 第一次餓死、病死：阿德老闆直接說原因和下次怎麼做（#169）
      const cause = e.cause as DeathAdviceCause | undefined;
      if (cause && cause in DEATH_ADVICE && firstTime(store, `died_${cause}`)) void ownerSay(DEATH_ADVICE[cause]);
    }
    if (e.type === 'fry_eaten') {
      // 仔魚一隻一隻被吃，一天每缸只提醒一次（數字寫的是第一筆，早上報告會算總數）
      const day = Math.floor((game.tanks[tank] ?? game.state).hours / 24);
      if (fryEatenToast.get(tank) === day) return;
      fryEatenToast.set(tank, day);
    }
    // 配對很常發生：只寫在早上報告，不出聲、不跳通知（G8）
    if (e.type === 'mated') return;
    // 模擬事件（夜裡生小魚、死魚…）不是玩家按的，只出聲不震
    audio.play(eventSound(e.type), false);
    if (e.type === 'fry_born' && (e.count ?? 0) > 0) {
      // 生小魚是大事：跳出慶祝卡，在看的那一缸聚光特寫母魚
      const t = game.tanks[tank] ?? game.state;
      const mom = t.fish.find((f) => f.id === e.subjectId);
      const shrimp = !!mom && sim.isShrimpSpecies(mom.species);
      if (tank === game.active && e.subjectId !== undefined) view.celebrate(e.subjectId);
      const first = firstTime(store, 'first_fry');
      if (first) audio.play('fanfare', false);
      celebration.show({
        art: fryArt(mom?.species ?? 'guppy'),
        title: `${tankPrefix(tank)}${shrimp ? '孵出' : '生了'} ${e.count} ${shrimp ? '隻小蝦' : '尾小魚'}！`,
        sub: `${mom ? fishName(mom) : '母魚'}當媽媽了。成魚會吃小魚，水草越密越好躲`,
        owner: !first ? undefined : shrimp ? '第一窩小蝦！多放莫絲或水草，小蝦躲得住才長得大。' : '第一胎！小魚長到轉色期才看得出公母，到時候挑尾巴大、顏色亮的留下來配對。',
        // 第一窩是大特效（全螢幕），之後每一窩是中特效（停在上方，V5）
        size: first ? 'big' : 'medium',
      });
      return;
    }
    if (e.type === 'first_bred_sale') {
      // 自己選育的魚第一次換到錢（polish-to-9.md G2）：專屬慶祝；賣給店家時一般的「第一筆收入」就不再演一次
      if (e.cause === 'shop') firstTime(store, 'first_sale');
      audio.play('fanfare', false);
      celebration.show({
        art: 'ui/icon-orders.webp',
        title: '自己選育的魚賣出去了！',
        sub: `${e.cause === 'order' ? '客人收下了你的魚' : '水族店收下了你的魚'}，拿到 ${e.value ?? 0} 元`,
        owner: '從配對、等小魚轉色到挑魚，這尾是你一手養出來的。之後選得越好，客人出價越高。',
      });
      return;
    }
    const msg = describeEvent(game.tanks[tank] ?? game.state, e);
    // 先收起來，這一幀跑完再同類合併成一則（快轉時一幀會冒出好幾筆同樣的事）
    if (msg) eventToasts.push({ key: `${tank}:${e.type}`, text: tankPrefix(tank) + msg.text, tone: msg.tone });
  });
  const flushEventToasts = () => {
    if (eventToasts.length === 0) return;
    const merged = mergeEventToasts(eventToasts.splice(0), (key, n) => {
      const tank = Number(key.split(':')[0]);
      const text = pluralEventText(key.slice(key.indexOf(':') + 1), n);
      return text && tankPrefix(tank) + text;
    });
    for (const m of merged) toasts.show(m.text, m.tone);
  };
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
            panelSheet('設備與維護', (p) => p.maintenancePanel(ctx));
          },
        }
      : c.reason === 'starving'
        ? {
            label: '去餵食',
            run: () => {
              game.switchTo(c.tank);
              startFeeding();
            },
          }
        : undefined;
    // 危機一定要跳出來（不只進通知匣）：用壞消息的樣子。
    // 畫面上同時只有一格：等同一幀的事件通知（「某某魚死了」）都送完再跳，才不會被它們換掉（那些照樣進通知匣）
    setTimeout(() => toasts.show(tankPrefix(c.tank) + crisisText(c), 'bad', fix), 0);
  });
  // 選育成功：自家繁殖的公魚第一次長出沒見過的品系
  const strains = new StrainTracker(store);
  const celebrateStrains = () => {
    const [top, ...rest] = strains.check(game.tanks);
    if (!top) return;
    const p = sim.phenotype(top.fish.genome!);
    if (top.tank === game.active) view.celebrate(top.fish.id);
    audio.play('fanfare', false);
    celebration.show({
      art: guppyArt(sim.lookIndex(p), maleFinOf(p)),
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
    // G8：缸裡真的發生的事配那條魚（懷孕的母魚、追母魚的公魚、長大的小魚）
    if (fish && fish.alive && (['grown', 'disease', 'fish_relaxed', 'belly', 'courtship', 'fry_grew', 'lookalike'] as ReportItem['kind'][]).includes(item.kind)) return view.portrait(fish);
    // P6：自己做的事的效果配上那樣東西的圖（長最多的那種草、硝化菌、育幼盒）
    const art = (file: string) => `${import.meta.env.BASE_URL}art/${file}`;
    if (item.kind === 'plant_grew' && t.plants.length) {
      const count = new Map<sim.PlantSpeciesId, number>();
      for (const p of t.plants) count.set(p.species, (count.get(p.species) ?? 0) + 1);
      return art(plantArt([...count.entries()].sort((a, b) => b[1] - a[1])[0][0]));
    }
    if (item.kind === 'cycle' || item.kind === 'cycled') return art('gear/bottle-bacteria.webp');
    if (item.kind === 'nursery') return art('gear/nursery-box.webp');
    const leaf = item.kind === 'new_leaf' ? t.plants.find((p) => p.id === item.plantId) : undefined;
    if (leaf) return art(plantArt(leaf.species));
    if (item.kind === 'fry_grew') return art(fryArt(fish?.species ?? 'guppy'));
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
        panelSheet('換水', (p) => p.waterChangePanel(ctx));
        break;
      case 'feed':
        startFeeding();
        break;
      case 'equipment':
        panelSheet('設備與維護', (p) => p.maintenancePanel(ctx));
        break;
      case 'orders':
        ordersBtn.click();
        break;
      case 'snails':
        panelSheet('螺', (p) => p.snailPanel(ctx));
        break;
      case 'trim':
        panelSheet('修剪水草', (p) => p.trimListPanel(ctx));
        break;
      case 'fry_box':
        // 有育幼盒（或兩個都沒有，可以在那裡買）就開育幼盒；只有檢疫盒才開檢疫盒
        if (game.state.quarantine && !game.state.nurseryBox) panelSheet('檢疫盒', (p) => p.quarantinePanel(ctx));
        else panelSheet('育幼盒', (p) => p.nurseryPanel(ctx));
        break;
      case 'nursery':
        if (game.state.nurseryBox) withPanels((p) => p.putDueInNursery(ctx));
        else panelSheet('育幼盒', (p) => p.nurseryPanel(ctx));
        break;
      case 'shop_tank':
        panelSheet('我的水缸', (p) => p.tanksPanel(ctx));
        break;
      case 'shop_fish':
        openShop('fish');
        break;
      case 'buy_feeder':
        offerFeeder(item.tank);
        break;
      case 'buy_tank':
      case 'buy_big':
        panelSheet('買缸', (p) => p.tankOffer(ctx, item.action === 'buy_big' ? 'std90' : 'nano20'));
        break;
      case 'insulate':
      case 'heater_credit':
      case 'move_warm':
      case 'buy_heater':
      case 'move_fry':
      case 'cycle_tank':
        guide.goNext?.(item.action, item.tank);
        break;
      case 'fish':
      case 'treat':
        if (item.subjectId !== undefined) select(item.subjectId);
        break;
    }
  };
  /** 早上報告卡的按鈕（右上角今天的小事、選擇卡、魚的長相）：過夜和離線回來的報告共用。 */
  const reportHooks = ({ chooseOption, lineName }: Pick<DeferredUi, 'chooseOption' | 'lineName'>) => {
    const today = sim.dailyTasks(game.tanks);
    const daily = today
      ? { tasks: today.tasks.map((t) => ({ id: t.id, art: dailyArt(t.id), text: DAILY_SHORT[t.id], done: t.done })), go: (id: string) => goDaily(id as sim.DailyTaskId) }
      : undefined;
    const choose = (item: ReportItem, key: string, picks: number[], text?: string) => {
      const card = item.choice ?? item.broodSetting;
      return card ? game.actAll((tanks) => chooseOption(tanks, card.id, key, picks, text)) : null;
    };
    const fishLook = (id: number) => {
      // 母魚可能在產卵盒（quarantine）裡
      const f = game.tanks.flatMap((t) => [...t.fish, ...(t.quarantine?.fish ?? [])]).find((x) => x.id === id && x.genome);
      if (!f?.genome) return null;
      const p = sim.phenotype(f.genome);
      return { sex: f.sex, name: sim.strainName(p), look: sim.lookIndex(p), fins: sim.finWords(p), line: lineName(game.tanks, f) };
    };
    return { picture: reportPicture, go: goReport, daily, choose, fishLook };
  };
  /** 離線回來：離開期間有缸太擠，先出一張報告卡（第一行「你不在的時候…太擠了」，接著擠缸卡，midgame.md §7.7）。 */
  const showAway = (awayHours: number) => {
    const since = game.state.hours - awayHours;
    withPanels(({ awayReport, morningCard, chooseOption, lineName }) => {
      if (sleepingNow) return;
      const report = awayReport(game.tanks, since, awayHours);
      if (!report) return;
      save();
      const shade = h('div.night.dawn');
      shade.append(morningCard(report, reportHooks({ chooseOption, lineName }), () => {
        shade.classList.remove('in');
        window.setTimeout(() => shade.remove(), 450);
      }));
      document.body.append(shade);
      requestAnimationFrame(() => shade.classList.add('in'));
    });
  };
  // 早上報告在拆出去的檔案裡（通常開機後早就載好了，照舊同步）
  const goNight = () => withPanels(goNightWith);
  const goNightWith = ({ snapshot, morningReport, slimReport, morningCard, chooseOption, lineName }: DeferredUi) => {
    if (sleepingNow) return;
    // 開缸演出還在演：演完會跳「你的第一個缸」，夜幕會把它蓋掉
    if (view.settingUp) {
      toasts.showNow('等開缸做完再過夜');
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
      checkDaily(); // 換天出題（早上報告卡要列出今天的小事）
      const card = morningCard(report, reportHooks({ chooseOption, lineName }), () => {
        shade.classList.remove('in');
        window.setTimeout(() => shade.remove(), 450);
        sleepingNow = false;
        // 報告只列 3 行（daily-loop.md §2）：其他的和水草、小螺、新訂單收進鈴鐺，想看再點開
        const slim = slimReport(report);
        // 收進鈴鐺的餵食器提示保留「裝上 ›」按鈕（daily-loop.md §7）
        for (const i of [...slim.rest].reverse()) toasts.log(i.text, i.tone === 'bad' ? 'bad' : i.tone === 'warn' ? 'warn' : 'info', i.action === 'buy_feeder' ? { label: '裝上 ›', run: () => offerFeeder(i.tank) } : undefined);
        for (const m of [...slim.marks].reverse()) toasts.log(m.note);
        // 水草、小螺、新訂單也放到缸上，點了才說一句
        tankMarks.set(slim.marks);
        celebration.release();
        // 報告說的那條魚、那株草在缸裡亮一下，一眼找得到是誰
        const about = report.items.find((i) => game.tanks[i.tank] === game.state && (i.subjectId !== undefined || i.plantId !== undefined));
        if (about) view.spotlight(about.subjectId !== undefined ? 'fish' : 'plant', about.subjectId ?? about.plantId!);
        if (nurseryGiftTank !== null) {
          const tank = nurseryGiftTank;
          nurseryGiftTank = null;
          void nurseryGuide(tank);
        }
        if (firstDeathLine !== null) {
          void ownerSay(firstDeathLine);
          firstDeathLine = null;
        }
        if (firstPestsLine !== null) {
          guide.showTip(FIRST_PESTS_TIP, firstPestsLine);
          firstPestsLine = null;
        }
      });
      shade.setAttribute('aria-hidden', 'false');
      shade.append(card);
      audio.play(r.crisis ? 'warn' : 'quest');
    }, 900);
  };
  debugHandle.sleep = goNight;
  debugHandle.marks = tankMarks;
  debugHandle.celebration = celebration;
  debugHandle.owner = { say: ownerSay, guide: ownerGuide };
  debugHandle.reward = (tier: 'small' | 'medium', amount = 120) => ctx.reward?.(null, amount, tier);

  game.onChange(() => {
    sheet.refresh();
    measure();
    renderSelCard();
    renderTodos();
    renderCaps();
    renderTankChip();
    renderDream();
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
        if (msg) eventToasts.push({ key: `${tank}:${e.type}`, text: tankPrefix(tank) + msg.text, tone: msg.tone });
      }
    });
    flushEventToasts();
    showAway(offline.hours);
  }
  if (window.matchMedia('(orientation: portrait)').matches) toasts.showNow('把手機轉成橫向，水缸會更大');
  setInterval(save, 10_000);
  // 雲端：開遊戲時看看別的裝置有沒有玩過；之後每 10 分鐘和切到背景時自動上傳
  void checkCloudOnStart().then(checkGifts).then(syncMarket).then(syncMall);
  // 市場：賣出的魚自動出貨、貨款入帳、到貨提醒
  setInterval(() => void syncMarket(), 60_000);
  // 推播預測：開著遊戲時每 3 分鐘重算一次，關掉時直接用
  void notifier.refresh().then(() => notifier.clear()).then(() => refreshForecast());
  setInterval(() => void refreshForecast(), 3 * 60_000);
  window.addEventListener('pagehide', () => void planPush());
  setInterval(() => void autoUpload(), 10 * 60_000);
  analytics.track('session_start', sessionProps());
  guide.questDone = (step, id) => {
    analytics.track('quest_done', { step });
    if (id === 'cycled')
      moment('cycled', {
        art: 'gear/bottle-bacteria.webp',
        title: '養水完成！',
        sub: '硝化菌長好了，氨和亞硝酸鹽都是 0。現在可以慢慢多加魚',
        // 魚開始多了：先講出門時誰來餵（#169，評測裡第 6 週整缸餓死）
        owner: '水養好了！提醒你一件事：關掉遊戲時間也照樣走，魚每天都要吃。要出門好幾天，商店「設備」最下面有假期飼料錠，一顆撐 7 天。',
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
      void autoUpload();
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
          if (msg) eventToasts.push({ key: `${tank}:${e.type}`, text: tankPrefix(tank) + msg.text, tone: msg.tone });
        }),
      );
      flushEventToasts();
      if (away.hours >= 1) showAway(away.hours);
    }
  });
  window.addEventListener('pagehide', save);

  renderSelCard();
  renderTodos();
  renderCaps();
  renderCoins();
  // 重開遊戲時夢想魚膠囊一進來就在（以前要等玩家先做一個動作才出現，#256）
  renderDream();
  // 還沒開缸：先挑設備，開缸演出播完才開始教學；演出還在播也一樣等它播完（不然老闆的對話框會擋住整段演出）
  if (sim.needsSetup(game.tanks[0])) openSetup();
  // 設備裝好、4 步沒做完就關掉遊戲：從倒沙重來一次，開機做完才開機
  else if (sim.awaitingPowerOn(game.tanks[0])) playSetup();
  else if (!view.settingUp) guide.start(game.state);
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
    flushEventToasts();
    if (visiting) {
      const n = Math.min(visitClock.advance(elapsedMS), 60);
      for (let i = 0; i < n; i++) sim.step(visiting.state);
    }
    view.update(visiting?.state ?? game.state, ticker.deltaMS / 1000);

    clockValue.textContent = `${clockLabel(game.state.hours)}${game.clock.timeScale === 0 ? '・暫停' : ''}`;
    speed.render();
    netBtn.classList.toggle('alert', game.state.fish.some((f) => !f.alive));
    // 第 3 天以後工具都認得了：拿掉圖示下面的字，按住才顯示
    tools.classList.toggle('quiet', game.tanks[0].hours >= 72);

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
      if (tankMarks.count > 0 && !scaping) tankMarks.sync();
      // 開缸演出和「你的第一個缸」卡片演完才讓老闆開口（「開缸」任務在演出一開始就完成，不能蓋在演出上，#171）
      if (!guideHeld) guide.update(game.state, game.tanks);
      toasts.quietCount = !guide.tutorialOver;
      lightTarget();
      quickQuest();
      kickOwnerQueue();
      setupBtn.hidden = !sim.needsSetup(game.tanks[0]) || sheet.isOpen;
      checkDaily();
      if (scaping) scapeBar?.refresh();
      celebrateStrains();
      // 圖鑑條目在拆出去的檔案裡：背景載好之前先不檢查（下一次刷新再補，解鎖條件看的是缸的狀態和事件紀錄）
      for (const entry of deferredUi?.unlockCodex(codexSeen, game.state) ?? []) {
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
  // 主畫面出來、閒下來之後把面板那包先載好（第一分鐘就會開商店、餵食）
  if ('requestIdleCallback' in window) window.requestIdleCallback(prefetchDeferred, { timeout: 2000 });
  else setTimeout(prefetchDeferred, 300); // iOS Safari 沒有 requestIdleCallback
  // 主畫面畫出第一格後，開場動畫演完就可以收起來
  requestAnimationFrame(() => introReady());
}

// 開不起來也要把開場動畫收掉，不然畫面會一直停在標題
start().catch((err) => {
  introReady();
  // 開機失敗時錯誤畫面還沒裝好（installCrashGuard 要等存檔讀進來），這裡直接顯示原因
  console.error(err);
  showStartupError(err);
});
