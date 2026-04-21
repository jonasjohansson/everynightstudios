// Calibrated so that a slider value of 1.5 renders text at ~16cm —
// the physical width of the cap front where embroidery goes.
export const CAP_FRONT_CM = 10.67;

export function buildSpecs(cards, master, threadLookup) {
  const widthCm = Math.round(CAP_FRONT_CM * (master.fontScale ?? 1) * 10) / 10;
  return cards.map((c, i) => {
    const { cap, threadHex } = c.state;
    return {
      index: i + 1,
      capId: cap.id,
      capName: cap.name,
      threadHex,
      threadName: threadLookup[threadHex] ?? null,
      text: master.text,
      logoFilename: master.logoFilename ?? null,
      embroideryWidthCm: widthCm,
    };
  });
}
