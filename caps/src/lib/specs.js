// Calibrated from measured references: readout 10cm ≈ physical 8cm;
// readout 20cm ≈ physical 16cm (= the cap front panel width).
export const CAP_FRONT_CM = 8.4;

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
