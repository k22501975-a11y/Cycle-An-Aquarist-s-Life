"""把 AI 生圖殘留的白底（葉縫間、陰影）轉透明：白色轉 alpha，再清掉偏白的灰陰影。

用法：python3 scripts/clean-white.py 輸入.png 輸出.png
只適合主體本身沒有白色的素材（例如水草）；有白色主體的請用外圍 flood fill。
"""
import sys
import numpy as np
from PIL import Image

im = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).astype(np.float32) / 255
rgb, a = im[..., :3], im[..., 3]
# color-to-alpha（白）：離白色越遠越不透明
alpha = np.max(1 - rgb, axis=-1)
alpha = np.clip(alpha * 1.6, 0, 1)
safe = np.maximum(alpha, 1e-4)[..., None]
out = 1 - (1 - rgb) / safe
# 偏白、沒什麼彩度的灰（陰影、反光底）也拿掉
mx, mn = rgb.max(-1), rgb.min(-1)
sat = (mx - mn) / np.maximum(mx, 1e-4)
alpha = np.where((sat < 0.18) & (mx > 0.55), alpha * np.clip((sat / 0.18) ** 2, 0, 1), alpha)
res = np.dstack([np.clip(out, 0, 1), alpha * a])
Image.fromarray((res * 255).astype(np.uint8), 'RGBA').save(sys.argv[2])
