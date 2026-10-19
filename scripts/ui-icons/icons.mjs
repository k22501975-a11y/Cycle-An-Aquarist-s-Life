// 選單圖示（插畫風，跟 AI 生的工具列圖示同一款：青綠底、金框、立體陰影）。
// 每個圖示的主體用漸層和高光畫，套進 frame.svg。執行 render.mjs 輸出 public/art/ui/*.webp。

export const ICONS = {
  // 我的水缸：一個有水草、小魚的玻璃缸
  'icon-tanks': {
    defs: `
      <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fe0e6"/><stop offset="1" stop-color="#2c8f9c"/></linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e9fbff" stop-opacity="0.75"/><stop offset="0.2" stop-color="#e9fbff" stop-opacity="0.1"/><stop offset="0.85" stop-color="#e9fbff" stop-opacity="0.05"/><stop offset="1" stop-color="#e9fbff" stop-opacity="0.5"/></linearGradient>
      <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a34"/><stop offset="1" stop-color="#4b2e19"/></linearGradient>
      <linearGradient id="fishA" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff9a5a"/><stop offset="1" stop-color="#e2452f"/></linearGradient>
      <linearGradient id="soil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4a2c"/><stop offset="1" stop-color="#3a2614"/></linearGradient>`,
    body: `
      <rect x="96" y="132" width="320" height="232" rx="14" fill="url(#water)"/>
      <rect x="96" y="132" width="320" height="34" rx="10" fill="#d9f7fb" opacity="0.55"/>
      <path d="M96,330 Q180,312 256,326 T416,318 L416,350 Q416,364 402,364 L110,364 Q96,364 96,350 Z" fill="url(#soil)"/>
      <path d="M150,330 C142,280 168,250 152,208 M150,330 C170,288 196,272 190,226 M182,328 C200,300 222,292 222,254" stroke="#3fa65a" stroke-width="10" fill="none" stroke-linecap="round"/>
      <ellipse cx="152" cy="208" rx="12" ry="22" fill="#5fcf72" transform="rotate(-12 152 208)"/>
      <ellipse cx="190" cy="226" rx="11" ry="20" fill="#4fbf63" transform="rotate(14 190 226)"/>
      <ellipse cx="222" cy="254" rx="10" ry="18" fill="#6edb80"/>
      <path d="M330,330 C326,300 344,282 340,256 M352,330 C360,306 378,296 374,272" stroke="#2f8f4a" stroke-width="9" fill="none" stroke-linecap="round"/>
      <ellipse cx="340" cy="256" rx="10" ry="18" fill="#47b45e"/><ellipse cx="374" cy="272" rx="9" ry="16" fill="#5fcf72"/>
      <g transform="translate(286 232)"><path d="M-40,0 Q-14,-24 22,-6 Q30,0 22,6 Q-14,24 -40,0 Z" fill="url(#fishA)"/><path d="M20,0 L52,-22 Q44,0 52,22 Z" fill="#ff7a4a" opacity="0.9"/><circle cx="-26" cy="-3" r="5" fill="#1b1b1b"/><circle cx="-27.5" cy="-4.5" r="1.8" fill="#fff"/></g>
      <g transform="translate(206 186) scale(0.6)"><path d="M-40,0 Q-14,-24 22,-6 Q30,0 22,6 Q-14,24 -40,0 Z" fill="#6fd2ff"/><path d="M20,0 L52,-22 Q44,0 52,22 Z" fill="#3c8de0"/><circle cx="-26" cy="-3" r="5" fill="#1b1b1b"/></g>
      <circle cx="320" cy="180" r="7" fill="#fff" opacity="0.6"/><circle cx="332" cy="160" r="4.5" fill="#fff" opacity="0.5"/>
      <rect x="96" y="132" width="320" height="232" rx="14" fill="url(#glass)"/>
      <rect x="96" y="132" width="320" height="232" rx="14" fill="none" stroke="#e8fbff" stroke-width="6" stroke-opacity="0.9"/>
      <rect x="84" y="112" width="344" height="22" rx="8" fill="#2b3a3e"/><rect x="84" y="112" width="344" height="8" rx="4" fill="#4c6066"/>
      <rect x="74" y="364" width="364" height="34" rx="8" fill="url(#wood)"/><rect x="74" y="364" width="364" height="8" rx="4" fill="#b07a4a" opacity="0.8"/>`,
  },

  // 商城：發光的寶石（儲值點數）
  'icon-mall': {
    defs: `
      <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd1f0"/><stop offset="1" stop-color="#d94fa8"/></linearGradient>
      <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f58bd0"/><stop offset="1" stop-color="#8e2a74"/></linearGradient>
      <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c04497"/><stop offset="1" stop-color="#5a1748"/></linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffc6ec" stop-opacity="0.75"/><stop offset="1" stop-color="#ffc6ec" stop-opacity="0"/></radialGradient>
      <radialGradient id="coin" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff3c4"/><stop offset="0.5" stop-color="#e9b94f"/><stop offset="1" stop-color="#8f6420"/></radialGradient>`,
    body: `
      <circle cx="256" cy="236" r="190" fill="url(#glow)"/>
      <path d="M156,190 L206,132 L306,132 L356,190 L256,356 Z" fill="url(#g3)"/>
      <path d="M156,190 L356,190 L256,356 Z" fill="url(#g2)"/>
      <path d="M206,132 L256,190 L306,132 Z" fill="url(#g1)"/>
      <path d="M156,190 L206,132 L226,190 Z" fill="#ffb3e3"/>
      <path d="M306,132 L356,190 L286,190 Z" fill="#b8368e"/>
      <path d="M226,190 L256,356 L156,190 Z" fill="#f07cc7"/>
      <path d="M286,190 L256,356 L356,190 Z" fill="#a52b80"/>
      <path d="M156,190 L206,132 L306,132 L356,190 L256,356 Z" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="4" stroke-linejoin="round"/>
      <path d="M196,176 L214,150" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity="0.85"/>
      <g transform="translate(352 330)"><circle r="54" fill="url(#coin)"/><circle r="40" fill="none" stroke="#8f6420" stroke-opacity="0.55" stroke-width="5"/><text y="17" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="50" fill="#7a5418">P</text></g>
      <path d="M128,118 l7,18 l18,7 l-18,7 l-7,18 l-7,-18 l-18,-7 l18,-7 z" fill="#fff8d8"/>
      <path d="M380,102 l5,12 l12,5 l-12,5 l-5,12 l-5,-12 l-12,-5 l12,-5 z" fill="#fff8d8" opacity="0.9"/>`,
  },

  // 圖鑑：攤開的書，左頁畫一條孔雀魚，右頁文字線
  'icon-codex': {
    defs: `
      <linearGradient id="cover" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b3b2c"/><stop offset="1" stop-color="#5a1d14"/></linearGradient>
      <linearGradient id="pageL" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#d8c8a0"/><stop offset="0.18" stop-color="#fbf2da"/><stop offset="1" stop-color="#f2e5c2"/></linearGradient>
      <linearGradient id="pageR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d8c8a0"/><stop offset="0.18" stop-color="#fbf2da"/><stop offset="1" stop-color="#f2e5c2"/></linearGradient>
      <linearGradient id="tail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3fa0e8"/><stop offset="1" stop-color="#7a4fe0"/></linearGradient>`,
    body: `
      <path d="M86,152 Q170,128 256,160 Q342,128 426,152 L426,378 Q342,354 256,386 Q170,354 86,378 Z" fill="url(#cover)"/>
      <path d="M100,140 Q176,116 252,148 L252,364 Q176,334 100,356 Z" fill="url(#pageL)"/>
      <path d="M260,148 Q336,116 412,140 L412,356 Q336,334 260,364 Z" fill="url(#pageR)"/>
      <path d="M256,150 L256,382" stroke="#a88a58" stroke-width="4"/>
      <g transform="translate(168 236)">
        <path d="M18,0 Q60,-46 82,-30 Q70,0 82,30 Q60,46 18,0 Z" fill="url(#tail)"/>
        <path d="M30,0 Q58,-26 74,-18 M30,0 Q62,0 76,0 M30,0 Q58,26 74,18" stroke="#fff" stroke-opacity="0.5" stroke-width="2.5" fill="none"/>
        <path d="M-52,0 Q-30,-22 6,-12 Q24,-4 24,0 Q24,4 6,12 Q-30,22 -52,0 Z" fill="#f6b25a"/>
        <path d="M-20,-14 Q-6,-30 10,-14" fill="#3fa0e8"/>
        <circle cx="-38" cy="-3" r="5" fill="#1b1b1b"/><circle cx="-39.5" cy="-4.5" r="1.6" fill="#fff"/>
      </g>
      <path d="M128,312 L224,322" stroke="#b49c6c" stroke-width="7" stroke-linecap="round"/>
      <path d="M288,176 L384,168 M288,206 L384,198 M288,236 L370,229 M288,266 L384,258 M288,296 L356,290" stroke="#a48c5c" stroke-width="8" stroke-linecap="round" opacity="0.8"/>
      <path d="M332,124 L332,192 L346,180 L360,192 L360,120 Z" fill="#e3bd6d" stroke="#9c7027" stroke-width="3"/>`,
  },

  // 紀錄：夾板上的水質趨勢圖
  'icon-records': {
    defs: `
      <linearGradient id="board" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b98450"/><stop offset="1" stop-color="#6e4422"/></linearGradient>
      <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#efe3c6"/></linearGradient>
      <linearGradient id="clip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef3f4"/><stop offset="1" stop-color="#7f9195"/></linearGradient>
      <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4fc3a1" stop-opacity="0.55"/><stop offset="1" stop-color="#4fc3a1" stop-opacity="0.05"/></linearGradient>`,
    body: `
      <rect x="122" y="96" width="268" height="330" rx="22" fill="url(#board)"/>
      <rect x="146" y="132" width="220" height="270" rx="8" fill="url(#paper)"/>
      <rect x="206" y="80" width="100" height="44" rx="12" fill="url(#clip)"/><circle cx="256" cy="94" r="9" fill="#5a6b70"/>
      <path d="M166,190 L346,190 M166,240 L346,240 M166,290 L346,290 M166,340 L346,340" stroke="#d9cba8" stroke-width="3"/>
      <path d="M166,366 L166,330 L204,300 L236,316 L270,250 L304,262 L346,200 L346,366 Z" fill="url(#area)"/>
      <path d="M166,330 L204,300 L236,316 L270,250 L304,262 L346,200" stroke="#2e9b7c" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="346" cy="200" r="11" fill="#e3bd6d" stroke="#fff" stroke-width="4"/>
      <path d="M166,368 L346,368" stroke="#8a7a58" stroke-width="5" stroke-linecap="round"/>
      <path d="M176,160 L260,160" stroke="#8a7a58" stroke-width="8" stroke-linecap="round"/>`,
  },

  // 教學：阿德老闆的對話框
  'icon-guide': {
    defs: `
      <linearGradient id="bubble" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e8dcc0"/></linearGradient>
      <radialGradient id="bulb" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fffbe0"/><stop offset="0.55" stop-color="#ffd659"/><stop offset="1" stop-color="#d99a1e"/></radialGradient>
      <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe9a0" stop-opacity="0.8"/><stop offset="1" stop-color="#ffe9a0" stop-opacity="0"/></radialGradient>`,
    body: `
      <path d="M108,132 Q108,100 140,100 L372,100 Q404,100 404,132 L404,290 Q404,322 372,322 L218,322 L156,384 L166,322 L140,322 Q108,322 108,290 Z" fill="url(#bubble)"/>
      <path d="M108,132 Q108,100 140,100 L372,100 Q404,100 404,132 L404,150 Q256,128 108,170 Z" fill="#fff" opacity="0.6"/>
      <circle cx="256" cy="200" r="110" fill="url(#halo)"/>
      <path d="M220,250 Q206,222 206,196 A50,50 0 1 1 306,196 Q306,222 292,250 Z" fill="url(#bulb)"/>
      <rect x="222" y="250" width="68" height="16" rx="6" fill="#8b9da1"/><rect x="226" y="268" width="60" height="14" rx="6" fill="#6d7f84"/><rect x="238" y="284" width="36" height="10" rx="5" fill="#556469"/>
      <path d="M240,246 L240,214 Q256,200 272,214 L272,246" stroke="#c4801a" stroke-width="5" fill="none"/>
      <path d="M228,170 Q238,150 258,148" stroke="#fff" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.9"/>
      <path d="M170,190 L148,182 M178,140 L160,124 M342,190 L364,182 M334,140 L352,124 M256,118 L256,104" stroke="#e3a92c" stroke-width="7" stroke-linecap="round"/>`,
  },

  // 設定：金屬齒輪
  'icon-settings': {
    defs: `
      <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f6f7"/><stop offset="0.45" stop-color="#a9b9bd"/><stop offset="1" stop-color="#55676c"/></linearGradient>
      <radialGradient id="hub" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fbe7a6"/><stop offset="1" stop-color="#9c7027"/></radialGradient>
      <linearGradient id="metal2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d7e2e4"/><stop offset="1" stop-color="#4a5a5f"/></linearGradient>`,
    body: `
      <g transform="translate(232 252)">
        <path id="cog" d="${cog(0, 0, 128, 98, 10)}" fill="url(#metal)" stroke="#3d4c50" stroke-width="4" stroke-linejoin="round"/>
        <circle r="62" fill="#284347"/><circle r="50" fill="url(#hub)" stroke="#6e4f1c" stroke-width="4"/>
        <circle r="18" fill="#284347"/>
        <path d="M-80,-60 A100,100 0 0 1 20,-98" stroke="#fff" stroke-width="8" fill="none" opacity="0.6" stroke-linecap="round"/>
      </g>
      <g transform="translate(366 352)">
        <path d="${cog(0, 0, 64, 48, 8)}" fill="url(#metal2)" stroke="#3d4c50" stroke-width="4" stroke-linejoin="round"/>
        <circle r="22" fill="#284347"/><circle r="14" fill="url(#hub)"/>
      </g>`,
  },

  // 新遊戲：剛冒芽的小苗（重新開始）
  'icon-newgame': {
    defs: `
      <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b8f28a"/><stop offset="1" stop-color="#3a9a4c"/></linearGradient>
      <linearGradient id="pot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5232"/><stop offset="1" stop-color="#3b2614"/></linearGradient>
      <radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff1b0" stop-opacity="0.9"/><stop offset="1" stop-color="#fff1b0" stop-opacity="0"/></radialGradient>`,
    body: `
      <circle cx="256" cy="200" r="150" fill="url(#sun)"/>
      <path d="M256,330 C256,280 250,240 256,196" stroke="#4aa858" stroke-width="16" fill="none" stroke-linecap="round"/>
      <path d="M256,226 C210,236 150,214 132,160 C190,140 246,168 256,226 Z" fill="url(#leaf)"/>
      <path d="M256,226 C206,214 170,192 150,168" stroke="#2f7d3c" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>
      <path d="M258,198 C300,214 362,196 384,136 C326,116 268,140 258,198 Z" fill="url(#leaf)"/>
      <path d="M258,198 C302,186 340,166 366,144" stroke="#2f7d3c" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.7"/>
      <path d="M150,170 Q176,152 210,156" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.55"/>
      <path d="M136,318 Q256,292 376,318 L360,404 Q256,420 152,404 Z" fill="url(#pot)"/>
      <ellipse cx="256" cy="318" rx="120" ry="20" fill="#5a3a20"/><ellipse cx="256" cy="316" rx="104" ry="13" fill="#2a1a0c"/>
      <path d="M372,96 l6,16 l16,6 l-16,6 l-6,16 l-6,-16 l-16,-6 l16,-6 z" fill="#fff8d8"/>`,
  },
};

/** 齒輪外形：teeth 個齒，外徑 R、內徑 r。 */
function cog(cx, cy, R, r, teeth) {
  const pts = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const w = step * 0.22;
    pts.push([a - step / 2 + w * 0.6, r], [a - w, R], [a + w, R], [a + step / 2 - w * 0.6, r]);
  }
  return 'M' + pts.map(([a, rad]) => `${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad).toFixed(1)}`).join(' L') + ' Z';
}
