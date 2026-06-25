// Aggregates sold comp data from eBay (primary), Mercari, StockX, and Amazon.
// Produces a weighted average resale price that reflects what an item actually sells for
// across major secondhand markets. eBay is always required; other sources enhance confidence.

import { searchSoldComps } from './ebay-comps';
import { searchMercariSold } from './mercari';
import { searchStockX } from './stockx';
import { searchAmazonPrice } from './amazon';
import { extractModelQuery } from './extract-model';
import { searchMacBidSold } from './macbid';
import { searchVistaAuctionSold } from './vista-auction';

export interface MultiSourceCompsResult {
  weightedAvgSoldPrice: number;
  ebayAvg: number | null;
  ebayCount: number;
  mercariAvg: number | null;
  stockxLastSale: number | null;
  amazonPrice: number | null;
  macbidAvg: number | null;
  vistaAvg: number | null;
  confidence: 'high' | 'medium' | 'low';
  estDaysToSell: number | null;
  modelQuery: string;
  sourcesUsed: string[];
}

const COLLECTIBLE_RE = /jordan|nike\s+dunk|adidas|yeezy|sneaker|pokemon|trading\s+card|sports\s+card|psa|bgs|sgc|lego|funko|comic/i;

// Amazon and StockX only sell NEW items. For used/pre-owned listings they should
// act as price ceilings (buyers won't pay above new price), not blended averages.
// Mercari skews used, so it gets more weight when the listing is used.
function conditionTier(condition: string): 'new' | 'like-new' | 'used' {
  const c = condition.toLowerCase();
  if (/\bnew\b/.test(c) && !/like.?new|open.?box/.test(c)) return 'new';
  if (/like.?new|open.?box|sealed/.test(c)) return 'like-new';
  return 'used'; // used, pre-owned, good, acceptable, fair, for parts
}

export async function getMultiSourceComps(
  title: string,
  maxEbayResults = 15,
  condition = '',
): Promise<MultiSourceCompsResult | null> {
  const modelQuery = extractModelQuery(title);
  const isCollectible = COLLECTIBLE_RE.test(title);
  const tier = conditionTier(condition);

  // Fire all sources in parallel using the refined model query
  const [ebayResult, mercariResult, stockxResult, amazonResult, macbidResult, vistaResult] = await Promise.allSettled([
    searchSoldComps(modelQuery, maxEbayResults),
    searchMercariSold(modelQuery, 10),
    isCollectible ? searchStockX(modelQuery) : Promise.resolve(null),
    searchAmazonPrice(modelQuery),
    searchMacBidSold(modelQuery),
    searchVistaAuctionSold(modelQuery),
  ]);

  const ebay    = ebayResult.status    === 'fulfilled' ? ebayResult.value    : null;
  const mercari = mercariResult.status === 'fulfilled' ? mercariResult.value : null;
  const stockx  = stockxResult.status  === 'fulfilled' ? stockxResult.value  : null;
  const amazon  = amazonResult.status  === 'fulfilled' ? amazonResult.value  : null;
  const macbid  = macbidResult.status  === 'fulfilled' ? macbidResult.value  : null;
  const vista   = vistaResult.status   === 'fulfilled' ? vistaResult.value   : null;

  const ebayAvg        = ebay && ebay.count >= 2 ? ebay.avgSoldPrice : null;
  const mercariAvg     = mercari?.avgSoldPrice && mercari.soldCount >= 2 ? mercari.avgSoldPrice : null;
  const stockxLastSale = stockx?.lastSalePrice && stockx.lastSalePrice > 0 ? stockx.lastSalePrice : null;
  const amazonPrice    = amazon?.lowestPrice && amazon.lowestPrice > 0 ? amazon.lowestPrice : null;
  const macbidAvg      = macbid?.avgSoldPrice && macbid.soldCount >= 2 ? macbid.avgSoldPrice : null;
  const vistaAvg       = vista?.avgSoldPrice && vista.soldCount >= 2 ? vista.avgSoldPrice : null;

  // eBay is required — it's the primary market for resale
  if (!ebayAvg) return null;

  // --- Condition-aware weighted average ---
  // New:       eBay 50 | Amazon 20 (blend)   | StockX 15 | Mercari 10
  // Like-new:  eBay 50 | Amazon 15 (blend)   | StockX 10 | Mercari 15
  // Used:      eBay 50 | Amazon ceiling-only  | StockX ceiling-only | Mercari 20
  //
  // "Ceiling-only" means the source price caps the weighted avg rather than
  // contributing to it — buyers won't pay more than the new price on Amazon/StockX.

  let weightedSum = ebayAvg * 50;
  let totalWeight = 50;
  const sourcesUsed: string[] = ['eBay'];

  // Mercari weight varies by condition
  if (mercariAvg) {
    const mercariWeight = tier === 'used' ? 20 : tier === 'like-new' ? 15 : 10;
    weightedSum += mercariAvg * mercariWeight;
    totalWeight += mercariWeight;
    sourcesUsed.push('Mercari');
  }

  // StockX: blend for new/like-new collectibles; ceiling-only for used
  let stockxIsCeiling = false;
  if (stockxLastSale && isCollectible) {
    sourcesUsed.push('StockX');
    if (tier === 'used') {
      stockxIsCeiling = true;
    } else {
      const stockxWeight = tier === 'new' ? 15 : 10;
      weightedSum += stockxLastSale * stockxWeight;
      totalWeight += stockxWeight;
    }
  }

  // Amazon: blend for new/like-new; ceiling-only for used OR if it undercuts eBay by >15%
  let amazonIsCeiling = false;
  if (amazonPrice) {
    sourcesUsed.push('Amazon');
    if (tier === 'used') {
      // Amazon is new price — always ceiling for used listings
      amazonIsCeiling = true;
    } else if (amazonPrice < ebayAvg * 0.85) {
      // Amazon undercuts eBay — buyers will go to Amazon, so it caps resale value
      amazonIsCeiling = true;
    } else {
      const amazonWeight = tier === 'new' ? 20 : 15;
      weightedSum += amazonPrice * amazonWeight;
      totalWeight += amazonWeight;
    }
  }

  // Mac.bid / Vista: liquidation auction comps — blend for like-new; ceiling for used
  // Weight 10 each (same tier as Mercari for like-new; lower weight since auction prices skew lower)
  if (macbidAvg) {
    sourcesUsed.push('Mac.bid');
    if (tier === 'used') {
      // auction liquidation price is a ceiling for used — won't sell for less than auction
    } else {
      weightedSum += macbidAvg * 10;
      totalWeight += 10;
    }
  }
  if (vistaAvg) {
    sourcesUsed.push('Vista');
    if (tier === 'used') {
      // same ceiling logic
    } else {
      weightedSum += vistaAvg * 10;
      totalWeight += 10;
    }
  }

  let weightedAvg = Math.round(weightedSum / totalWeight);

  // Apply ceilings — resale price can't exceed what buyers pay for new
  if (amazonIsCeiling && amazonPrice) {
    weightedAvg = Math.min(weightedAvg, Math.round(amazonPrice * 0.97));
  }
  if (stockxIsCeiling && stockxLastSale) {
    weightedAvg = Math.min(weightedAvg, Math.round(stockxLastSale * 0.97));
  }

  // --- Confidence ---
  const prices = [ebayAvg, mercariAvg, stockxLastSale, macbidAvg, vistaAvg].filter((p): p is number => p != null);
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
    macbidAvg,
    vistaAvg,
    confidence,
    estDaysToSell: ebay?.estDaysToSell ?? null,
    modelQuery,
    sourcesUsed,
  };
}
