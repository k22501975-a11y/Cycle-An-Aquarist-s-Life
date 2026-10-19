import { h } from './dom';

/**
 * 插畫風圖示（public/art/ui/*.webp）：工具列用 AI 生的那批，選單用 scripts/ui-icons 畫的那批，同一款青綠底金框。
 * 選單改成圖示卡片、面板標題前面也放對應的圖示，介面不再只有文字。
 */
export type ArtIcon =
  | 'feed'
  | 'waterchange'
  | 'testkit'
  | 'trim'
  | 'shop'
  | 'gear'
  | 'net'
  | 'split'
  | 'friends'
  | 'market'
  | 'tanks'
  | 'mall'
  | 'codex'
  | 'records'
  | 'guide'
  | 'settings'
  | 'newgame'
  | 'owner'
  | 'bacteria'
  | 'media-transfer';

export function artUrl(name: ArtIcon): string {
  return `${import.meta.env.BASE_URL}art/ui/icon-${name}.webp`;
}

/** 圖示圖片；載入失敗就整個拿掉（不留破圖）。 */
export function artImg(name: ArtIcon, cls = 'art-icon'): HTMLImageElement {
  const img = h(`img.${cls}`, { src: artUrl(name), alt: '', draggable: 'false', decoding: 'async' });
  img.addEventListener('error', () => img.remove());
  return img;
}

/** 阿德老闆的頭像（插畫，第 11 批）；載入失敗退回選單用的小圖示。 */
export function ownerImg(cls: string): HTMLImageElement {
  const img = h(`img.${cls}.portrait`, { src: `${import.meta.env.BASE_URL}art/ui/owner-portrait.webp`, alt: '阿德老闆', draggable: 'false' });
  img.addEventListener('error', () => img.replaceWith(artImg('owner', cls)), { once: true });
  return img;
}

/** 面板標題對應的圖示（Sheet 開啟時放在標題左邊）。 */
const SHEET_ART: Record<string, ArtIcon> = {
  我的水缸: 'tanks',
  好友: 'friends',
  市場: 'market',
  上架: 'market',
  商城: 'mall',
  點數明細: 'mall',
  圖鑑: 'codex',
  紀錄: 'records',
  設定: 'settings',
  雲端存檔: 'settings',
  開發者數值: 'settings',
  商店: 'shop',
  購買: 'shop',
  設備與維護: 'gear',
  餵食: 'feed',
  換水: 'waterchange',
  水質測試: 'testkit',
  修剪水草: 'trim',
  水草: 'trim',
  分缸: 'split',
  死掉的魚: 'net',
  檢疫盒: 'split',
};

export function sheetArt(title: string): ArtIcon | null {
  return SHEET_ART[title] ?? null;
}

/** 選單的一格：圖示＋標題＋一行說明。 */
export function menuTile(icon: ArtIcon, title: string, sub: string, onclick: () => void, cls = ''): HTMLButtonElement {
  return h(`button.menu-tile${cls}`, { onclick }, artImg(icon, 'menu-art'), h('span.menu-text', {}, h('b', {}, title), h('small', {}, sub)));
}
