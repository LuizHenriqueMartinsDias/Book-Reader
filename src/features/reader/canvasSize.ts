/** Mobile Safari refuses canvases above ~16.7M pixels; cap the backing store under that. */
const MAX_PIXELS = 16_000_000;

/** Sizes a canvas for crisp output at `cssWidth`×`cssHeight` and returns the pixel ratio used. */
export function sizeCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number) {
  let ratio = window.devicePixelRatio || 1;
  if (cssWidth * cssHeight * ratio * ratio > MAX_PIXELS) ratio = Math.sqrt(MAX_PIXELS / (cssWidth * cssHeight));
  canvas.width = Math.max(1, Math.floor(cssWidth * ratio));
  canvas.height = Math.max(1, Math.floor(cssHeight * ratio));
  return ratio;
}
