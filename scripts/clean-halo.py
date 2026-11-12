"""清掉去背後主體外圍殘留的低透明度雜點（綠白光暈）。

用法：python3 scripts/clean-halo.py 輸入.png 輸出.png
只保留「實心主體往外擴幾像素」範圍內的像素，範圍外一律透明；範圍內透明度太低的也清掉。
"""
import sys
from PIL import Image, ImageFilter

im = Image.open(sys.argv[1]).convert('RGBA')
a = im.getchannel('A')
core = a.point(lambda v: 255 if v > 110 else 0).filter(ImageFilter.MaxFilter(9))
keep = Image.composite(a.point(lambda v: v if v > 60 else 0), Image.new('L', im.size, 0), core)
im.putalpha(keep)
im.crop(keep.point(lambda v: 255 if v > 20 else 0).getbbox()).save(sys.argv[2])
