"""大耳的胸鰭（YenWel 2026-10-21：「大耳 位置也很奇怪」）。
大耳孔雀魚是胸鰭變大：根部在鰓蓋正後方、身體前下方，張成一片扇形（像蝴蝶翅膀），
大小接近尾鰭的一半；深寶藍色，邊緣是半透明、羽毛一樣的細碎鰭條。
圖的頭朝右：根部在右上角（ANCHOR），扇面往左（往後）、往下張開。
用法（repo 根目錄）：python3 scripts/art/guppy-dumbo.py public/art/fish/parts/fin-pectoral-dumbo.webp"""
import sys, numpy as np
from PIL import Image

W, H = 520, 440
OX, OY = 486, 70                     # 根部（給 painted.ts 的 anchor）
A0, A1 = 168, 262                    # 扇面角度（度；180 是正後方，270 是正下方）
R = 400
rng = np.random.default_rng(3)

yy, xx = np.mgrid[:H, :W].astype(float)
dx = xx - OX; dy = yy - OY
r = np.hypot(dx, dy)
# 角度換成「180 正後方、270 正下方」（圖的 y 往下）
a = (360 - np.degrees(np.arctan2(dy, dx))) % 360
t = (a - A0) / (A1 - A0)                            # 0 上緣 → 1 下緣
inside_ang = np.clip(np.minimum(t, 1 - t) * (A1 - A0) / 3, 0, 1)
# 外緣：中間最長、兩側收圓（蝴蝶翅膀），加上每根鰭條末端的羽毛碎邊
n_rays = 34
ray_ph = t * n_rays
lobe = 0.45 + 0.55 * np.sin(np.pi * np.clip(t, 0, 1)) ** 0.8
jag = rng.uniform(0.96, 1.03, n_rays + 2)
edge = R * lobe * jag[np.clip(ray_ph.astype(int), 0, n_rays + 1)] * (1 + 0.02 * np.cos(2 * np.pi * ray_ph))
u = r / np.maximum(edge, 1)
inside = inside_ang * np.clip((edge - r) / 3, 0, 1) * (t > -0.02) * (t < 1.02)
# 顏色：根部深寶藍、往外亮一點的寶藍，鰭條明暗
deep = np.array([18, 40, 120.]); mid = np.array([34, 86, 214.]); hi = np.array([110, 160, 246.])
k = np.clip(u, 0, 1)[..., None]
col = deep * (1 - k) + mid * k
col = col * (1 - 0.4 * np.clip((u - 0.7) / 0.3, 0, 1)[..., None]) + hi * (0.4 * np.clip((u - 0.7) / 0.3, 0, 1)[..., None])
rays = 0.5 + 0.5 * np.cos(2 * np.pi * ray_ph)
col *= (0.88 + 0.16 * rays)[..., None]
# 扇面輕微的摺痕（大片的鰭會有波浪）
fold = 0.5 + 0.5 * np.sin(2 * np.pi * t * 5 + 0.8)
col *= (0.9 + 0.12 * fold * np.clip(u, 0, 1))[..., None]
# 透明度：根部比較實、外圈半透明、最外面是羽毛狀的細絲
alpha = 0.95 - 0.4 * np.clip((u - 0.45) / 0.55, 0, 1)
fray = np.clip((u - 0.9) / 0.1, 0, 1)
alpha *= 1 - 0.75 * fray * (1 - rays ** 2)
alpha *= np.clip(r / 10, 0, 1) * inside
img = np.zeros((H, W, 4))
img[..., :3] = np.clip(col, 0, 255); img[..., 3] = np.clip(alpha, 0, 1) * 255
Image.fromarray(img.astype(np.uint8), 'RGBA').save(sys.argv[1], 'WEBP', quality=90)
print('anchor', OX / W, OY / H)
