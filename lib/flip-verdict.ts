// Single source of truth for buy/maybe/skip verdicts.
//
// Previously four separate copies of this logic existed (digest candidate pass,
// digest user-pool pass, flip-agent, quick-comps) with different thresholds. The
// selection stage used the loosest set and the display stage used the strictest,
// so items were picked as "buy" and then rendered as "skip" in the same email.

export type Verdict = 'buy' | 'maybe' | 'skip';

export interface VerdictInput {
  netProfit: number;
  marginPct: number;
  soldCount: number;
  daysToSell: number | null;
}

// Below this many sold comps we cannot verify the price at all.
export const MIN_SOLD_COMPS = 5;
// Longer than this and the capital is tied up past the point the flip is worth it.
export const MAX_DAYS_TO_SELL = 60;
// Slower than this is still viable but never a "buy".
export const SLOW_SALE_DAYS = 30;
// Below this the margin does not cover the risk of the estimate being wrong.
export const MIN_VIABLE_PROFIT = 10;

export function computeVerdict({ netProfit, marginPct, soldCount, daysToSell }: VerdictInput): Verdict {
  if (soldCount < MIN_SOLD_COMPS) return 'skip';
  if (daysToSell != null && daysToSell > MAX_DAYS_TO_SELL) return 'skip';
  if (netProfit < MIN_VIABLE_PROFIT) return 'skip';

  const isBuy = netProfit > 50 || (netProfit > 30 && marginPct > 20);
  if (!isBuy) return 'maybe';

  // Profitable but slow — real, just not a headline pick.
  if (daysToSell != null && daysToSell > SLOW_SALE_DAYS) return 'maybe';
  return 'buy';
}

// True when an item is fit to appear in a digest at all. Used to keep the
// selection stage and the display stage in agreement.
export function isDigestEligible(input: VerdictInput, minNetProfit: number): boolean {
  return computeVerdict(input) !== 'skip' && input.netProfit >= minNetProfit;
}
