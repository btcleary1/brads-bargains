// A2A orchestration layer — a Claude agent that decides which deals to include in the digest.
// It uses tools to selectively invoke the seller-quality sub-agent, making the overall pipeline
// agent-driven rather than hard-coded.  Falls back to simple scoring when the API is unavailable.

import Anthropic from '@anthropic-ai/sdk';
import type { EbayItem } from './ebay';
import type { FlipData } from './notify';
import { checkSellerQuality } from './seller-quality';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface OrchestratorResult {
  rankedItemIds: string[];   // ordered best-first, up to maxItems
  reasoning: string;
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'check_seller_quality',
    description:
      "Calls the seller-quality agent to fetch and analyze a seller's recent negative eBay feedback. " +
      'Use this for sellers whose items you are considering including but whose rating gives you pause. ' +
      'Returns verdict (ok | warning | flag), reason, and recentNegativeCount.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sellerUsername:    { type: 'string', description: 'eBay seller username' },
        feedbackPercent:   { type: 'number', description: 'Seller positive feedback %' },
        feedbackScore:     { type: 'number', description: 'Total seller feedback score' },
      },
      required: ['sellerUsername'],
    },
  },
  {
    name: 'finalize_selection',
    description:
      'Submit the final ordered list of item IDs to include in the digest. ' +
      'Call this once you have enough information to make your decision.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rankedItemIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Item IDs to include, best-first, max 5',
        },
        reasoning: {
          type: 'string',
          description: 'One- or two-sentence summary of your selection logic',
        },
      },
      required: ['rankedItemIds', 'reasoning'],
    },
  },
];

// ── Simple deterministic fallback ─────────────────────────────────────────────

function simpleFallback(
  items: EbayItem[],
  flipMap: Map<string, FlipData>,
  maxDaysToSell: number,
  minNetProfit: number,
  maxItems: number,
): OrchestratorResult {
  const ranked = items
    .filter(i => {
      const f = flipMap.get(i.itemId);
      if (!f || f.verdict === 'skip') return false;
      if (f.estDaysToSell != null && f.estDaysToSell > maxDaysToSell) return false;
      if (f.netProfit < minNetProfit) return false;
      return true;
    })
    .sort((a, b) => {
      const af = flipMap.get(a.itemId)!;
      const bf = flipMap.get(b.itemId)!;
      const order = { buy: 0, maybe: 1, skip: 2 };
      if (af.verdict !== bf.verdict) return order[af.verdict] - order[bf.verdict];
      return bf.netProfit - af.netProfit;
    })
    .slice(0, maxItems)
    .map(i => i.itemId);

  return { rankedItemIds: ranked, reasoning: 'Deterministic fallback: filtered by profit and days-to-sell, sorted by verdict then profit.' };
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

export async function orchestrateDigestSelection(
  items: EbayItem[],
  flipMap: Map<string, FlipData>,
  maxDaysToSell: number,
  minNetProfit: number,
  maxItems = 5,
  tasteWeights: Record<string, number> = {},
  excludedCategories: string[] = [],
): Promise<OrchestratorResult> {
  if (!process.env.ANTHROPIC_API_KEY || items.length === 0) {
    return simpleFallback(items, flipMap, maxDaysToSell, minNetProfit, maxItems);
  }

  // Build a compact candidate summary for the orchestrator's context window.
  // Only show items that have flip analysis — omit obvious skips to reduce noise.
  const candidates = items
    .map(i => ({ item: i, flip: flipMap.get(i.itemId) }))
    .filter(({ flip }) => flip && flip.verdict !== 'skip')
    .slice(0, 20); // cap at 20 to keep the prompt tight

  if (candidates.length === 0) {
    return simpleFallback(items, flipMap, maxDaysToSell, minNetProfit, maxItems);
  }

  const candidateLines = candidates.map(({ item: i, flip: f }) =>
    `ID:${i.itemId} | "${i.title}" | $${i.price} buy | ` +
    `verdict:${f!.verdict} profit:$${f!.netProfit} days:${f!.estDaysToSell ?? '?'} | ` +
    `seller:${i.seller} (${i.sellerFeedbackPercent ?? '?'}% / score ${i.sellerFeedbackScore ?? '?'})`
  ).join('\n');

  // Build disliked-category hint for the prompt (categories with weight < 0.7)
  const dislikedCategoryHints = Object.entries(tasteWeights)
    .filter(([, w]) => w < 0.7)
    .map(([k]) => k);

  const system = [
    `You are the deal-selection orchestrator for AI FLIP, a daily eBay flip advisory email.`,
    `Your task: choose the best ${maxItems} deals from the candidate list for today's digest.`,
    ``,
    `Rules:`,
    `• Max days-to-sell: ${maxDaysToSell}. Exclude items where days > ${maxDaysToSell}.`,
    `• Min net profit: $${minNetProfit}. Exclude items below this threshold.`,
    `• Prefer "buy" verdicts over "maybe". Never include "skip".`,
    `• Diversify — avoid picking 5 items from the same category.`,
    ...(excludedCategories.length > 0 ? [
      `• HARD EXCLUDE these user-rejected categories: ${excludedCategories.join(', ')}. Do not pick any item from these categories regardless of profit.`,
    ] : []),
    ...(dislikedCategoryHints.length > 0 ? [
      `• DEPRIORITIZE (avoid unless no better option): ${dislikedCategoryHints.join(', ')}.`,
    ] : []),
    `• For any seller you're considering whose feedbackPercent < 99 OR score < 50,`,
    `  call check_seller_quality before including their item.`,
    `  Flag result → exclude. Warning result → include only if no better option.`,
    `• When you have your final list, call finalize_selection.`,
  ].join('\n');

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Candidates (${candidates.length} items, pre-filtered to non-skip with flip data):\n\n` +
        candidateLines +
        `\n\nConstraints: ≤${maxDaysToSell}d to sell, ≥$${minNetProfit} profit, pick ${maxItems}.`,
    },
  ];

  const MAX_TURNS = 8;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system,
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      console.warn('[orchestrator] API error on turn', turn, String(err).slice(0, 100));
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') break; // end_turn or error — nothing to process

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let finalized: OrchestratorResult | null = null;

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      if (block.name === 'check_seller_quality') {
        const input = block.input as { sellerUsername: string; feedbackPercent?: number; feedbackScore?: number };
        try {
          // ← This is the A2A call: orchestrator agent invokes the seller-quality agent
          const result = await checkSellerQuality(
            input.sellerUsername,
            input.feedbackPercent ?? null,
            input.feedbackScore ?? null,
          );
          console.log(`[orchestrator] seller quality for ${input.sellerUsername}: ${result.verdict}`);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        } catch (err) {
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: '{"verdict":"ok","reason":null,"recentNegativeCount":0}' });
        }

      } else if (block.name === 'finalize_selection') {
        const input = block.input as { rankedItemIds: string[]; reasoning: string };
        finalized = {
          rankedItemIds: input.rankedItemIds.slice(0, maxItems),
          reasoning: input.reasoning,
        };
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Selection finalized.' });
      }
    }

    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    }

    if (finalized) {
      console.log(`[orchestrator] done in ${turn + 1} turn(s): ${finalized.rankedItemIds.length} items — ${finalized.reasoning.slice(0, 80)}`);
      return finalized;
    }
  }

  console.warn('[orchestrator] did not call finalize_selection — using deterministic fallback');
  return simpleFallback(items, flipMap, maxDaysToSell, minNetProfit, maxItems);
}
