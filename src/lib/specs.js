export function buildSpecs(cards, master, threadLookup) {
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
    };
  });
}
