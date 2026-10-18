/**
 * Android App（Capacitor）和網頁版的差異。不直接 import @capacitor/core：
 * 網頁版用不到它，App 裡原生端會自己注入 window.Capacitor。
 */
export function isNativeApp(): boolean {
  return (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
}

/**
 * 把文字存成檔案給玩家（匯出存檔、下載我的資料）。
 * 網頁用 <a download>；App 的 WebView 不支援下載，改成寫進暫存再開分享選單（可以存到雲端硬碟、傳給自己）。
 */
export async function saveTextFile(name: string, text: string, mime = 'application/json'): Promise<void> {
  if (isNativeApp()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const file = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, files: [file.uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  // 要放進頁面裡，瀏覽器才會用 download 指定的檔名
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
