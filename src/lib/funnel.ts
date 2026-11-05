/** Ordered event funnel: a visitor counts for step N only after steps 1..N in time order. */

export interface FunnelHit {
  vh: string;
  name: string;
  ts: number;
}

export function funnelCounts(steps: string[], hits: FunnelHit[]): number[] {
  const byVisitor = new Map<string, FunnelHit[]>();
  for (const hit of hits) {
    const list = byVisitor.get(hit.vh) || [];
    list.push(hit);
    byVisitor.set(hit.vh, list);
  }
  const counts = steps.map(() => 0);
  for (const list of byVisitor.values()) {
    list.sort((a, b) => a.ts - b.ts);
    let step = 0;
    for (const hit of list) {
      if (step < steps.length && hit.name === steps[step]) step += 1;
    }
    for (let i = 0; i < step; i += 1) counts[i] = (counts[i] || 0) + 1;
  }
  return counts;
}
