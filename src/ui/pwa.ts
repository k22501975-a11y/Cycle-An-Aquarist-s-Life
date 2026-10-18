/**
 * 可安裝的網頁 App（PWA）：註冊離線快取、記下「安裝到主畫面」的提示、有新版時通知。
 */

import { isNativeApp } from './native';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;

/** 已經用安裝好的 App 開啟（全螢幕／獨立視窗）。 */
export function isInstalled(): boolean {
  if (isNativeApp()) return true;
  return window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** iPhone、iPad 的 Safari 沒有安裝提示，要自己從分享選單加入主畫面。 */
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function canPromptInstall(): boolean {
  return deferred !== null;
}

/** 跳出瀏覽器的安裝視窗；回傳玩家有沒有裝。 */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted';
}

/**
 * 啟動 PWA。onUpdate：新版下載好了，參數是「換新版並重新整理」的動作。
 * 開發模式不註冊（避免快取住正在改的程式）。
 */
export function setupPwa(onUpdate: (apply: () => void) => void, onInstallable?: () => void): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    onInstallable?.();
  });
  // App 版的檔案本來就在手機裡，不需要離線快取（也避免更新 App 後還吃到舊快取）
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || isNativeApp()) return;
  const register = async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
      const offer = (worker: ServiceWorker) =>
        onUpdate(() => {
          navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
          worker.postMessage('skip-waiting');
        });
      // 第一次安裝不算更新；已經有舊版在跑、新版又裝好了才通知
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
        });
      });
    } catch {
      // 不能用離線快取（例如無痕模式）就算了，遊戲照常
    }
  };
  // 遊戲要先載入圖片才呼叫這裡，那時 load 事件通常已經過了
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
