export function fitFontSize(ctx, text, family, startSize, maxWidth, opts = {}) {
  const max = opts.max ?? 500;
  const min = opts.min ?? 6;
  ctx.font = `${startSize}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w === 0) return startSize;
  let size = (maxWidth / w) * startSize;
  size = Math.max(min, Math.min(max, size));
  return Math.floor(size);
}
