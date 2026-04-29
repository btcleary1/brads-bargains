// Aggregates sold comp data from eBay (primary), Mercari, StockX, and Amazon.
// Produces a weighted average resale price that reflects what an item actually sells for
// across major secondhand markets. eBay is always required; other sources enhance confidence.

import { searchSoldComps } from './ebay-comps';
import { searchMercariSold } from './mercari';
import { searchStockX } from './stockx';
import { searchAmazonPrice } from './amazon';
import { extractModelQuery } from './extract-model';

export interface MultiSourceCompsResult {
  weightedAvgSoldPrice: number;
  ebayAvg: number | null;
  ebayCount: number;
  mercariAvg: number | null;
  stockxLastSale: number | null;
  amazonPrice: number | null;
  confidence: 'high' | 'medium' | 'low';
  estDaysToSell: number | null;
  modelQuery: string;
  sourcesUsed: string[];
}

const COLLECTIBLE_RE = /jordan|nike\s+dunk|adidas|yeezy|sneaker|pokemon|trading\s+card|sports\s+card|psa|bgs|sgc|lego|funko|comic/i;

export async function getMultiSourceComps(
  title: string,
  maxEbayResults = 15,
): Promise<MultiSourceCompsResult | null> {
  const modelQuery = extractModelQuery(title);
  const isCollectible = COLLECTIBLE_RE.test(title);

  // Fire all sources in parallel using the refined model query
  const [ebayResult, mercariResult, stockxResult, amazonResult] = await Promise.allSettled([
    searchSoldComps(modelQuery, maxEbayResults),
    searchMercariSold(modelQuery, 10),
    isCollectible ? searchStockX(modelQuery) : Promise.resolve(null),
    searchAmazonPrice(modelQuery),
  ]);

  const ebay  = ebayResult.status   === 'fulfilled' ? ebayResult.value   : null;
  const mercari = mercariResult.status === 'fulfilled' ? mercariResult.value : null;
  const stockx  = stockxResult.status  === 'fulfilled' ? stockxResult.value  : null;
  const amazon  = amazonResult.status  === 'fulfilled' ? amazonResult.value  : null;

  const ebayAvg       = ebay && ebay.count >= 2 ? ebay.avgSoldPrice : null;
  const mercariAvg    = mercari?.avgSoldPrice && mercari.soldCount >= 2 ? mercari.avgSoldPrice : null;
  const stockxLastSale = stockx?.lastSalePrice && stockx.lastSalePrice > 0 ? stockx.lastSalePrice : null;
  const amazonPrice   = amazon?.lowestPrice && amazon.lowestPrice > 0 ? amazon.lowestPrice : null;

  // eBay is required — it's the primary market for resale
  if (!ebayAvg) return null;

  // --- Weighted average ---
  // Base weights (out of 100): eBay 50, Mercari 15, StockX 15, Amazon 20
  // Amazon contributes current listing price (not historical sold), so it acts as a
  // ceiling reference: if Amazon is cheaper than eBay avg, buyers will go to Amazon —
  // we cap the weighted avg rather than blindly blending.

  let weightedSum = ebayAvg * 50;
  let totalWeight = 50;
  const sourcesUsed: string[] = ['eBay'];

  if (mercariAvg) {
    weightedSum += mercariAvg * 15;
    totalWeight += 15;
    sourcesUsed.push('Mercari');
  }

  if (stockxLastSale && isCollectible) {
    weightedSum += stockxLastSale * 15;
    totalWeight += 15;
    sourcesUsed.push('StockX');
  }

  let amazonIsCeiling = false;
  if (amazonPrice) {
    sourcesUsed.push('Amazon');
    // If Amazon is >15% cheaper than eBay avg: act as ceiling instead of weight
    if (amazonPrice < ebayAvg * 0.85) {
      amazonIsCeiling = true;
    } else {
      weightedSum += amazonPrice * 20;
      totalWeight += 20;
    }
  }

  let weightedAvg = Math.round(weightedSum / totalWeight);

  // Apply Amazon ceiling if it undercuts eBay — buyers won't pay above Amazon price
  if (amazonIsCeiling && amazonPrice) {
    weightedAvg = Math.min(weightedAvg, Math.round(amazonPrice * 0.97));
  }

  // --- Confidence ---
  const prices = [ebayAvg, mercariAvg, stockxLastSale].filter((p): p is number => p != null);
  const maxP = Math.max(...prices);
  const minP = Math.min(...prices);
  const spread = maxP > 0 ? (maxP - minP) / maxP : 0;

  let confidence: 'high' | 'medium' | 'low';
  if (sourcesUsed.length >= 3 && (ebay?.count ?? 0) >= 5 && spread <= 0.30) {
    confidence = 'high';
  } else if (sourcesUsed.length >= 2 && (ebay?.count ?? 0) >= 3) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    weightedAvgSoldPrice: weightedAvg,
    ebayAvg,
    ebayCount: ebay?.count ?? 0,
    mercariAvg,
    stockxLastSale,
    amazonPrice,
    confidence,
    estDaysToSell: ebay?.estDaysToSell ?? null,
    modelQuery,
    sourcesUsed,
  };
}
