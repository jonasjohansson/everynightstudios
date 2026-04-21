// Calibrated so that a slider value of ~1.9 renders text at ~20cm —
// the physical width of the cap's front panel / rim.
export const CAP_FRONT_CM = 10.5;

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
