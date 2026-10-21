// 原本的向量店面（src/intro.ts 舊版），櫥窗裡的魚和水草換成遊戲裡的圖，只給 render.mjs 截圖用。
function shopWindow(x, flip) {
  // 一格櫥窗：上下兩層水缸、裡面有草和幾條魚，玻璃上一道斜光，窗台下的光灑到人行道
  const A='http://127.0.0.1:5179/art/';const FISH={'#ff8a4a':'guppy-male-redcobra-halfmoon','#5ad0ff':'guppy-male-bluegrass-swallow','#ffd36a':'guppy-male-cobra'};
  const fish = (cx, cy, c, d) => `<image href="${A}fish/${FISH[c]}.webp" x="${-32}" y="${-22}" width="64" height="44" preserveAspectRatio="xMidYMid meet" transform="translate(${cx+15*d} ${cy}) scale(${d} 1)"/>`;
  const tank = (y, h, k) => `
      <rect x="${x + 22}" y="${y}" width="256" height="${h}" rx="3" fill="url(#itank)"/>
      <rect x="${x + 22}" y="${y + h - 14}" width="256" height="14" fill="#c9b48a" opacity="0.85"/>
      <image href="${A}scape/plant-rotala.webp" x="${x + 24 + k * 30}" y="${y + h*0.12}" width="70" height="${h*0.82}" preserveAspectRatio="xMidYMax meet"/><image href="${A}scape/plant-eleocharis.webp" x="${x + 190 - k * 25}" y="${y + h*0.35}" width="84" height="${h*0.6}" preserveAspectRatio="xMidYMax meet"/>
      <image href="${A}scape/plant-anubias.webp" x="${x + 160 - k * 60}" y="${y + h - 46}" width="64" height="40" preserveAspectRatio="xMidYMax meet"/>
      ${fish(x + 120 + k * 40, y + h * 0.4, '#ff8a4a', flip ? -1 : 1)}${fish(x + 170 - k * 30, y + h * 0.6, '#5ad0ff', flip ? 1 : -1)}${fish(x + 95, y + h * 0.7, '#ffd36a', 1)}
      <rect x="${x + 22}" y="${y}" width="256" height="5" fill="#e9fbff" opacity="0.5"/>`;
  return `
    <rect x="${x}" y="400" width="300" height="300" rx="6" fill="url(#iglow)"/>
    ${tank(420, 120, 0)}
    <rect x="${x + 14}" y="548" width="272" height="10" fill="#4a3020"/>
    ${tank(566, 110, 1)}
    <path d="M${x + 30} 690 L${x + 120} 410 h36 L${x + 66} 690 z M${x + 150} 690 L${x + 230} 410 h14 L${x + 164} 690 z" fill="#ffffff" opacity="0.07"/>
    <rect x="${x}" y="400" width="300" height="300" rx="6" fill="none" stroke="url(#iwood)" stroke-width="16"/>
    <rect x="${x - 14}" y="700" width="328" height="16" rx="3" fill="#5c3a23"/>
    <rect x="${x - 14}" y="700" width="328" height="3" fill="#e7c27d" opacity="0.4"/>
    <rect x="${x - 14}" y="716" width="328" height="44" fill="url(#ispill)"/>`;
}

export function svgShopFront() {
  // 夜裡的小水族館：木牆、亮著的櫥窗和水缸、燈照著招牌、門縫透出店裡的暖光（向量畫，不用另外生圖）
  const planks = Array.from({ length: 21 }, (_, i) => `<path d="M180 ${300 + i * 30} h1240" />`).join('');
  return `<svg class="intro-shop" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#081524"/><stop offset="1" stop-color="#1c2b3a"/></linearGradient>
      <linearGradient id="iwall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3a30"/><stop offset="1" stop-color="#2a201b"/></linearGradient>
      <radialGradient id="iglow" cx="0.5" cy="0.55" r="0.6"><stop offset="0" stop-color="#ffd890" stop-opacity="0.95"/><stop offset="0.55" stop-color="#e9a95a" stop-opacity="0.55"/><stop offset="1" stop-color="#7a4a20" stop-opacity="0.15"/></radialGradient>
      <radialGradient id="ilamp" cx="0.5" cy="0" r="1"><stop offset="0" stop-color="#ffe2a8" stop-opacity="0.55"/><stop offset="1" stop-color="#ffe2a8" stop-opacity="0"/></radialGradient>
      <linearGradient id="ispill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffcf7a" stop-opacity="0.12"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></linearGradient>
      <radialGradient id="ishade" cx="0.5" cy="0.6" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
      <linearGradient id="itank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fdbe6"/><stop offset="1" stop-color="#1d6f82"/></linearGradient>
      <linearGradient id="iwood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5c3a23"/><stop offset="0.45" stop-color="#9a6a42"/><stop offset="1" stop-color="#4f311d"/></linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#isky)"/>
    <g fill="#e8eef5" opacity="0.6"><circle cx="160" cy="90" r="2"/><circle cx="420" cy="150" r="1.5"/><circle cx="1290" cy="80" r="2"/><circle cx="1480" cy="170" r="1.4"/><circle cx="980" cy="60" r="1.6"/></g>
    <rect x="180" y="170" width="1240" height="730" fill="url(#iwall)"/>
    <g stroke="#1a1310" stroke-opacity="0.45" stroke-width="2">${planks}</g>
    <rect x="160" y="150" width="1280" height="40" rx="6" fill="#2a201b"/>
    <path d="M200 190 h1200 l-40 70 h-1120 z" fill="#2f5e5a"/>
    <path d="M200 190 h1200 l-40 70 h-1120 z" fill="none" stroke="#e7c27d" stroke-opacity="0.35" stroke-width="3"/>
    <g class="intro-awning">${Array.from({ length: 12 }, (_, i) => `<path d="M${240 + i * 93} 260 q46 40 93 0" fill="${i % 2 ? '#e7dcc4' : '#2f5e5a'}"/>`).join('')}</g>
    <!-- 招牌：上面兩盞鵝頸燈打亮木牌，字帶一點暖光 -->
    <path d="M520 280 L470 470 h660 L1080 280 z" fill="url(#ilamp)"/>
    <g stroke="#1a1411" stroke-width="5" fill="none"><path d="M620 274 q0 -14 20 -14 h16"/><path d="M980 274 q0 -14 -20 -14 h-16"/></g>
    <g fill="#e7c27d"><path d="M606 274 h28 l-6 12 h-16 z"/><path d="M966 274 h28 l-6 12 h-16 z"/></g>
    <rect x="556" y="292" width="488" height="74" rx="10" fill="url(#iwood)" stroke="#e7c27d" stroke-width="3"/>
    <rect x="570" y="304" width="460" height="50" rx="6" fill="#1a1411" opacity="0.55"/>
    <text x="800" y="342" text-anchor="middle" font-size="40" font-weight="700" letter-spacing="10" fill="#ffe2a0" stroke="#ffb850" stroke-opacity="0.35" stroke-width="5" paint-order="stroke" font-family="'Noto Sans TC', system-ui, sans-serif">阿德水族館</text>
    ${shopWindow(250, false)}${shopWindow(1050, true)}
    <!-- 門：門框後面是店裡的光，兩扇門板往兩邊開 -->
    <rect x="640" y="400" width="320" height="500" fill="#ffe2a8"/>
    <rect x="640" y="400" width="320" height="500" fill="url(#iglow)"/>
    <g opacity="0.5"><rect x="664" y="520" width="272" height="96" rx="3" fill="url(#itank)"/><rect x="664" y="640" width="272" height="96" rx="3" fill="url(#itank)"/><g fill="#7a4a20"><rect x="656" y="616" width="288" height="24"/><rect x="656" y="736" width="288" height="18"/><rect x="796" y="520" width="8" height="216"/></g></g>
    <path d="M600 900 L640 860 h320 L1000 900 z" fill="#ffcf7a" opacity="0.18"/>
    <g class="intro-door-l"><rect x="640" y="400" width="160" height="500" fill="url(#iwood)"/><rect x="662" y="430" width="116" height="200" rx="6" fill="#ffd890" opacity="0.8"/><path d="M672 620 l50 -180 h16 l-50 180 z" fill="#fff" opacity="0.18"/><rect x="662" y="660" width="116" height="200" rx="6" fill="none" stroke="#3e2716" stroke-width="5"/><circle cx="782" cy="680" r="7" fill="#e7c27d"/></g>
    <g class="intro-door-r"><rect x="800" y="400" width="160" height="500" fill="url(#iwood)"/><rect x="822" y="430" width="116" height="200" rx="6" fill="#ffd890" opacity="0.8"/><path d="M832 620 l50 -180 h16 l-50 180 z" fill="#fff" opacity="0.18"/><rect x="822" y="660" width="116" height="200" rx="6" fill="none" stroke="#3e2716" stroke-width="5"/><circle cx="818" cy="680" r="7" fill="#e7c27d"/>
      <g transform="translate(880 470) rotate(-4)"><path d="M-30 -30 L0 -50 L30 -30" stroke="#2a201b" stroke-width="2" fill="none"/><rect x="-44" y="-30" width="88" height="34" rx="5" fill="#2f5e5a" stroke="#e7c27d" stroke-width="2"/><text y="-7" text-anchor="middle" font-size="18" font-weight="700" letter-spacing="3" fill="#ffe2a0" font-family="system-ui, sans-serif">OPEN</text></g></g>
    <rect x="630" y="390" width="340" height="510" fill="none" stroke="#2a201b" stroke-width="20"/>
    <!-- 門邊一盆龜背芋 -->
    <g transform="translate(570 900)"><path d="M-26 0 l6 -60 h40 l6 60 z" fill="#6b4429"/><g fill="#2f6b3a"><path d="M0 -60 q-60 -30 -50 -110 q40 30 50 110"/><path d="M0 -60 q55 -40 40 -120 q-40 40 -40 120"/><path d="M0 -60 q-10 -70 20 -140 q20 70 -20 140" fill="#3f8a4a"/></g></g>
    <rect x="0" y="880" width="1600" height="20" fill="#14100e"/>
    <rect width="1600" height="900" fill="url(#ishade)"/>
  </svg>`;
}

