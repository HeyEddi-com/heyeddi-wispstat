/** Convert an integer minor-unit amount between currencies using USD-per-unit rates. */

export function convertMinor(
  amount: number,
  from: string,
  to: string,
  usdPerUnit: Record<string, number>
): number {
  const src = from.toUpperCase();
  const dst = to.toUpperCase();
  if (src === dst) return amount;
  const fromRate = usdPerUnit[src];
  const toRate = usdPerUnit[dst];
  if (!fromRate || !toRate) return amount;
  return Math.round((amount * fromRate) / toRate);
}
