export function resolveAnchor(anchor, imgW, imgH) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const x = clamp(anchor.x, 0, 1);
  const y = clamp(anchor.y, 0, 1);
  const w = clamp(anchor.width, 0, 1);
  return {
    cx: Math.round(x * imgW),
    cy: Math.round(y * imgH),
    boxW: Math.round(w * imgW),
  };
}
