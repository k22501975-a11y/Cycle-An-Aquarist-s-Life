"""母孔雀魚分品系：母魚身體一樣是灰金色，只有尾鰭（和一點背鰭）帶品系的顏色。
藍：藍草尾（藍尾帶細黑點）；禮服：藍尾禮服（純藍尾、後半身偏暗）；紅：紅蛇王；金：黃金蛇王；白子：全紅白子（淡紅尾、紅眼）。
用法（repo 根目錄）：python3 scripts/art/guppy-females.py <輸出資料夾>"""
import sys, colorsys, numpy as np
from PIL import Image
OUT = sys.argv[1]
TINTS = {'blue': (212, 0.75, 1.0), 'tuxedo': (214, 0.8, 0.95), 'red': (4, 0.85, 0.95), 'gold': (44, 0.85, 1.05), 'albino': (6, 0.6, 1.08)}

def hsl_tint(rgb, hue, sat, light):
  r, g, b = [rgb[..., i] / 255 for i in range(3)]
  mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
  l = (mx + mn) / 2 * light
  s = np.full_like(l, sat)
  h = hue / 360
  def f(n):
    k = (n + h * 12) % 12
    a = s * np.minimum(l, 1 - l)
    return l - a * np.clip(np.minimum(k - 3, 9 - k), -1, 1)
  return np.stack([f(0), f(8), f(4)], -1) * 255

def peduncle(al, W):
  best = None
  for x in range(int(W * 0.15), int(W * 0.45)):
    col = np.where(al[:, x] > 128)[0]
    if len(col) == 0: continue
    h = col.max() - col.min()
    if best is None or h < best[0]: best = (h, x)
  return best[1]

def make(name, tint):
  a = np.asarray(Image.open(f'public/art/fish/{name}.webp').convert('RGBA')).astype(np.float32)
  H, W = a.shape[:2]; al = a[..., 3]
  px = peduncle(al, W)
  yy, xx = np.mgrid[:H, :W].astype(np.float32)
  # 尾鰭：尾柄往後；尾柄附近慢慢過渡
  m = np.clip((px - 8 - xx) / 14, 0, 1)
  # 背鰭（身體上緣往上突出的部分）帶一點點
  top = np.array([np.argmax(al[:, x] > 128) if al[:, x].max() > 128 else H for x in range(W)])
  hue, sat, light = TINTS[tint]
  out = a.copy()
  tinted = hsl_tint(a[..., :3], hue, sat, light)
  # 保留原本的明暗：顏色往目標色推，亮部留一點原本的光
  k = (0.85 * m)[..., None]
  out[..., :3] = a[..., :3] * (1 - k) + tinted * k
  if tint == 'blue':
    rng = np.random.default_rng(5)
    dots = np.zeros((H, W), np.float32)
    for _ in range(int(W * H * 0.0012)):
      x = rng.integers(0, max(1, px)); y = rng.integers(0, H); r = rng.uniform(1.2, 2.4)
      dots += np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (r * r))
    d = np.clip(dots, 0, 1) * m * 0.75
    out[..., :3] *= (1 - d)[..., None]
  if tint == 'tuxedo':
    # 禮服母魚：後半身（尾柄往前約四成身長）偏暗，像公魚的黑外套淡淡一層
    col = np.where(al[:, px] > 128)[0]
    cy, ph = (col.min() + col.max()) / 2, (col.max() - col.min()) / 2
    # 只蓋身體（尾柄往前慢慢變高的帶狀），不蓋背鰭、臀鰭
    half = ph + (xx - px) * 0.2
    band = np.clip((half - np.abs(yy - cy)) / 4, 0, 1)
    body = np.clip((xx - (px - 6)) / 10, 0, 1) * np.clip((px + 0.42 * (W - px) - xx) / 22, 0, 1) * band
    navy = np.array([20, 26, 48], np.float32)
    out[..., :3] = out[..., :3] * (1 - 0.72 * body)[..., None] + navy * (0.72 * body)[..., None]
  if tint == 'albino':
    # 白子：眼睛是寶石紅（找右邊兩成裡最暗的地方當瞳孔）
    darkm = ((a[..., :3].mean(-1) < 60) & (al > 200)).astype(np.float32)
    darkm[:, :int(W * 0.75)] = 0
    c = darkm.cumsum(0).cumsum(1); r_ = 6
    dens = np.zeros_like(darkm)
    dens[r_:-r_, r_:-r_] = c[2*r_:, 2*r_:] - c[:-2*r_, 2*r_:] - c[2*r_:, :-2*r_] + c[:-2*r_, :-2*r_]
    ey, ex = np.unravel_index(dens.argmax(), dens.shape)
    near = ((xx - ex) ** 2 + (yy - ey) ** 2) < 16 ** 2
    dark = near & (a[..., :3].mean(-1) < 90)
    kk = 1 - a[..., :3].mean(-1) / 90
    out[..., 0] = np.where(dark, 110 + 120 * kk, out[..., 0])
    out[..., 1] = np.where(dark, 8 + 30 * kk, out[..., 1])
    out[..., 2] = np.where(dark, 22 + 30 * kk, out[..., 2])
  Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGBA').save(f'{OUT}/{name[:-7]}-{tint}-eating.webp' if name.endswith('-eating') else f'{OUT}/{name}-{tint}.webp', 'WEBP', quality=90)

for name in ['guppy-female-base', 'guppy-female-pregnant', 'guppy-female-base-eating']:
  for tint in TINTS:
    make(name, tint)
