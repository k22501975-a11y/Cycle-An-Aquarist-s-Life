"""孔雀魚鰭型圖：從 5 張基本款（public/art/fish/guppy-male-<花紋>.webp）用程式長出
大三角、緞帶、大C、上劍、下劍、雙劍。鰭的質感直接取自同一條魚的尾鰭，所以顏色和筆觸一致。
用法（repo 根目錄）：python3 scripts/art/guppy-fins.py <輸出資料夾>
會印出每張圖給 src/render/painted.ts 用的 span、tail、body。"""
import sys, json, numpy as np
from PIL import Image
OUT = sys.argv[1]
STRAINS = ['bluegrass', 'tuxedo', 'albino-red', 'cobra', 'redcobra']
BASE_Y = {'bluegrass': 0.14, 'cobra': 0.16, 'albino-red': 0.155, 'tuxedo': -0.01, 'redcobra': 0.17}
BASE_X = 0.14

def load(n):
  return np.asarray(Image.open(f'public/art/fish/guppy-male-{n}.webp').convert('RGBA')).astype(np.float32)

def peduncle(a):
  al = a[..., 3]; best = None
  for x in range(110, 260):
    col = np.where(al[:, x] > 128)[0]
    if len(col) == 0: continue
    h = col.max() - col.min()
    if best is None or h < best[0]: best = (h, x, (col.max() + col.min()) / 2)
  return best[1], best[2]

def bilinear(img, x, y):
  H, W = img.shape[:2]
  x = np.clip(x, 0, W - 1.001); y = np.clip(y, 0, H - 1.001)
  x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int); fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
  p = img.copy(); p[..., :3] *= p[..., 3:4] / 255
  c = p[y0, x0] * (1 - fx) * (1 - fy) + p[y0, x0 + 1] * fx * (1 - fy) + p[y0 + 1, x0] * (1 - fx) * fy + p[y0 + 1, x0 + 1] * fx * fy
  a = c[..., 3:4]; c[..., :3] = np.where(a > 0, c[..., :3] / np.maximum(a, 1e-3) * 255, 0)
  return c

def src_profile(a, ox, oy, px):
  """尾鰭在每個角度的半徑（從尾柄往後量；角度正的是上半）。"""
  al = a[..., 3]; H, W = al.shape
  th = np.arange(-120, 120.5, 0.5); R = np.zeros_like(th)
  for i, t in enumerate(th):
    d = np.radians(t); dx = -np.cos(d); dy = -np.sin(d)
    for r in range(4, 420):
      x = int(round(ox + dx * r)); y = int(round(oy + dy * r))
      if x < 0 or y < 0 or x >= W or y >= H: break
      if x > px + 1: continue
      if al[y, x] > 40: R[i] = r
  return th, R

class Fish:
  def __init__(self, n, padL, padT, padB):
    a0 = load(n)
    self.n = n; self.W0, self.H0 = a0.shape[1], a0.shape[0]
    self.padL, self.padT = padL, padT
    self.a = np.pad(a0, ((padT, padB), (padL, 0), (0, 0)))
    px, py = peduncle(a0)
    self.px, self.py = px + padL, py + padT
    self.ox, self.oy = self.px + 6, self.py
    self.th, self.Rs = src_profile(a0, px + 6, py, px)
    m = self.Rs.max(); ok = self.th[self.Rs > 0.55 * m]
    self.tu, self.td = ok.max(), ok.min()
    al = a0[..., 3]; cols = np.where(al.max(0) > 128)[0]
    self.xmin, self.xmax = cols.min() + padL, cols.max() + padL
    self.L = self.xmax - self.px            # 身體長（尾柄到嘴）
    self.Lt = self.px - self.xmin           # 尾鰭長
    self.al0 = al
  def bottom(self, x):
    col = np.where(self.al0[:, int(x) - self.padL] > 128)[0]
    return col.max() + self.padT
  def top(self, x):
    col = np.where(self.al0[:, int(x) - self.padL] > 128)[0]
    return col.min() + self.padT
  def tailpt(self, th, k):
    d = np.radians(th); r = np.interp(th, self.th, self.Rs) * k
    return np.array([self.ox - np.cos(d) * r, self.oy - np.sin(d) * r])
  def sample(self, th, k):
    """從尾鰭取顏色：角度 th、半徑比例 k（0 根部 → 1 邊緣）。"""
    d = np.radians(th); r = np.interp(th, self.th, self.Rs) * k
    return bilinear(self.a, self.ox - np.cos(d) * r, self.oy - np.sin(d) * r)

def qbez(a, c, b, t):
  t = t[:, None]
  return (1 - t) ** 2 * a + 2 * (1 - t) * t * c + t ** 2 * b

def strip(f, a, c, b, w0, w1, th0, th1, k0=0.25, k1=0.98, alpha=0.95, tipfade=0.35, n=260):
  """沿著二次曲線長出一條鰭：寬度從 w0 收到 w1，質感取自尾鰭 th0→th1 那幾根鰭條。"""
  H, W = f.a.shape[:2]
  t = np.linspace(0, 1, n); P = qbez(np.array(a, float), np.array(c, float), np.array(b, float), t)
  T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True); N = np.stack([-T[:, 1], T[:, 0]], 1)
  hw = (w0 + (w1 - w0) * t ** 0.85) / 2
  x0, y0 = int(max(0, P[:, 0].min() - w0)), int(max(0, P[:, 1].min() - w0))
  x1, y1 = int(min(W, P[:, 0].max() + w0 + 1)), int(min(H, P[:, 1].max() + w0 + 1))
  yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
  pts = np.stack([xx.ravel(), yy.ravel()], 1)
  best = np.full(len(pts), 1e9); idx = np.zeros(len(pts), int)
  for i in range(0, n, 20):
    d = ((pts[:, None, :] - P[None, i:i + 20, :]) ** 2).sum(-1)
    j = d.argmin(1); dm = d[np.arange(len(pts)), j]
    sel = dm < best; best[sel] = dm[sel]; idx[sel] = i + j[sel]
  u = t[idx]; off = ((pts - P[idx]) * N[idx]).sum(1); v = off / hw[idx]
  inside = (np.abs(v) <= 1.05) & (idx > 0) & (idx < n - 1) | ((idx == 0) & (np.abs(v) <= 1))
  th = th0 + (th1 - th0) * (v + 1) / 2
  col = f.sample(th, k0 + (k1 - k0) * u)
  # 立體感：中間亮、兩側暗一點；鰭條順著長度走
  shade = 0.82 + 0.22 * (1 - np.clip(np.abs(v), 0, 1)) ** 0.7
  col[:, :3] *= shade[:, None]
  edge = np.clip((1 - np.abs(v)) * hw[idx] / 1.4, 0, 1)
  tip = np.clip((1 - u) / tipfade, 0, 1) ** 0.6
  col[:, 3] = 255 * alpha * edge * tip * inside * np.clip(col[:, 3] / 255 * 3, 0, 1)
  layer = np.zeros((H, W, 4), np.float32)
  layer[y0:y1, x0:x1] = col.reshape(y1 - y0, x1 - x0, 4)
  return layer

def over(top, bot):
  at = top[..., 3:4] / 255; ab = bot[..., 3:4] / 255
  ao = at + ab * (1 - at)
  rgb = (top[..., :3] * at + bot[..., :3] * ab * (1 - at)) / np.maximum(ao, 1e-4)
  return np.concatenate([rgb, ao * 255], -1)

def finish(f, img, name):
  al = img[..., 3]; rows = np.where(al.max(1) > 4)[0]; cols = np.where(al.max(0) > 4)[0]
  y0, y1 = max(0, rows.min() - 4), min(img.shape[0], rows.max() + 5)
  x0 = max(0, cols.min() - 4)
  img = img[y0:y1, x0:]
  Wn, Hn = img.shape[1], img.shape[0]
  # 基本款的身體中心（像素）換到新圖
  bx = f.W0 / 2 + BASE_X * f.W0 + f.padL - x0
  by = (0.5 + BASE_Y[f.n]) * f.H0 + f.padT - y0
  spec = {'span': round(Wn / f.W0, 3), 'tail': round((f.px - x0) / Wn * 0.96, 3), 'x': round(bx / Wn - 0.5, 3), 'y': round(by / Hn - 0.5, 3)}
  Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGBA').save(f'{OUT}/guppy-male-{f.n}-{name}.webp', 'WEBP', quality=90)
  return spec

def halfmoon(n):
  """大三角（Delta；YenWel 2026-10-21：台灣沒有「半月」這個孔雀魚品系，改成大三角）：
  從尾柄就寬寬地張開成大三角扇，張開接近直角以上，後緣幾乎是直的，尾柄不收窄；不是鬥魚那種 D 形半圓。
  檔名和存檔裡的 id 還是 halfmoon（只改顯示名稱，舊存檔不用轉換）。"""
  f0 = Fish(n, 0, 0, 0)
  R = 0.7 * f0.L; SP = 56; EXP = 0.9
  rmax = R / np.cos(np.radians(SP)) ** EXP
  padL = int(max(0, R + 14 - f0.ox)); half = rmax * np.sin(np.radians(SP))
  padT = int(max(0, half + 12 - f0.oy)); padB = int(max(0, f0.oy + half + 12 - f0.H0))
  f = Fish(n, padL, padT, padB)
  H, W = f.a.shape[:2]
  yy, xx = np.mgrid[:H, :W].astype(np.float32)
  dx = f.ox - xx; dy = f.oy - yy
  r = np.hypot(dx, dy); phi = np.degrees(np.arctan2(dy, dx))
  edge = R / np.cos(np.radians(np.clip(phi, -89, 89))) ** EXP
  edge *= 1 + 0.018 * np.cos(np.radians(phi) * 16) ** 6   # 鰭條末端的小波浪
  t = np.where(phi >= 0, phi / SP * f.tu, phi / SP * (-f.td))
  Rsrc = np.interp(t, f.th, f.Rs)
  rs = np.clip(r / np.maximum(edge, 1), 0, 1) * Rsrc
  d = np.radians(t)
  out = bilinear(f.a, f.ox - np.cos(d) * rs, f.oy - np.sin(d) * rs)
  u = np.clip(r / edge, 0, 1)
  rays = 0.5 + 0.5 * np.sin(np.radians(phi) * 36)
  fold = 0.5 + 0.5 * np.sin(np.radians(phi) * 6 + 1.3)
  out[..., :3] *= (1 - 0.09 * rays * u - 0.12 * fold * u ** 1.5 + 0.05 * (1 - u))[..., None]
  # 尾柄不收窄：上下緣一出尾柄就張開
  lim = SP * np.clip(0.8 + 0.2 * (r / (0.2 * R)), 0, 1)
  fade = np.clip((edge - r) / 3, 0, 1) * np.clip((lim + 1 - np.abs(phi)) / 4, 0, 1) * (1 - 0.3 * np.clip((u - 0.8) / 0.2, 0, 1))
  out[..., 3] *= fade
  out[(np.abs(phi) > SP + 2) | (xx > f.ox + 2)] = 0
  body = f.a.copy()
  keep = np.clip((xx - (f.px - 16)) / 24, 0, 1)
  body[..., 3] *= keep
  return finish(f, over(body, out), 'halfmoon')

def with_fins(n, name, padL, padT, padB, make):
  f = Fish(n, padL, padT, padB)
  img = f.a.copy()
  for layer in make(f): img = over(img, layer)
  return finish(f, img, name)

def sword(n, which):
  """劍尾（YenWel 2026-10-21：「雙劍不是應該是尾巴雙劍」）：尾巴本身的上下緣長成劍，不是扇尾上黏細刺。
  劍從尾柄寬寬地長出來，慢慢收尖，長度約一個身長，上下劍微微張開成 V；
  中間是一段很短、凹進去的半透明鰭膜，只有淡淡的鰭條和幾個小點；劍的內側有一道深色邊。
  which：1 上劍、2 下劍、3 雙劍。單劍的另一半是一片短短的圓尾。"""
  f0 = Fish(n, 0, 0, 0)
  RT = 0.95 * f0.L; PS = 11.0                     # 劍長、劍往外張的角度
  padL = int(max(0, RT + 16 - f0.ox)); half = RT * np.tan(np.radians(PS)) + 0.3 * f0.L
  padT = int(max(0, half - f0.oy)); padB = int(max(0, f0.oy + half - f0.H0))
  f = Fish(n, padL, padT, padB)
  H, W = f.a.shape[:2]
  yy, xx = np.mgrid[:H, :W].astype(np.float32)
  dx = f.ox - xx; dy = f.oy - yy
  r = np.hypot(dx, dy); phi = np.degrees(np.arctan2(dy, dx))   # phi>0 是上半
  sides = [1] if which == 1 else [-1] if which == 2 else [1, -1]
  out = np.zeros((H, W, 4), np.float32)
  # 中間的短鰭膜（凹口）：單劍時另一半是一片短圓尾
  col_p = np.where(f.al0[:, f.px - f.padL] > 128)[0]; ph = (col_p.max() - col_p.min()) / 2
  along = np.clip(dx, 0, None)                                             # 往後的距離
  tp = np.tan(np.radians(PS))
  spread = 0.22 * ph + along * tp                                           # 劍中線離中軸的距離
  if which == 3:
    rm = 0.58 * f.L * (0.9 + 0.1 * np.clip(np.abs(dy) / np.maximum(spread, 1), 0, 1) ** 2)   # 中間最短：凹進去
    memb = np.clip((spread + 2 - np.abs(dy)) / 2, 0, 1)
  else:
    sd = sides[0]
    lobe = ph + along * 0.85                                               # 對側：短短的圓尾
    q = np.clip(-sd * dy / np.maximum(lobe, 1), 0, 1)
    rm = 0.4 * f.L * np.sqrt(np.clip(1 - q ** 2, 0, 1)) + 0.05 * f.L
    memb = np.where(sd * dy > 0, np.clip((spread + 2 - sd * dy) / 2, 0, 1), np.clip((lobe - np.abs(dy)) / 2, 0, 1))
  memb = memb * np.clip((rm - along) / 3, 0, 1)
  t = np.clip(dy / np.maximum(spread + 0.6 * ph, 1), -1, 1)
  ts = np.where(t >= 0, t * f.tu, -t * f.td)
  rsrc = np.interp(ts, f.th, f.Rs)
  k = np.clip(along / np.maximum(rm, 1), 0, 1) * 0.9
  m = bilinear(f.a, f.ox - np.cos(np.radians(ts)) * k * rsrc, f.oy - np.sin(np.radians(ts)) * k * rsrc)
  rays = 0.5 + 0.5 * np.sin(np.radians(phi) * 40)
  m[..., :3] *= (1 - 0.12 * rays)[..., None]
  thin = 0.72 if which == 3 else 0.9                                        # 雙劍中間比較透明
  m[..., 3] *= memb * thin * np.clip(1 - 0.4 * (along / np.maximum(rm, 1)) ** 2, 0, 1)
  out = m
  u = np.clip(along / RT, 0, 1)
  for sd in sides:
    # 劍的中線：從尾柄上（下）緣往後斜斜張開；寬度從尾柄的寬慢慢收到尖
    off = spread
    hw = (0.48 * ph + 0.03 * f.L) * (1 - u) ** 0.85 + 0.6
    e = sd * dy - off                                                      # 正的是外側
    v = np.clip(e / hw, -1.2, 1.2)                                         # +1 外緣、-1 內緣
    inside = np.clip((hw - np.abs(e)) / 1.3, 0, 1) * (along < RT) * np.clip((along + 4) / 10, 0, 1)
    tsrc = (f.tu - 4 if sd > 0 else f.td + 4) + v * 4 * sd
    rs = np.interp(tsrc, f.th, f.Rs) * (0.3 + 0.62 * u)
    col = bilinear(f.a, f.ox - np.cos(np.radians(tsrc)) * rs, f.oy - np.sin(np.radians(tsrc)) * rs)
    rays = 0.5 + 0.5 * np.sin(v * np.pi * 3.5 + 0.6)
    shade = 0.8 + 0.24 * (1 - np.clip(np.abs(v), 0, 1)) ** 0.7 + 0.06 * np.clip(v, 0, 1) - 0.08 * rays
    col[..., :3] *= shade[..., None]
    # 內側一道深色邊（照片裡劍的內緣是黑的）
    ink = np.clip((-v - 0.5) / 0.3, 0, 1) * np.clip((along - 0.06 * RT) / (0.12 * RT), 0, 1)
    col[..., :3] = col[..., :3] * (1 - 0.78 * ink)[..., None] + np.array([16, 14, 20]) * (0.78 * ink)[..., None]
    col[..., 3] = 255 * inside * np.clip(col[..., 3] / 255 * 4, 0, 1) * 0.97 * np.clip((1 - u) / 0.06, 0, 1) ** 0.5
    out = over(col, out)
  out[xx > f.ox + 2] = 0
  body = f.a.copy()
  keep = np.clip((xx - (f.px - 16)) / 24, 0, 1)
  body[..., 3] *= keep
  return finish(f, over(body, out), f'sword{which}')

def bigc_layers(f):
  out = []
  # 背鰭：從背上長出來，往後拉過尾巴一半以上，尖端往下彎，和臀鰭、尾鰭圍成 C
  xd = f.px + 0.42 * f.L; root = np.array([xd, f.top(xd) + 0.03 * f.L])
  tip = np.array([f.px - 0.6 * f.Lt, f.oy - 0.62 * f.Rs.max()])
  ctl = np.array([f.px - 0.05 * f.L, f.top(f.px + 0.05 * f.L) - 0.42 * f.L])
  out.append(strip(f, root, ctl, tip, 0.24 * f.L, 0.03 * f.L, f.tu * 0.2, f.tu * 0.85, k0=0.3, k1=0.95, alpha=0.93, tipfade=0.3))
  xa = f.px + 0.28 * f.L; root = np.array([xa, f.bottom(xa) - 0.03 * f.L])
  tip = np.array([f.px - 0.55 * f.Lt, f.oy + 0.58 * f.Rs.max()])
  ctl = np.array([f.px - 0.05 * f.L, f.bottom(f.px + 0.05 * f.L) + 0.36 * f.L])
  out.append(strip(f, root, ctl, tip, 0.15 * f.L, 0.03 * f.L, f.td * 0.85, f.td * 0.2, k0=0.3, k1=0.95, alpha=0.93, tipfade=0.3))
  return out

def ribbon_layers(f):
  out = []
  # 緞帶：腹鰭兩條有顏色、往後下方飄的長帶
  for i, (dx, drop, back) in enumerate(((0.55, 0.62, 0.5), (0.5, 0.78, 0.35))):
    x = f.px + dx * f.L; root = np.array([x, f.bottom(x) - 0.02 * f.L])
    ctl = root + np.array([-0.12 * f.L, 0.42 * drop * f.L])
    tip = root + np.array([-back * f.L, drop * f.L])
    out.append(strip(f, root, ctl, tip, 0.065 * f.L, 0.03 * f.L, -10 + 6 * i, 10 + 6 * i, k0=0.35, k1=0.85, alpha=0.95, tipfade=0.3))
  return out

# 只重畫某幾種：GUPPY_FINS=sword,halfmoon GUPPY_STRAINS=cobra python3 ...
import os
ONLY = set(filter(None, os.environ.get('GUPPY_FINS', '').split(',')))
STRAINS = [x for x in STRAINS if not os.environ.get('GUPPY_STRAINS') or x in os.environ['GUPPY_STRAINS'].split(',')]
def want(k): return not ONLY or k in ONLY
specs = {}
for n in STRAINS:
  f = Fish(n, 0, 0, 0)
  if want('halfmoon'): specs[f'{n}-halfmoon'] = halfmoon(n)
  if want('sword'):
    for s in (1, 2, 3):
      specs[f'{n}-sword{s}'] = sword(n, s)
  if want('bigc'): specs[f'{n}-bigc'] = with_fins(n, 'bigc', int(0.7 * f.Lt), int(0.5 * f.L), int(0.5 * f.L), bigc_layers)
  if want('ribbon'): specs[f'{n}-ribbon'] = with_fins(n, 'ribbon', 0, 0, int(0.9 * f.L), ribbon_layers)
print(json.dumps(specs, indent=1))
