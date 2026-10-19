import { describe, expect, it } from 'vitest';
import type { CloudClient, CloudResult } from '../net/cloud';
import type { Sheet, Toasts } from './sheet';
import { autoUpload, firstSync, type CloudPanelDeps } from './cloud-panel';

/** 伺服器帳本比這份存檔新：上傳一律 422 ledger_behind（docs/ledger.md §3.4）。 */
function ledgerBehind(code = 'ledger_behind') {
  const applied: { save: unknown; revision: number }[] = [];
  const toasts: string[] = [];
  let uploads = 0;
  const cloud = {
    available: true,
    session: { token: 't', username: 'aquarist', revision: 3 },
    upload: async (): Promise<CloudResult<never>> => {
      uploads++;
      return { ok: false, code, message: '這份存檔少了市場的收支紀錄，請改用雲端那份' };
    },
    download: async () => ({ ok: true as const, value: { revision: 5, savedAt: 100, save: { cloud: true } } }),
  } as unknown as CloudClient;
  const deps: CloudPanelDeps = {
    cloud,
    sheet: { open: () => undefined, close: () => undefined } as unknown as Sheet,
    toasts: { show: (text: string) => void toasts.push(text) } as unknown as Toasts,
    saveJson: () => '{}',
    applyCloud: (save, revision) => {
      applied.push({ save, revision });
      return true;
    },
  };
  return { deps, applied, toasts, uploads: () => uploads };
}

describe('雲端存檔：帳本對不上', () => {
  it('自動上傳收到 ledger_behind 就改用雲端那份，之後不會一直卡住', async () => {
    const t = ledgerBehind();
    expect(await autoUpload(t.deps)).toBe(true);
    expect(t.applied).toEqual([{ save: { cloud: true }, revision: 5 }]);
    expect(t.toasts[0]).toContain('已改用雲端的存檔');
  });

  it('ledger_ahead 也一樣改用雲端那份', async () => {
    const t = ledgerBehind('ledger_ahead');
    expect(await autoUpload(t.deps)).toBe(true);
    expect(t.applied).toHaveLength(1);
  });

  it('登入時選「用這台的覆蓋」被帳本擋下，也改用雲端那份', async () => {
    const t = ledgerBehind();
    const confirm = globalThis.confirm;
    globalThis.confirm = () => false;
    try {
      await firstSync(t.deps);
    } finally {
      globalThis.confirm = confirm;
    }
    expect(t.uploads()).toBe(1);
    expect(t.applied).toHaveLength(1);
  });
});
