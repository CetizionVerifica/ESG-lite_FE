/**
 * #209: the font size at which a figure fits its tile. Figures are set in font-num (IBM Plex Mono),
 * where every glyph is 0.6em wide, so N characters fill a box at 100 / (0.6 × N) ≈ 166/N % of its
 * width; 160/N leaves a small margin. The tile must be a size container (`@container`): 1cqi is 1%
 * of its width. A figure that fits keeps its `full` size; a longer one steps down, never below `min`.
 */
export function fitFigureSize(text: string, full: string, min = "0.75rem"): string {
  return `clamp(${min}, ${(160 / Math.max(1, [...text].length)).toFixed(2)}cqi, ${full})`;
}
