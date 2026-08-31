import { Linkage } from '../../../types';

// C10: shared fuzzy-BFS over traceability linkages, previously duplicated
// character-identically in DashboardView.tsx and MatrixView.tsx. This is the
// canonical home for the AGENTS.md "prefer fuzzy matching on linkages"
// convention (case-insensitive substring match, >= 5 chars on both sides, to
// tolerate LLM wording drift between artifacts and linkages.json).
//
// Note: the dedup guard inside the loop is O(connected x linkages) per
// expansion and runs on every hover in both views; keep the set small or
// memoize at the call site (both views wrap this in useMemo on hover state).
export const getConnectedSet = (seed: string | null, linkages: Linkage[] = []) => {
  const connected = new Set<string>();
  if (!seed) return connected;

  const queue = [seed];
  connected.add(seed);

  const isMatch = (a: string, b: string) => {
    if (!a || !b || a.length < 5 || b.length < 5) return false;
    const lowA = a.toLowerCase();
    const lowB = b.toLowerCase();
    return lowA.includes(lowB) || lowB.includes(lowA);
  };

  while (queue.length > 0) {
    const curr = queue.shift()!;
    linkages.forEach(link => {
      if (isMatch(link.source, curr) && !Array.from(connected).some(c => isMatch(c, link.target))) {
        connected.add(link.target);
        queue.push(link.target);
      }
      if (isMatch(link.target, curr) && !Array.from(connected).some(c => isMatch(c, link.source))) {
        connected.add(link.source);
        queue.push(link.source);
      }
    });
  }
  return connected;
};
