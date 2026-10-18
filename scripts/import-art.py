"""把共用資料夾的 AI 生圖素材縮成遊戲用的大小，轉成 webp 放進 public/art/。

用法：python3 scripts/import-art.py /mnt/project-files/art
原檔很大（約 1000 px、PNG），遊戲裡魚最大也只顯示到兩三百像素，所以縮小再壓縮。
"""
import json
import sys
from pathlib import Path

from PIL import Image

# 類別 → 最長邊像素
MAX_SIDE = {'fish': 512, 'shrimp': 384, 'scape': 768, 'ui': 128, 'bg': 1920}

src = Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/art')
dst = Path(__file__).resolve().parent.parent / 'public' / 'art'
manifest = json.loads((src / 'manifest.json').read_text())
only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None

for item in manifest['items']:
    rel = Path(item['path']).relative_to('art')
    cat = rel.parts[0]
    if only and cat not in only:
        continue
    if cat == 'bg' and '2560' in rel.name:
        continue
    im = Image.open(src / rel)
    im = im.convert('RGBA') if item.get('transparent') else im.convert('RGB')
    im.thumbnail((MAX_SIDE[cat], MAX_SIDE[cat]), Image.LANCZOS)
    out = dst / rel.with_suffix('.webp')
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, 'WEBP', quality=85, method=6)
    print(f'{out.relative_to(dst.parent.parent)}  {im.size[0]}x{im.size[1]}  {out.stat().st_size // 1024} KB')
