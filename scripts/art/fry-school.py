"""生小魚慶祝卡的圖：一小群半透明的仔魚（從 guppy-fry 縮小、淡化、排成一群）。
單一條仔魚圖放大後看起來像成魚（畫面評測 V23、#129），一群小小的才看得出是剛出生。
用法（在 repo 根目錄）：python3 scripts/art/fry-school.py
"""
from PIL import Image, ImageEnhance

src = Image.open('public/art/fish/guppy-fry.webp').convert('RGBA')
bbox = src.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
fry = src.crop(bbox)
# 仔魚身體幾乎透明、顏色淡：降飽和、整體透明度壓低一點
fry = ImageEnhance.Color(fry).enhance(0.55)
fry = ImageEnhance.Brightness(fry).enhance(1.12)

W, H = 512, 300
out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
# 身體壓扁一點（仔魚比成魚細長）
# (中心 x, 中心 y, 寬度, 旋轉角度, 透明度)：前面大、後面小，朝同一個方向游
SCHOOL = [
    (150, 70, 105, 6, 0.65), (300, 50, 90, -4, 0.6), (430, 100, 100, 8, 0.65),
    (90, 165, 140, -6, 0.75), (255, 150, 170, 3, 0.85), (400, 205, 135, -8, 0.78),
    (190, 245, 115, 5, 0.7), (330, 255, 85, -2, 0.6),
]
for cx, cy, w, rot, alpha in SCHOOL:
    f = fry.resize((w, max(1, round(fry.height * w / fry.width * 0.82))), Image.LANCZOS).rotate(rot, expand=True, resample=Image.BICUBIC)
    f.putalpha(f.getchannel('A').point(lambda v, a=alpha: int(v * a)))
    out.alpha_composite(f, (cx - f.width // 2, cy - f.height // 2))
out = out.crop(out.getchannel('A').getbbox())
out.save('public/art/fish/guppy-fry-school.webp', quality=88, method=6)
print(out.size)
