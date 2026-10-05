/**
 * Weekly digest text. Site names are operator config, not visitor data.
 */

export interface DigestStats {
  visitors: number;
  pv: number;
  topSource: string;
  topPage: string;
  conversions: number;
  revenue: number;
}

export function digestText(siteName: string, current: DigestStats, previous: DigestStats): { text: string; anomaly: boolean } {
  const anomaly = previous.visitors > 0 && current.visitors > previous.visitors * 3;
  const delta = previous.visitors === 0
    ? 'n/a'
    : `${Math.round(((current.visitors - previous.visitors) / previous.visitors) * 100)}%`;
  const lines = [
    `Wispstat weekly — ${siteName}`,
    `Visitors ${current.visitors} (${delta} vs prior week), pageviews ${current.pv}`,
    `Top source: ${current.topSource || 'Direct'}`,
    `Top page: ${current.topPage || '/'}`,
    `Conversions ${current.conversions}, revenue ${current.revenue.toFixed(2)}`,
  ];
  if (anomaly) lines.push('Anomaly: visitors are more than 3× the previous week.');
  return { text: lines.join('\n'), anomaly };
}
