import { h } from './dom';

/**
 * 錯誤畫面：程式出錯時不要整頁白掉或畫面凍住不動，而是告訴玩家發生什麼事、存檔還在，
 * 並提供重新載入、匯出存檔、複製錯誤訊息。
 */
export function installCrashGuard(hooks: { save: () => void; exportSave: () => void }): (error: unknown) => void {
  let shown = false;
  const crash = (error: unknown) => {
    if (shown) return;
    shown = true;
    try {
      hooks.save();
    } catch {
      // 存不了也要讓玩家看到錯誤畫面
    }
    const message = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
    const copy = h('button.btn', {}, '複製錯誤訊息');
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(message).then(() => (copy.textContent = '已複製'));
    });
    const overlay = h(
      'div.crash',
      { role: 'alertdialog', 'aria-label': '遊戲發生錯誤' },
      h(
        'div.crash-card.glass',
        {},
        h('h2', {}, '水族人生出了點問題'),
        h('p', {}, '畫面停下來了，但你的魚還在：存檔已經先存好，重新載入就能繼續玩。如果一直發生，請把錯誤訊息複製給我們。'),
        h('pre.crash-msg', {}, message.slice(0, 600)),
        h('div.row', {}, h('button.btn.primary', { onclick: () => location.reload() }, '重新載入'), h('button.btn', { onclick: () => hooks.exportSave() }, '匯出存檔'), copy),
      ),
    );
    document.body.append(overlay);
  };
  window.addEventListener('error', (e) => {
    // 圖片、音檔載入失敗不算當機
    if (e.error) crash(e.error);
  });
  window.addEventListener('unhandledrejection', (e) => crash(e.reason));
  return crash;
}
