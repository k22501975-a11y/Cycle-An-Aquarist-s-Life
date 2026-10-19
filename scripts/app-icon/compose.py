"""App 圖示：用共用資料夾的插畫素材組成 1024 圖示原稿。用法見 export.py。"""
import sys, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops
A='/mnt/project-files/art/'
OUT=sys.argv[1]
N=1024
random.seed(7)

def radial(n, inner, outer, cx=0.5, cy=0.38, r=0.75):
    im=Image.new('RGB',(n,n))
    px=im.load()
    for y in range(n):
        for x in range(n):
            d=math.hypot(x/n-cx,y/n-cy)/r
            t=min(1,d)**1.3
            px[x,y]=tuple(int(inner[i]*(1-t)+outer[i]*t) for i in range(3))
    return im.convert('RGBA')

def background(n=N):
    bg=radial(n,(64,170,178),(8,40,56))
    # light rays
    rays=Image.new('L',(n,n),0); d=ImageDraw.Draw(rays)
    for x0,w,a in [(0.22,0.07,70),(0.40,0.05,55),(0.58,0.09,60),(0.78,0.05,45)]:
        top=x0*n; d.polygon([(top-w*n*0.3,-10),(top+w*n*0.3,-10),(top+w*n*1.6-0.25*n,n),(top-w*n*1.6-0.25*n,n)],fill=a)
    rays=rays.filter(ImageFilter.GaussianBlur(n*0.025))
    bg=Image.composite(Image.new('RGBA',(n,n),(210,250,240,255)),bg,rays.point(lambda v:int(v*0.6)))
    # bottom sand glow
    sand=Image.new('L',(n,n),0); ImageDraw.Draw(sand).ellipse((-0.2*n,0.82*n,1.2*n,1.35*n),fill=150)
    sand=sand.filter(ImageFilter.GaussianBlur(n*0.05))
    bg=Image.composite(Image.new('RGBA',(n,n),(196,170,120,255)),bg,sand)
    return bg

def place(canvas,path,w,cx,cy,rot=0,dark=0.0,blur=0,flip=False,alpha=1.0):
    im=Image.open(A+path).convert('RGBA')
    if flip: im=im.transpose(Image.FLIP_LEFT_RIGHT)
    h=int(im.height*w/im.width); im=im.resize((int(w),h),Image.LANCZOS)
    if rot: im=im.rotate(rot,resample=Image.BICUBIC,expand=True)
    if dark:
        r,g,b,a=im.split()
        tint=Image.new('RGBA',im.size,(10,50,60,255)); tint.putalpha(a)
        im=Image.blend(im,tint,dark)
    if blur: im=im.filter(ImageFilter.GaussianBlur(blur))
    if alpha<1: im.putalpha(im.getchannel('A').point(lambda v:int(v*alpha)))
    canvas.alpha_composite(im,(int(cx-im.width/2),int(cy-im.height/2)))
    return im

def bubbles(canvas,pts):
    d=ImageDraw.Draw(canvas,'RGBA')
    for x,y,r in pts:
        x*=canvas.width;y*=canvas.width;r*=canvas.width
        d.ellipse((x-r,y-r,x+r,y+r),fill=(225,255,250,70),outline=(235,255,252,200),width=max(2,int(r*0.18)))
        d.ellipse((x-r*0.55,y-r*0.6,x-r*0.15,y-r*0.2),fill=(255,255,255,210))

def scene(n=N, scale=1.0, plants=True):
    c=background(n); k=scale; P=lambda v:(0.5+(v-0.5)*k)*n
    if plants:
        place(c,'scape/plant-rotala.png',n*0.42*k,P(0.12),P(0.86),dark=0.45,blur=n*0.004)
        place(c,'scape/plant-rotala.png',n*0.36*k,P(0.90),P(0.88),dark=0.5,blur=n*0.004,flip=True)
        place(c,'scape/plant-eleocharis.png',n*0.6*k,P(0.5),P(1.02),dark=0.25)
    bubbles(c,[(0.5+(x-0.5)*k,0.5+(y-0.5)*k,r*k) for x,y,r in [(0.80,0.20,0.030),(0.74,0.29,0.020),(0.83,0.36,0.014),(0.18,0.24,0.016)]])
    return c

def fish(c, n, scale):
    w=n*0.86*scale
    # glow behind fish
    src=Image.open(A+'fish/fins/guppy-male-albino-red-halfmoon.png').convert('RGBA')
    h=int(src.height*w/src.width); f=src.resize((int(w),h),Image.LANCZOS).rotate(8,resample=Image.BICUBIC,expand=True)
    glow=Image.new('RGBA',f.size,(255,240,200,0)); glow.putalpha(f.getchannel('A').filter(ImageFilter.GaussianBlur(n*0.03)).point(lambda v:int(v*0.55)))
    shadow=Image.new('RGBA',f.size,(0,20,30,0)); shadow.putalpha(f.getchannel('A').filter(ImageFilter.GaussianBlur(n*0.02)).point(lambda v:int(v*0.5)))
    x=int(n*0.5-f.width/2); y=int(n*0.52-f.height/2)
    c.alpha_composite(shadow,(x+int(n*0.012),y+int(n*0.035)))
    c.alpha_composite(glow,(x,y))
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

# --- full icon (any): rounded square, gold rim
c=scene(); fish(c,N,1.0)
# vignette top gloss
gloss=Image.new('L',(N,N),0); ImageDraw.Draw(gloss).ellipse((-0.3*N,-0.75*N,1.3*N,0.30*N),fill=40); gloss=gloss.filter(ImageFilter.GaussianBlur(N*0.03))
c=Image.composite(Image.new('RGBA',(N,N),(255,255,255,255)),c,gloss)
full=c.copy(); rad=int(N*0.22)
gold_rim(full,N,rad,int(N*0.004),int(N*0.02))
m=rounded_mask(N,rad); out=Image.new('RGBA',(N,N),(0,0,0,0)); out.paste(full,(0,0),m)
out.save(OUT+'/icon-any-1024.png')
# --- square full-bleed (maskable / apple / android legacy source): scene with fish scaled into safe zone
sq=scene(); fish(sq,N,0.82)
sq=Image.composite(Image.new('RGBA',(N,N),(255,255,255,255)),sq,gloss)
sq.save(OUT+'/icon-square-1024.png')
# --- android adaptive layers (432 = 108dp*4): background scene, foreground fish only within 66dp safe zone
bgl=scene(scale=0.72); bgl.save(OUT+'/adaptive-bg-1024.png')
fg=Image.new('RGBA',(N,N),(0,0,0,0)); fish(fg,N,0.66); fg.save(OUT+'/adaptive-fg-1024.png')
