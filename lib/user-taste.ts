import { getFeedback } from './deal-feedback';
import { categoryKeyForTitle } from './infer-categories';

export interface TasteProfile {
  categoryWeights: Record<string, number>; // category key → multiplier (>1 = preferred, <1 = disliked)
  excludedCategories: string[];            // hard-excluded: ≥2 "not my niche" downvotes
  dislikedItemIds: Set<string>;            // individually thumbed-down item IDs
  minNetProfit: number;
}

export async function computeTasteProfile(userId: string): Promise<TasteProfile> {
  const feedback = await getFeedback(userId);
  if (feedback.length < 3) {
    return { categoryWeights: {}, excludedCategories: [], dislikedItemIds: new Set(), minNetProfit: 15 };
  }

  // Hard-excluded item IDs — any individual thumbs-down
  const dislikedItemIds = new Set(feedback.filter(f => f.verdict === 'down').map(f => f.itemId));

  // Per-category up/total counts and not_my_niche downvote counts
  const counts: Record<string, { up: number; total: number }> = {};
  const nicheDownvotes: Record<string, number> = {};
  for (const fb of feedback) {
    const key = categoryKeyForTitle(fb.title) ?? 'other';
    if (!counts[key]) counts[key] = { up: 0, total: 0 };
    counts[key].total++;
    if (fb.verdict === 'up') counts[key].up++;
    if (fb.verdict === 'down' && fb.reason === 'not_my_niche') {
      nicheDownvotes[key] = (nicheDownvotes[key] ?? 0) + 1;
    }
  }

  // Categories with ≥2 explicit "not my niche" votes are hard-excluded entirely
  const excludedCategories = Object.entries(nicheDownvotes)
    .filter(([, count]) => count >= 2)
    .map(([key]) => key);

  // Laplace-smoothed approval rate, normalized to 0.5 neutral baseline
  // Result: 1.0 = neutral, >1 = user likes this category, <1 = user dislikes it
  const categoryWeights: Record<string, number> = {};
  for (const [key, { up, total }] of Object.entries(counts)) {
    const smoothedRate = (up + 1) / (total + 2);
    categoryWeights[key] = smoothedRate / 0.5;
  }

  // Lower minNetProfit if user consistently approves low-profit deals
  const upFeedback = feedback.filter(f => f.verdict === 'up');
  let minNetProfit = 15;
  if (upFeedback.length >= 5) {
    const profits = upFeedback
      .map(f => f.netProfit ?? 0)
      .filter(p => p > 0)
      .sort((a, b) => a - b);
    if (profits.length >= 3) {
      const p25 = profits[Math.floor(profits.length * 0.25)];
      minNetProfit = Math.max(5, Math.min(15, Math.round(p25 * 0.8)));
    }
  }

  return { categoryWeights, excludedCategories, dislikedItemIds, minNetProfit };
}
