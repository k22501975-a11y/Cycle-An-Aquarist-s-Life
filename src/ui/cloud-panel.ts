import { LEDGER_CODES, SAVE_CHECK_CODES, type CloudClient } from '../net/cloud';
import { h } from './dom';
import { saveTextFile } from './native';
import type { Sheet, Toasts } from './sheet';

export interface CloudPanelDeps {
  cloud: CloudClient;
  sheet: Sheet;
  toasts: Toasts;
  /** 目前遊戲的存檔文字（serializeSave）。 */
  saveJson: () => string;
  /** 用雲端的存檔取代目前的遊戲；讀不出來就回傳 false。advanced：伺服器已經補算到現在，不用再補算。 */
  applyCloud: (save: unknown, revision: number, advanced?: boolean) => boolean;
}

const legal = (label: string, page: 'privacy' | 'terms') => h('a', { href: `./legal/${page}.html`, target: '_blank', rel: 'noopener' }, label);

const when = (ms: number) => new Date(ms).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** 衝突時的選擇：雲端有另一台裝置上傳的存檔。 */
export interface CloudConflict {
  revision: number;
  savedAt: number;
  /** 不是別台裝置，而是這台的存檔跟雲端那份對不上（伺服器的模擬檢查沒過）。 */
  mismatch?: boolean;
}

export function cloudPanel(deps: CloudPanelDeps, conflict?: CloudConflict): Node {
  const { cloud, sheet, toasts } = deps;
  const reopen = (c?: CloudConflict) => sheet.open('雲端存檔', () => cloudPanel(deps, c));
  if (!cloud.available) {
    return h('div.stack', {}, h('p', {}, '雲端存檔還沒開放。'), h('p.hint', {}, '伺服器上線後，登入帳號就能把水缸存到雲端，換手機也能接著養。現在可以先用「設定 › 匯出存檔」帶著走。'));
  }

  if (!cloud.session) {
    const user = h('input.text-input', { type: 'text', placeholder: '名字（3～20 字）', autocomplete: 'username', maxlength: '20' }) as HTMLInputElement;
    const pass = h('input.text-input', { type: 'password', placeholder: '密碼（至少 8 字）', autocomplete: 'current-password', maxlength: '72' }) as HTMLInputElement;
    const status = h('p.hint');
    const go = async (kind: 'login' | 'register') => {
      status.textContent = kind === 'login' ? '登入中…' : '建立帳號中…';
      const res = kind === 'login' ? await cloud.login(user.value.trim(), pass.value) : await cloud.register(user.value.trim(), pass.value);
      if (!res.ok) {
        status.textContent = res.message;
        return;
      }
      toasts.show(kind === 'login' ? `歡迎回來，${res.value.username}` : `帳號建好了，${res.value.username}`);
      await firstSync(deps);
      reopen();
    };
    return h(
      'div.stack',
      {},
      h('p', {}, '登入帳號，把水缸存到雲端，換手機或電腦都能接著養。'),
      user,
      pass,
      h('div.row', {}, h('button.btn.primary', { onclick: () => go('login') }, '登入'), h('button.btn', { onclick: () => go('register') }, '建立新帳號')),
      status,
      h('p.hint', {}, '密碼只用來登入，伺服器只存加密過的版本。'),
      h('p.hint', {}, '建立帳號代表你同意', legal('使用條款', 'terms'), '和', legal('隱私權政策', 'privacy'), '。'),
    );
  }

  const session = cloud.session;
  const status = h('p.hint', {}, session.syncedAt ? `上次同步：${when(session.syncedAt)}` : '還沒同步過');
  const upload = async (force = false) => {
    status.textContent = '上傳中…';
    const res = await cloud.upload(deps.saveJson(), force);
    if (res.ok) {
      if (res.value.notice) toasts.show(res.value.notice, 'warn');
      else toasts.show('存到雲端了');
      reopen();
    } else if (res.code === 'conflict' && res.revision !== undefined) reopen({ revision: res.revision, savedAt: res.savedAt ?? 0 });
    else if (SAVE_CHECK_CODES.includes(res.code)) {
      status.textContent = res.message;
      if (await resolveSaveCheck(deps, res.code, res.message)) sheet.close();
    } else status.textContent = res.message;
  };
  const download = async () => {
    status.textContent = '下載中…';
    const res = await cloud.download();
    if (!res.ok) {
      status.textContent = res.message;
      return;
    }
    if (!res.value) {
      status.textContent = '雲端還沒有存檔';
      return;
    }
    if (!confirm(`要用雲端的存檔（${when(res.value.savedAt)}）取代這台的水缸嗎？`)) {
      status.textContent = '';
      return;
    }
    if (deps.applyCloud(res.value.save, res.value.revision)) {
      toasts.show('載入了雲端的存檔');
      sheet.close();
    } else status.textContent = '雲端的存檔讀不出來，可能是比較新的版本，請先更新遊戲';
  };

  const exportMine = async () => {
    status.textContent = '下載中…';
    const res = await cloud.exportData();
    if (!res.ok) {
      status.textContent = res.message;
      return;
    }
    await saveTextFile(`cycle-data-${session.username}.json`, JSON.stringify(res.value, null, 2)).catch(() => undefined);
    status.textContent = '';
  };
  const deleteBox = h('details.danger', {}, h('summary', {}, '刪除帳號'));
  const pass = h('input.text-input', { type: 'password', placeholder: '再輸入一次密碼', autocomplete: 'current-password', maxlength: '72' }) as HTMLInputElement;
  const deleteStatus = h('p.hint');
  deleteBox.append(
    h('p.hint', {}, '雲端存檔、好友、禮物、市場上架和還沒用完的儲值點數會全部刪除，無法復原。想退還點數請在刪除前來信申請。這台裝置上的水缸不受影響。'),
    pass,
    h(
      'button.btn.danger',
      {
        onclick: async () => {
          if (!pass.value) {
            deleteStatus.textContent = '請輸入密碼';
            return;
          }
          if (!confirm(`確定要刪除帳號「${session.username}」嗎？刪除後無法復原。`)) return;
          deleteStatus.textContent = '刪除中…';
          const res = await cloud.deleteAccount(pass.value);
          if (!res.ok) {
            deleteStatus.textContent = res.message;
            return;
          }
          toasts.show('帳號刪除了，這台的水缸還在');
          reopen();
        },
      },
      '永久刪除帳號',
    ),
    deleteStatus,
  );

  return h(
    'div.stack',
    {},
    h('p', {}, `已登入：${session.username}`),
    conflict
      ? h(
          'div.item.gift.column',
          {},
          conflict.mismatch
            ? h('div', {}, h('b', {}, '這台的存檔跟雲端那份對不上'), h('div.hint', {}, '魚的身分（品種、性別或基因）跟雲端的不一樣。要留哪一份？用這台的覆蓋的話，之後幾天不能在市場上架魚。'))
            : h('div', {}, h('b', {}, '雲端有另一台裝置的存檔'), h('div.hint', {}, `雲端那份存於 ${when(conflict.savedAt)}。要留哪一份？另一份會被蓋掉。`)),
          h(
            'div.row.wrap',
            {},
            h('button.btn.primary', { onclick: download }, '載入雲端的'),
            h('button.btn', { onclick: () => upload(true) }, '用這台的覆蓋'),
          ),
        )
      : null,
    h('div.row.wrap', {}, h('button.btn.primary', { onclick: () => upload() }, '上傳到雲端'), h('button.btn', { onclick: download }, '從雲端載入')),
    status,
    h('p.hint', {}, '登入後每 10 分鐘和離開遊戲時會自動上傳。'),
    h(
      'button.btn',
      {
        onclick: async () => {
          await cloud.logout();
          toasts.show('登出了，這台的水缸還在');
          reopen();
        },
      },
      '登出',
    ),
    h('h3', {}, '我的資料'),
    h('button.btn', { onclick: exportMine }, '下載我的資料'),
    h('p.hint', {}, '伺服器上跟你帳號有關的所有資料：存檔、好友、禮物紀錄。'),
    deleteBox,
  );
}

/**
 * 剛登入時：雲端沒有存檔就上傳這台的；雲端有就問要不要載入。
 */
export async function firstSync(deps: CloudPanelDeps): Promise<void> {
  const res = await deps.cloud.download();
  if (!res.ok) return;
  if (!res.value) {
    await forceUpload(deps);
    return;
  }
  const cloudSave = res.value;
  if (confirm(`雲端已經有這個帳號的存檔（${when(cloudSave.savedAt)}）。要載入雲端的嗎？\n按「取消」會用這台的覆蓋雲端。`)) {
    if (!deps.applyCloud(cloudSave.save, cloudSave.revision)) deps.toasts.show('雲端的存檔讀不出來，可能是比較新的版本，請先更新遊戲', 'warn');
  } else {
    await forceUpload(deps);
  }
}

/** 強制用這台的覆蓋；帳本對不上（伺服器不收）就改用雲端那份。 */
async function forceUpload(deps: CloudPanelDeps): Promise<void> {
  const res = await deps.cloud.upload(deps.saveJson(), true);
  if (!res.ok && LEDGER_CODES.includes(res.code)) await adoptCloud(deps, res.message);
}

/** 改用雲端那份（帳本對不上時，這台的存檔不能上傳）。回傳有沒有換成功。 */
async function adoptCloud(deps: CloudPanelDeps, message: string): Promise<boolean> {
  const res = await deps.cloud.download();
  if (res.ok && res.value && deps.applyCloud(res.value.save, res.value.revision)) {
    deps.toasts.show(`${message}，已改用雲端的存檔`, 'warn');
    return true;
  }
  deps.toasts.show(`${message}，請到雲端存檔載入雲端的那份`, 'warn');
  return false;
}

/**
 * 開遊戲時檢查：雲端的版本號和這台上次同步的不一樣，代表別的裝置玩過，提醒玩家。
 */
export async function checkCloudOnStart(deps: CloudPanelDeps): Promise<void> {
  const { cloud, toasts, sheet } = deps;
  if (!cloud.available || !cloud.session) return;
  const res = await cloud.download();
  if (!res.ok || !res.value || res.value.revision === cloud.session.revision) return;
  const conflict = { revision: res.value.revision, savedAt: res.value.savedAt };
  toasts.show(`雲端有別的裝置存的進度（${when(conflict.savedAt)}）`, 'info', { label: '看看', run: () => sheet.open('雲端存檔', () => cloudPanel(deps, conflict)) });
}

/**
 * 自動上傳：衝突時不覆蓋，提醒玩家去選。回傳有沒有存上去。
 * 伺服器權威模擬（L2）：裝置時間不對（遊戲時間跑得比伺服器快）時，改用伺服器補算到現在的那份；
 * 魚的身分跟雲端對不上時不覆蓋，讓玩家選要留哪一份。
 */
export async function autoUpload(deps: CloudPanelDeps): Promise<boolean> {
  const { cloud, toasts, sheet } = deps;
  if (!cloud.available || !cloud.session) return false;
  const res = await cloud.upload(deps.saveJson());
  if (res.ok) return true;
  if (res.code === 'conflict' && res.revision !== undefined) {
    const conflict = { revision: res.revision, savedAt: res.savedAt ?? 0 };
    toasts.show('雲端有別的裝置存的進度，沒有自動覆蓋', 'warn', { label: '處理', run: () => sheet.open('雲端存檔', () => cloudPanel(deps, conflict)) });
  } else if (SAVE_CHECK_CODES.includes(res.code)) return resolveSaveCheck(deps, res.code, res.message);
  return false;
}

/**
 * 伺服器的模擬檢查沒過：時間不對就改用伺服器補算的那份（回傳 true）；
 * 魚的身分對不上就提醒玩家，讓他選要留雲端的還是強制用這台的。
 */
async function resolveSaveCheck(deps: CloudPanelDeps, code: string, message: string): Promise<boolean> {
  const { cloud, toasts, sheet } = deps;
  if (LEDGER_CODES.includes(code)) return adoptCloud(deps, message);
  if (code === 'time_ahead') {
    const server = await cloud.advance();
    if (server.ok && deps.applyCloud(server.value.save, server.value.revision, true)) {
      toasts.show('裝置的時間跟伺服器對不上，改用伺服器算的進度', 'warn');
      return true;
    }
  }
  toasts.show(`${message}，沒有上傳`, 'warn', { label: '處理', run: () => sheet.open('雲端存檔', () => cloudPanel(deps, { revision: cloud.session?.revision ?? 0, savedAt: cloud.session?.syncedAt ?? 0, mismatch: true })) });
  return false;
}
