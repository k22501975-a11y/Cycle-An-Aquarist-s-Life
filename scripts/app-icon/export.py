"""把 compose.py 的原稿輸出成 PWA、iOS、Android 各尺寸圖示和啟動畫面。
用法（在 scripts/app-icon/ 裡）：python3 compose.py . && python3 export.py ../..
"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont
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
# splash
back=Image.open('/mnt/project-files/art/bg/bg-tank-back-2560.webp').convert('RGB')
font='/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'
import glob,os
for p in glob.glob(M+'drawable*/splash.png'):
    w,h=Image.open(p).size
    sc=max(w/back.width,h/back.height); b=back.resize((int(back.width*sc)+1,int(back.height*sc)+1),Image.LANCZOS)
    b=b.crop(((b.width-w)//2,(b.height-h)//2,(b.width-w)//2+w,(b.height-h)//2+h))
    dark=Image.new('RGB',(w,h),(6,30,42)); b=Image.blend(b,dark,0.45).convert('RGBA')
    s=int(min(w,h)*0.36); ic=rs(anyi,s)
    sh=Image.new('RGBA',(s,s),(0,0,0,0)); sh.putalpha(ic.getchannel('A').filter(ImageFilter.GaussianBlur(s*0.05)).point(lambda v:int(v*0.6)))
    cx=(w-s)//2; cy=int(h*0.42-s/2)
    b.alpha_composite(sh,(cx,cy+int(s*0.04))); b.alpha_composite(ic,(cx,cy))
    fs=int(min(w,h)*0.085); f=ImageFont.truetype(font,fs)
    d=ImageDraw.Draw(b); t='水族人生'
    tw=d.textlength(t,font=f); ty=cy+s+int(fs*0.6)
    d.text(((w-tw)/2,ty),t,font=f,fill=(255,236,170),stroke_width=max(2,fs//14),stroke_fill=(70,44,10))
    b.convert('RGB').save(p,optimize=True)
print('ok')
