"""蛇王重畫（YenWel 2026-10-21 給的實拍參考）：
- 紅蛇王：銀粉色的身體上是粗細分明、彎來彎去的紅色迷宮紋，頭偏銀；尾鰭、背鰭是整片飽和的大紅，只有鰭條明暗。
- 黃金蛇王：淡金色身體上是黑褐色的迷宮紋（蛇皮）；尾鰭、背鰭是黃綠色底上沿著鰭條走的深色網紋，尾緣漸漸淡成藍白細絲，尾柄旁一塊深色斑。
花紋是程式畫的（雜訊的等高線當紋路），明暗取自原圖，所以筆觸和其他孔雀魚一樣。
用法（repo 根目錄）：python3 scripts/art/guppy-cobra.py <原圖資料夾> <輸出資料夾>
原圖資料夾放 guppy-male-cobra.webp、guppy-male-redcobra.webp（和 -swallow），輸出同名檔。"""
import sys, numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]


def blur(f, sx, sy=None):
  sy = sx if sy is None else sy
  H, W = f.shape
  ky = np.fft.fftfreq(H)[:, None]; kx = np.fft.fftfreq(W)[None, :]
  g = np.exp(-2 * np.pi ** 2 * ((sx * kx) ** 2 + (sy * ky) ** 2))
  return np.real(np.fft.ifft2(np.fft.fft2(f) * g))


def noise(H, W, seed, sx, sy):
  n = blur(np.random.default_rng(seed).standard_normal((H, W)), sx, sy)
  return n / n.std()


def lines(n, width):
  """雜訊的零等高線：彎彎曲曲、互相連在一起的線（蛇皮、迷宮紋）。"""
  return np.exp(-(n / width) ** 2)


def peduncle(al):
  H, W = al.shape; best = None
  for x in range(int(W * 0.15), int(W * 0.55)):
    col = np.where(al[:, x] > 128)[0]
    if len(col) == 0: continue
    h = col.max() - col.min()
    if best is None or h < best[0]: best = (h, x, (col.max() + col.min()) / 2)
  return best[1], best[2], best[0] / 2


def regions(a):
  """身體、尾鰭、其他鰭（背鰭、臀鰭、腹鰭）的遮罩（0–1）。"""
  al = a[..., 3] / 255; H, W = al.shape
  px, py, ph = peduncle(a[..., 3])
  cols = np.where(al.max(0) > 0.5)[0]; xmax = cols.max(); L = xmax - px
  top = np.array([np.argmax(al[:, x] > 0.5) if al[:, x].max() > 0.5 else H for x in range(W)], float)
  bot = np.array([H - 1 - np.argmax(al[::-1, x] > 0.5) if al[:, x].max() > 0.5 else 0 for x in range(W)], float)
  # 背鰭、臀鰭在身體中後段：那一段身體的上下緣用尾柄和頭前段之間的弧線代替
  xa = int(px + 0.62 * L)
  xs = np.arange(W, dtype=float)
  t = np.clip((xs - px) / max(1, xa - px), 0, 1)
  bulge = np.sin(np.pi * t) * 0.06 * L
  tl = np.where(xs < xa, (py - ph) + (top[xa] - (py - ph)) * t - bulge, top)
  bl = np.where(xs < xa, (py + ph) + (bot[xa] - (py + ph)) * t + bulge * 0.6, bot)
  yy, xx = np.mgrid[:H, :W].astype(float)
  inband = np.clip((yy - tl[None, :]) / 3, 0, 1) * np.clip((bl[None, :] - yy) / 3, 0, 1)
  body = inband * np.clip((xx - px + 4) / 14, 0, 1) * al
  tail = al * np.clip((px + 6 - xx) / 14, 0, 1)
  fins = np.clip(al - body - tail, 0, 1)
  # 眼睛：頭前段最暗的一團（瞳孔）
  rgb = a[..., :3]
  darkm = ((lum(rgb) < 70) & (al > 0.8)).astype(float); darkm[:, :int(px + 0.75 * L)] = 0
  dens = blur(darkm, 5)
  ey, ex = np.unravel_index(dens.argmax(), dens.shape)
  eye = np.clip((0.075 * L - np.hypot(xx - ex, yy - ey)) / (0.02 * L), 0, 1)
  return dict(body=body, tail=tail, fins=fins, px=px, py=py, ph=ph, L=L, xmax=xmax, tl=tl, bl=bl, eye=eye)


def lum(rgb):
  return rgb @ np.array([0.3, 0.55, 0.15])


def shade_of(rgb, al, s=1.2):
  """原圖的明暗（去掉舊花紋的細節），0.5 左右是中間調。"""
  l = lum(rgb) * al
  m = blur(l, s) / np.maximum(blur(al, s), 1e-3)
  return np.clip(m / max(np.percentile(m[al > 0.5], 90), 1), 0, 1.3)


def polar_noise(H, W, ox, oy, seed, along, across):
  """沿著鰭條（從尾柄往外放射）拉長的雜訊：紋路順著鰭條走。"""
  yy, xx = np.mgrid[:H, :W].astype(float)
  r = np.hypot(ox - xx, oy - yy); th = np.arctan2(oy - yy, ox - xx)
  # 在 (角度×半徑, 半徑) 平面上做雜訊再取樣回來
  G = 512
  base = noise(G, G, seed, across, along)
  u = ((th + np.pi) / (2 * np.pi) * 3.0 * G) % G   # 角度方向
  v = np.clip(r / max(r.max(), 1) * (G - 1), 0, G - 1)
  return base[v.astype(int), u.astype(int)], r


def repaint(name, kind):
  a = np.asarray(Image.open(f'{SRC}/guppy-male-{name}.webp').convert('RGBA')).astype(float)
  H, W = a.shape[:2]; al = a[..., 3] / 255; rgb = a[..., :3]
  R = regions(a)
  sh = shade_of(rgb, al)
  yy, xx = np.mgrid[:H, :W].astype(float)
  px, L = R['px'], R['L']
  # 頭（鰓蓋往前）花紋淡掉、偏銀
  headness = np.clip((xx - (px + 0.68 * L)) / (0.1 * L), 0, 1)
  # 身體立體感：背暗、側線上方一條亮帶、腹部偏透亮
  v = np.clip((yy - R['tl'][None, :]) / np.maximum(R['bl'] - R['tl'], 1)[None, :], 0, 1)
  form = (0.72 + 0.28 * np.sin(np.pi * np.clip(v * 1.15, 0, 1)) + 0.22 * np.exp(-((v - 0.38) / 0.12) ** 2))[..., None]
  belly = np.clip((v - 0.6) / 0.3, 0, 1)[..., None]
  seed = 7 if kind == 'red' else 11
  body_n = noise(H, W, seed, 3.4, 4.6)          # 稍微直立的蜿蜒紋，像參考照片
  out = rgb.copy()
  if kind == 'red':
    base = np.array([238, 212, 214]) * (0.38 + 0.72 * sh[..., None])      # 銀粉
    line = np.array([206, 36, 48]) * (0.62 + 0.5 * sh[..., None])         # 紅迷宮紋
    k = np.clip(lines(body_n, 0.5) * 1.25, 0, 1) * (1 - 0.85 * headness)
    bodyc = base * (1 - k[..., None]) + line * k[..., None]
    head = np.array([226, 218, 222]) * (0.4 + 0.7 * sh[..., None])
    bodyc = bodyc * (1 - 0.6 * headness[..., None]) + head * (0.6 * headness[..., None])
    bodyc = bodyc * form
    sh = shade_of(rgb, al, 4)
    # 尾鰭、背鰭：整片大紅，鰭條明暗
    ray_n, rr = polar_noise(H, W, px + 6, R['py'], seed + 1, 40, 1.2)
    rays = 0.88 + 0.12 * np.tanh(ray_n)
    red = np.array([222, 28, 30]) * (0.62 + 0.5 * sh[..., None]) * rays[..., None]
    edge = np.clip((rr - 0.85 * rr[R['tail'] > 0.5].max()) / 20, 0, 1) if (R['tail'] > 0.5).any() else 0
    red = red * (1 - 0.15 * np.asarray(edge)[..., None]) + np.array([255, 120, 100]) * (0.15 * np.asarray(edge)[..., None])
    finc = red
  else:
    base = np.array([232, 196, 96]) * (0.4 + 0.7 * sh[..., None])         # 金
    line = np.array([42, 30, 12]) * (0.8 + 0.3 * sh[..., None])           # 黑褐蛇皮紋
    k = np.clip(lines(body_n, 0.4) * 1.25, 0, 1) * (1 - 0.75 * headness)
    bodyc = base * (1 - k[..., None]) + line * k[..., None]
    head = np.array([220, 206, 160]) * (0.4 + 0.7 * sh[..., None])
    bodyc = bodyc * (1 - 0.6 * headness[..., None]) + head * (0.6 * headness[..., None])
    bodyc = (bodyc * (1 - 0.35 * belly) + np.array([240, 200, 180]) * (0.35 * belly)) * form
    sh = shade_of(rgb, al, 4)
    # 尾鰭、背鰭：黃綠底上沿著鰭條的深色網紋，尾緣淡成藍白細絲
    fn, rr = polar_noise(H, W, px + 6, R['py'], seed + 1, 3.2, 2.2)
    kf = np.clip(lines(fn, 0.42) * 1.35, 0, 1)
    yellow = np.array([214, 210, 70]) * (0.6 + 0.5 * sh[..., None])
    dark = np.array([34, 38, 22]) * (0.8 + 0.3 * sh[..., None])
    finc = dark * (1 - kf[..., None]) + yellow * kf[..., None]
    tmax = rr[R['tail'] > 0.5].max() if (R['tail'] > 0.5).any() else 1
    edge = np.clip((rr / tmax - 0.72) / 0.22, 0, 1) * (R['tail'] > 0.2)
    pale = np.array([190, 214, 228]) * (0.6 + 0.45 * sh[..., None])
    finc = finc * (1 - 0.8 * edge[..., None]) + pale * (0.8 * edge[..., None])
    # 尾柄旁的深色斑
    spot = np.exp(-(((xx - (px - 0.12 * L)) / (0.07 * L)) ** 2 + ((yy - R['py']) / (0.06 * L)) ** 2))
    finc = finc * (1 - 0.7 * spot[..., None]) + np.array([30, 24, 30]) * (0.7 * spot[..., None])
  fin_m = np.clip(R['tail'] + R['fins'], 0, 1)
  out = rgb * (1 - R['body'][..., None]) + bodyc * R['body'][..., None]
  out = out * (1 - fin_m[..., None]) + finc * fin_m[..., None]
  # 保留一點原圖的細節（鱗片、鰭條筆觸）
  detail = rgb - np.stack([blur(rgb[..., c], 1.5) for c in range(3)], -1)
  out += 0.6 * detail * np.clip(R['body'] + fin_m, 0, 1)[..., None]
  # 眼睛照舊
  keep = R['eye']
  out = out * (1 - keep[..., None]) + rgb * keep[..., None]
  a[..., :3] = np.clip(out, 0, 255)
  Image.fromarray(a.astype(np.uint8), 'RGBA').save(f'{OUT}/guppy-male-{name}.webp', 'WEBP', quality=92)
  return R


if __name__ == '__main__':
  for name, kind in [('redcobra', 'red'), ('redcobra-swallow', 'red'), ('cobra', 'gold'), ('cobra-swallow', 'gold')]:
    repaint(name, kind)
    print(name)
