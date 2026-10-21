"""開場店面加筆觸：kuwahara 濾鏡兩次＋木紋、光暈、筆刷紋理。用法見同資料夾 render.mjs 開頭。"""
import sys, numpy as np
from PIL import Image, ImageFilter
D=sys.argv[1]
rng=np.random.default_rng(7)
def load(n): return np.asarray(Image.open(f'{D}/{n}.png').convert('RGBA')).astype(np.float32)/255
def gblur(x,s):
  if x.ndim==3: return np.stack([gblur(x[...,c],s) for c in range(x.shape[2])],-1)
  H,W=x.shape; p=int(3*s)+1
  xp=np.pad(x,p,mode='edge')
  fy=np.fft.fftfreq(xp.shape[0])[:,None]; fx=np.fft.rfftfreq(xp.shape[1])[None,:]
  g=np.exp(-2*(np.pi*s)**2*(fx**2+fy**2))
  return np.fft.irfft2(np.fft.rfft2(xp)*g,xp.shape)[p:p+H,p:p+W].astype(np.float32)
def noise(h,w,sx,sy,seed):
  r=np.random.default_rng(seed); n=r.standard_normal((h,w)).astype(np.float32)
  # anisotropic blur: blur by resize trick
  small=Image.fromarray(n,'F').resize((max(2,int(w/sx)),max(2,int(h/sy))),Image.BILINEAR)
  n=np.asarray(small.resize((w,h),Image.BICUBIC)); return n/ (n.std()+1e-6)
def box(x,r):
  # mean over (2r+1)^2 window via integral image, edge-padded
  p=np.pad(x,((r+1,r),(r+1,r))+((0,0),)*(x.ndim-2),mode='edge')
  c=p.cumsum(0).cumsum(1)
  k=2*r+1
  return (c[k:,k:]-c[:-k,k:]-c[k:,:-k]+c[:-k,:-k])/(k*k)
def kuwahara(rgb,r):
  P=r+2; H0,W0=rgb.shape[:2]
  rgb=np.pad(rgb,((P,P),(P,P),(0,0)),mode='reflect')
  H,W,_=rgb.shape; lum=rgb.mean(-1)
  m=box(rgb,r//2); v=box(lum**2,r//2)-box(lum,r//2)**2
  h=r//2
  best=None
  for dy in(-h,h):
    for dx in(-h,h):
      ms=np.roll(m,(dy,dx),(0,1)); vs=np.roll(v,(dy,dx),(0,1))
      if best is None: best=(vs,ms)
      else:
        sel=vs<best[0]; best=(np.where(sel,vs,best[0]),np.where(sel[...,None],ms,best[1]))
  return best[1][P:P+H0,P:P+W0]
def painterly(a,r=6,grain=0.05,seed=1):
  rgb=a[...,:3]; al=a[...,3]
  # premultiply-safe: fill transparent rgb with blurred neighbours so edges don't go dark
  if al.min()<1:
    w=gblur(al,4)[...,None]+1e-4; fill=gblur(rgb*al[...,None],4)/w
    rgb=np.where(al[...,None]>0.02,rgb,fill)
  H,W=al.shape
  out=kuwahara(rgb,r)
  out=kuwahara(out,max(2,r//2))
  # brush grain: directional streaks, a little canvas tooth
  st=noise(H,W,14,2.5,seed)*0.6+noise(H,W,2.5,14,seed+1)*0.4
  tooth=noise(H,W,1.2,1.2,seed+2)
  out=out*(1+grain*st[...,None]+0.012*tooth[...,None])
  if al.min()<1:
    al=np.clip(kuwahara(np.repeat(al[...,None],3,-1),max(2,r//2))[...,0],0,1)
  return np.concatenate([np.clip(out,0,1),al[...,None]],-1)
def save(a,n,q=86):
  Image.fromarray((np.clip(a,0,1)*255).astype(np.uint8),'RGBA' if a.shape[2]==4 else 'RGB').save(f'{D}/{n}.webp','WEBP',quality=q,method=6)

b=load('back'); H,W=b.shape[:2]; rgb=b[...,:3]
yy,xx=np.mgrid[:H,:W].astype(np.float32)
lum=rgb.mean(-1)
# 木牆：找出暗棕色的地方，加上橫向木紋和每片木板的深淺
r_,g_,bb=rgb[...,0],rgb[...,1],rgb[...,2]
wall=((r_>g_)&(g_>=bb*0.9)&(lum<0.32)&(yy>228)).astype(np.float32)
wall=gblur(wall,1.5)
plank=np.floor((yy-228)/36)
pv=np.random.default_rng(3).uniform(-0.09,0.09,200)[np.clip(plank,0,199).astype(int)]
grainw=noise(H,W,60,1.6,11)*0.07+noise(H,W,180,3,12)*0.05
rgb=rgb*(1+wall[...,None]*(pv+grainw)[...,None])
# 天空：一點雲和遠處城市的暗影
sky=(yy<200)|(xx<216)|(xx>1704)
cloud=np.clip(noise(H,W,220,70,21),0,None)*0.035
rgb=rgb+(sky*cloud)[...,None]*np.array([0.55,0.65,0.8])
# 光暈：亮的地方往外暈開（窗、門、燈）
bright=np.clip((rgb.mean(-1)-0.55)/0.45,0,1)[...,None]*rgb
bloom=gblur(bright,18)*0.55+gblur(bright,60)*0.35
rgb=1-(1-rgb)*(1-np.clip(bloom,0,1))
b[...,:3]=np.clip(rgb,0,1)
p=painterly(b,r=7,grain=0.05,seed=1)
fine=painterly(b,r=3,grain=0.03,seed=1)
tm=np.zeros((H,W),np.float32)
for x0 in (326,1286):
  for y0,y1 in ((504,648),(679,811)): tm[y0:y1,x0:x0+308]=1
tm=gblur(tm,4)[...,None]
p=p*(1-tm)+fine*tm
# 暗角
v=1-0.35*np.clip(np.hypot((xx-W/2)/(W*0.62),(yy-H*0.55)/(H*0.75))-0.55,0,1)
p[...,:3]*=v[...,None]
save(p[...,:3],'shop-night',84)
for n,s in (('doorl',3),('doorr',4),('front',5)):
  a=load(n)
  # 門板、門框也加木紋
  m=(a[...,3]>0.5)&(a[...,:3].mean(-1)<0.5)
  a[...,:3]*=1+(m*(noise(H,W,1.6,50,30+s)*0.06+noise(H,W,3,140,40+s)*0.05))[...,None]
  q=painterly(a,r=6,grain=0.05,seed=s)
  q[...,:3]*=v[...,None]
  ys,xs=np.where(q[...,3]>0.01); y0,y1,x0,x1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
  print(n,'box',x0,y0,x1,y1)
  save(q[y0:y1,x0:x1],'shop-'+n,86)
