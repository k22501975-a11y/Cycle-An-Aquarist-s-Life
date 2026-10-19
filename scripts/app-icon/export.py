"""把 compose.py 的原稿輸出成 PWA、iOS、Android 各尺寸圖示。
用法（在 scripts/app-icon/ 裡）：python3 compose.py . && python3 export.py ../..，接著在 repo 根目錄跑 python3 scripts/app-icon/splash.py
"""
import sys
from PIL import Image, ImageDraw
R=sys.argv[1]; S='.'
anyi=Image.open(S+'/icon-any-1024.png'); sq=Image.open(S+'/icon-square-1024.png').convert('RGB')
bg=Image.open(S+'/adaptive-bg-1024.png').convert('RGB'); fg=Image.open(S+'/adaptive-fg-1024.png')
def rs(im,n): return im.resize((n,n),Image.LANCZOS)
P=R+'/public/icons/'
rs(anyi,192).save(P+'icon-192.png',optimize=True); rs(anyi,512).save(P+'icon-512.png',optimize=True)
rs(sq,512).save(P+'icon-maskable-512.png',optimize=True); rs(sq,180).save(P+'apple-touch-icon.png',optimize=True)
dens={'mdpi':1,'hdpi':1.5,'xhdpi':2,'xxhdpi':3,'xxxhdpi':4}
M=R+'/android/app/src/main/res/'
for d,k in dens.items():
    n=int(48*k); a=int(108*k)
    rs(anyi,n).save(f'{M}mipmap-{d}/ic_launcher.png',optimize=True)
    c=rs(sq,n).convert('RGBA'); m=Image.new('L',(n*4,n*4),0); ImageDraw.Draw(m).ellipse((0,0,n*4-1,n*4-1),fill=255); c.putalpha(m.resize((n,n),Image.LANCZOS))
    c.save(f'{M}mipmap-{d}/ic_launcher_round.png',optimize=True)
    rs(fg,a).save(f'{M}mipmap-{d}/ic_launcher_foreground.png',optimize=True)
    rs(bg,a).save(f'{M}mipmap-{d}/ic_launcher_background.png',optimize=True)
# 啟動畫面改由 splash.py 產生（亮青色缸背景＋英文名稱），這裡只輸出圖示
print('ok')
