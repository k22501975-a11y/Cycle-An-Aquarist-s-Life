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
    const detail = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
    // 附上版本，回報問題時才知道是哪一版出錯
    const message = `版本 ${__APP_VERSION__}\n${detail}`;
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
        h('h2', {}, '遊戲出了點問題'),
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

/** 這台裝置開不了 WebGL：遊戲只用 WebGL 畫（render/gl-app.ts），沒有其他退路。 */
export class WebGLUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('WebGL 無法使用', { cause });
    this.name = 'WebGLUnavailableError';
  }
}

/**
 * 開機就失敗（還沒讀進存檔、錯誤畫面的存檔按鈕還沒準備好）：顯示看得懂的原因，不要停在開場動畫或整片白。
 * 存檔還在瀏覽器裡沒動過，重新載入或換裝置就能繼續。
 */
export function showStartupError(error: unknown): void {
  if (document.querySelector('.crash')) return;
  const webgl = error instanceof WebGLUnavailableError;
  const detail = error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error);
  const message = `版本 ${__APP_VERSION__}\n${detail}`;
  const copy = h('button.btn', {}, '複製錯誤訊息');
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(message).then(() => (copy.textContent = '已複製'));
  });
  document.body.append(
    h(
      'div.crash',
      { role: 'alertdialog', 'aria-label': '遊戲開不起來' },
      h(
        'div.crash-card.glass',
        {},
        h('h2', {}, webgl ? '這台裝置畫不出水缸' : '遊戲開不起來'),
        h(
          'p',
          {},
          webgl
            ? '遊戲需要 WebGL 繪圖，但這台裝置的瀏覽器現在沒辦法開啟。請更新「Android System WebView」或 Chrome 後再試；電腦版請確認瀏覽器的硬體加速有開。存檔沒有受影響。'
            : '開啟時發生錯誤，存檔沒有受影響。請重新載入；如果一直發生，請把錯誤訊息複製給我們。',
        ),
        h('pre.crash-msg', {}, message.slice(0, 600)),
        h('div.row', {}, h('button.btn.primary', { onclick: () => location.reload() }, '重新載入'), copy),
      ),
    ),
  );
}
