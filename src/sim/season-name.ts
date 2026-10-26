
/** 開機用不到，分出來讓開機少載一點（docs/performance-budget.md）。 */
export function seasonName(month: number): string {
  const m = Math.floor((((month % 12) + 12) % 12)) + 1;
  if (m <= 2) return '冬天';
  if (m <= 4) return '春天';
  if (m <= 6) return '梅雨季';
  if (m <= 8) return '夏天';
  if (m <= 10) return '秋天';
  return '初冬';
}
