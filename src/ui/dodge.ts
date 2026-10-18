/** 浮動卡片可以停的四個角落，依序是偏好順序。 */
export const CORNERS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const;
export type Corner = (typeof CORNERS)[number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 卡片停在 area 某個角落時佔的範圍。 */
export function cornerRect(corner: Corner, area: Rect, w: number, h: number, margin: number): Rect {
  const right = corner.endsWith('right');
  const bottom = corner.startsWith('bottom');
  return {
    x: right ? area.x + area.w - margin - w : area.x + margin,
    y: bottom ? area.y + area.h - h : area.y,
    w,
    h,
  };
}

function covers(r: Rect, px: number, py: number, pad: number): boolean {
  return px > r.x - pad && px < r.x + r.w + pad && py > r.y - pad && py < r.y + r.h + pad;
}

/**
 * 選一個不會擋住選取的魚的角落。目前的角落沒擋到就不動（避免卡片跟著魚跳來跳去）；
 * 擋到了就依序找第一個沒擋到的角落，全部都擋到就挑離魚最遠的。
 */
export function pickCorner(current: Corner, fish: { x: number; y: number } | null, area: Rect, w: number, h: number, margin = 14, pad = 36): Corner {
  if (!fish) return current;
  if (!covers(cornerRect(current, area, w, h, margin), fish.x, fish.y, pad)) return current;
  const free = CORNERS.find((c) => !covers(cornerRect(c, area, w, h, margin), fish.x, fish.y, pad));
  if (free) return free;
  const dist = (c: Corner) => {
    const r = cornerRect(c, area, w, h, margin);
    return Math.hypot(r.x + r.w / 2 - fish.x, r.y + r.h / 2 - fish.y);
  };
  return CORNERS.reduce((a, b) => (dist(b) > dist(a) ? b : a));
}
