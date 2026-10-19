"""App 圖示：用共用資料夾的插畫素材組成 1024 圖示原稿。用法見 export.py。"""
import sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
A='/mnt/project-files/art/'
OUT=sys.argv[1]
N=1024

def scene(n=N):
    """背景：4090 第 20 批的滿版水中插畫（光束、水面、下方水草），稍微柔焦，中間提亮、四周壓暗，魚才跳出來。"""
    bg=Image.open(A+'ui/app-icon-bg.png').convert('RGBA').resize((n,n),Image.LANCZOS).filter(ImageFilter.GaussianBlur(n*0.003))
    glow=Image.new('L',(n,n),0); ImageDraw.Draw(glow).ellipse((n*0.18,n*0.2,n*0.82,n*0.78),fill=120); glow=glow.filter(ImageFilter.GaussianBlur(n*0.08))
    bg=Image.composite(Image.new('RGBA',(n,n),(225,255,250,255)),bg,glow)
    vig=Image.new('L',(n,n),0); ImageDraw.Draw(vig).ellipse((-n*0.25,-n*0.25,n*1.25,n*1.25),fill=255); vig=vig.filter(ImageFilter.GaussianBlur(n*0.12))
    return Image.composite(bg,Image.new('RGBA',(n,n),(6,40,56,255)),vig.point(lambda v:int(110+v*145/255)))

def fish(c, n, scale):
    """主角：白子全紅半月公魚（遊戲裡同一張圖），斜斜往右上游，縮成小圖示也最搶眼。"""
    w=n*0.72*scale
    src=Image.open(A+'fish/fins/guppy-male-albino-red-halfmoon.png').convert('RGBA')
    src=src.crop(src.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox())
    src=ImageEnhance.Color(src).enhance(1.15)
    f=src.resize((int(w),int(src.height*w/src.width)),Image.LANCZOS).rotate(12,resample=Image.BICUBIC,expand=True)
    shadow=Image.new('RGBA',f.size,(0,20,30,0)); shadow.putalpha(f.getchannel('A').filter(ImageFilter.GaussianBlur(n*0.014)).point(lambda v:int(v*0.5)))
    x=int(n*0.5-f.width/2); y=int(n*0.48-f.height/2)
    c.alpha_composite(shadow,(x+int(n*0.01),y+int(n*0.022)))
    c.alpha_composite(f,(x,y))

def rounded_mask(n,rad):
    m=Image.new('L',(n*4,n*4),0); ImageDraw.Draw(m).rounded_rectangle((0,0,n*4-1,n*4-1),radius=rad*4,fill=255)
    return m.resize((n,n),Image.LANCZOS)

def gold_rim(c,n,rad,inset,width):
    S=4; rim=Image.new('RGBA',(n*S,n*S),(0,0,0,0)); d=ImageDraw.Draw(rim)
    i=inset*S
    d.rounded_rectangle((i,i,n*S-1-i,n*S-1-i),radius=(rad-inset)*S,outline=(120,80,20,255),width=int(width*S*1.5))
    d.rounded_rectangle((i+width*S*0.3,i+width*S*0.3,n*S-1-i-width*S*0.3,n*S-1-i-width*S*0.3),radius=(rad-inset)*S,outline=(236,196,104,255),width=int(width*S*0.8))
    d.rounded_rectangle((i+width*S*0.35,i+width*S*0.35,n*S-1-i-width*S*0.35,n*S-1-i-width*S*0.35),radius=(rad-inset)*S,outline=(255,238,170,255),width=int(width*S*0.25))
    rim=rim.resize((n,n),Image.LANCZOS)
    c.alpha_composite(rim)

# --- full icon (any): rounded square
c=scene(); fish(c,N,1.0)
# vignette top gloss
gloss=Image.new('L',(N,N),0); ImageDraw.Draw(gloss).ellipse((-0.3*N,-0.75*N,1.3*N,0.30*N),fill=40); gloss=gloss.filter(ImageFilter.GaussianBlur(N*0.03))
c=Image.composite(Image.new('RGBA',(N,N),(255,255,255,255)),c,gloss)
# 不再加金框：YenWel 嫌舊圖示醜，金框加白邊像遊戲裡的按鈕；改成乾淨的滿版圓角
full=c.copy(); rad=int(N*0.22)
m=rounded_mask(N,rad); out=Image.new('RGBA',(N,N),(0,0,0,0)); out.paste(full,(0,0),m)
out.save(OUT+'/icon-any-1024.png')
# --- square full-bleed (maskable / apple / android legacy source): scene with fish scaled into safe zone
sq=scene(); fish(sq,N,0.9)
sq=Image.composite(Image.new('RGBA',(N,N),(255,255,255,255)),sq,gloss)
sq.save(OUT+'/icon-square-1024.png')
# --- android adaptive layers (432 = 108dp*4): background scene, foreground fish only within 66dp safe zone
bgl=scene(); bgl.save(OUT+'/adaptive-bg-1024.png')
fg=Image.new('RGBA',(N,N),(0,0,0,0)); fish(fg,N,0.8); fg.save(OUT+'/adaptive-fg-1024.png')
