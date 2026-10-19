"""只重畫 Android 啟動畫面（用遊戲現在的亮青色缸背景＋中景，跟進遊戲第一眼一致）。
用法（在 repo 根目錄）：python3 scripts/app-icon/splash.py
"""
import glob

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ART = 'public/art/'
M = 'android/app/src/main/res/'
FONT = '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'

back = Image.open(ART + 'bg/bg-tank-back.webp').convert('RGBA')
icon = Image.open('public/icons/icon-512.png').convert('RGBA')
# 中景（遠處水草和石頭），跟遊戲後景一樣模糊、淡一點
MID = [('scape/mid-plants-left.webp', 0.10, 0.55), ('scape/mid-rocks.webp', 0.50, 0.16), ('scape/mid-plants-right.webp', 0.88, 0.30)]


def scene(w, h):
    sc = max(w / back.width, h / back.height)
    b = back.resize((int(back.width * sc) + 1, int(back.height * sc) + 1), Image.LANCZOS)
    b = b.crop(((b.width - w) // 2, (b.height - h) // 2, (b.width - w) // 2 + w, (b.height - h) // 2 + h))
    for f, fx, fh in MID:
        im = Image.open(ART + f).convert('RGBA')
        th = int(h * fh)
        im = im.resize((max(1, int(im.width * th / im.height)), th), Image.LANCZOS).filter(ImageFilter.GaussianBlur(max(1, h / 500)))
        im.putalpha(im.getchannel('A').point(lambda v: int(v * 0.7)))
        b.alpha_composite(im, (int(w * fx - im.width / 2), h - im.height))
    # 底部稍微壓暗，字比較清楚
    shade = Image.new('L', (1, h))
    for y in range(h):
        shade.putpixel((0, y), int(110 * max(0.0, (y / h - 0.45) / 0.55) ** 1.5))
    b.alpha_composite(Image.merge('RGBA', [Image.new('L', (w, h), 4)] * 2 + [Image.new('L', (w, h), 30), shade.resize((w, h))]))
    return b


for p in sorted(glob.glob(M + 'drawable*/splash.png')):
    w, h = Image.open(p).size
    b = scene(w, h)
    s = int(min(w, h) * 0.36)
    ic = icon.resize((s, s), Image.LANCZOS)
    # 陰影畫在比圖示大一圈的畫布上，模糊才不會被切成方的
    pad = int(s * 0.2)
    sh = Image.new('RGBA', (s + 2 * pad, s + 2 * pad), (0, 20, 30, 0))
    a = Image.new('L', sh.size, 0)
    a.paste(ic.getchannel('A'), (pad, pad))
    sh.putalpha(a.filter(ImageFilter.GaussianBlur(s * 0.06)).point(lambda v: int(v * 0.55)))
    cx = (w - s) // 2
    cy = int(h * 0.42 - s / 2)
    b.alpha_composite(sh, (cx - pad, cy - pad + int(s * 0.05)))
    b.alpha_composite(ic, (cx, cy))
    fs = int(min(w, h) * 0.085)
    f = ImageFont.truetype(FONT, fs)
    d = ImageDraw.Draw(b)
    t = '水族人生'
    tw = d.textlength(t, font=f)
    d.text(((w - tw) / 2, cy + s + int(fs * 0.55)), t, font=f, fill=(255, 236, 170), stroke_width=max(2, fs // 12), stroke_fill=(40, 30, 10))
    b.convert('RGB').save(p, optimize=True)
print('ok')
