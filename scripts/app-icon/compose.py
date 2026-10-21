"""App 圖示：用共用資料夾的插畫素材組成 1024 圖示原稿。用法見 export.py。"""
import sys
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter
A='/mnt/project-files/art/'
OUT=sys.argv[1]
N=1024

def scene(n=N):
    """背景：4090 第 20 批的滿版水中插畫（光束、水面、下方水草），中間提亮、四周壓暗，魚才跳出來。
    柔焦加重、下半部壓暗：48 px 以下光點和水草不再糊成雜訊（圖示評測 2026-10-20）。"""
    bg=Image.open(A+'ui/app-icon-bg.png').convert('RGBA').resize((n,n),Image.LANCZOS).filter(ImageFilter.GaussianBlur(n*0.008))
    low=Image.linear_gradient('L').resize((n,n)).point(lambda v:max(0,v-120)*1.4)
    bg=Image.composite(Image.new('RGBA',(n,n),(8,46,58,255)),bg,low.point(lambda v:min(150,int(v))))
    glow=Image.new('L',(n,n),0); ImageDraw.Draw(glow).ellipse((n*0.18,n*0.2,n*0.82,n*0.78),fill=120); glow=glow.filter(ImageFilter.GaussianBlur(n*0.08))
    bg=Image.composite(Image.new('RGBA',(n,n),(225,255,250,255)),bg,glow)
    vig=Image.new('L',(n,n),0); ImageDraw.Draw(vig).ellipse((-n*0.25,-n*0.25,n*1.25,n*1.25),fill=255); vig=vig.filter(ImageFilter.GaussianBlur(n*0.12))
    return Image.composite(bg,Image.new('RGBA',(n,n),(6,40,56,255)),vig.point(lambda v:int(110+v*145/255)))

def fish(c, n, scale):
    """主角：白子全紅半月公魚（遊戲裡同一張圖），斜斜往右上游，縮成小圖示也最搶眼。
    放大到約佔圖示寬度 75%（圖示評測 2026-10-21：原本約 60%，在桌面上不夠搶眼）。"""
    w=n*0.84*scale
    src=Image.open(A+'fish/fins/guppy-male-albino-red-halfmoon.png').convert('RGBA')
    src=src.crop(src.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox())
    src=defringe(src)
    src=ImageEnhance.Color(src).enhance(1.15)
    src=rim_light(src)
    f=src.resize((int(w),int(src.height*w/src.width)),Image.LANCZOS).rotate(12,resample=Image.BICUBIC,expand=True)
    shadow=Image.new('RGBA',f.size,(0,20,30,0)); shadow.putalpha(f.getchannel('A').filter(ImageFilter.GaussianBlur(n*0.022)).point(lambda v:int(v*0.32)))
    x=int(n*0.5-f.width/2); y=int(n*0.48-f.height/2)
    # 影子貼近一點、淡一點：原本往下偏 2%，會從鰭尖半透明的地方透出一圈深色鋸齒（圖示評測 2026-10-20）
    c.alpha_composite(shadow,(x+int(n*0.004),y+int(n*0.01)))
    c.alpha_composite(f,(x,y))

def defringe(im):
    """去背留下的灰藍色鋸齒邊（圖示評測 2026-10-20）：鰭的最外圈有一條灰藍、半透明的帶子，放大到商店 512 px 圖很明顯。
    離邊緣約寬度 2.5% 內、不是紅色的像素，換成往內一點的紅色再淡一點，像透光的鰭尖；透明度收一像素、柔一點。"""
    import numpy as np
    a=im.getchannel('A')
    arr=np.asarray(im.convert('RGB'),dtype=np.float32)/255
    mx=arr.max(-1); mn=arr.min(-1); sat=(mx-mn)/np.maximum(mx,1e-3)
    red=((sat>0.55)&(np.asarray(a)>200)).astype(np.float32)
    k=max(10,im.width//120)
    blur=lambda x:np.asarray(Image.fromarray((x*255).astype('uint8')).filter(ImageFilter.GaussianBlur(k)),dtype=np.float32)/255
    den=blur(red)
    spread=np.stack([blur(arr[...,i]*red) for i in range(3)],-1)/np.maximum(den[...,None],1e-3)
    inner=a.point(lambda v:255 if v>20 else 0)
    for _ in range(max(4,im.width//160)): inner=inner.filter(ImageFilter.MinFilter(5))
    reddish=(arr[...,0]>arr[...,1]+0.12)&(arr[...,0]>arr[...,2]+0.12)
    band=(np.asarray(a)>0)&(np.asarray(inner)==0)&~reddish&(den>0.02)
    w=np.where(band,0.8,0.0)[...,None]
    tip=np.clip(spread*1.08+0.06,0,1)
    out=arr*(1-w)+tip*w
    al=np.asarray(a,dtype=np.float32)*np.where(band,0.85,1.0)
    # 去背時留下的那圈半透明深青色底（透明度 60～140、不是紅色）：直接拿掉
    al[(np.asarray(a)<170)&~reddish]=0
    res=Image.fromarray((np.clip(out,0,1)*255).astype('uint8'),'RGB').convert('RGBA')
    res.putalpha(Image.fromarray(al.astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8)))
    return res

def rim_light(im):
    """從上面打下來的亮邊：魚背和背鰭的上緣加一道暖白高光，深色、淺色桌布上都更跳（圖示評測 2026-10-21）。"""
    a=im.getchannel('A')
    k=max(3,im.width//110)
    shifted=Image.new('L',im.size,0); shifted.paste(a,(0,k))
    edge=ImageChops.subtract(a,shifted).filter(ImageFilter.GaussianBlur(k*0.6))
    edge=ImageChops.multiply(edge,a).point(lambda v:int(min(255,v*1.6)*0.7))
    glow=Image.new('RGBA',im.size,(255,244,220,0)); glow.putalpha(edge)
    out=im.copy(); out.alpha_composite(glow)
    out.putalpha(a)
    return out

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
# 前景要整條在 Android 66dp 安全區內（半徑約 0.305）：魚放大後這裡縮回 0.71
fg=Image.new('RGBA',(N,N),(0,0,0,0)); fish(fg,N,0.71); fg.save(OUT+'/adaptive-fg-1024.png')
