import { EbayItem } from './ebay';

export interface DiscountQuality {
  quality: 'verified' | 'suspicious' | 'inflated' | 'unknown';
  reason: string | null;
}

// Round-number MSRPs that sellers commonly inflate to create fake discounts
const SUSPICIOUS_MARKET_PRICES = new Set([
  999.99, 899.99, 799.99, 699.99, 599.99, 499.99, 399.99,
  1199.99, 1299.99, 1499.99, 1999.99, 2499.99, 2999.99,
  1000, 1500, 2000, 500, 300, 200,
]);

// Categories where 85%+ discounts are essentially impossible (not a clearance category)
const HIGH_VALUE_CATEGORIES = /iphone|macbook|ipad|apple watch|airpods|ps5|xbox|nintendo|sneaker|jordan/i;

export function assessDiscountQuality(item: EbayItem, avgSoldPrice?: number): DiscountQuality {
  if (!item.discountPct || !item.marketPrice) {
    return { quality: 'unknown', reason: null };
  }

  const pct = item.discountPct;
  const market = item.marketPrice;
  const price = item.price;

  // If we have real sold comps, check if market price is wildly above what people pay
  if (avgSoldPrice && avgSoldPrice > 0) {
    const soldToMarketRatio = avgSoldPrice / market;
    if (soldToMarketRatio < 0.4) {
      return {
        quality: 'inflated',
        reason: `Items like this sell for ~$${Math.round(avgSoldPrice)} avg — the $${Math.round(market)} "market price" appears inflated`,
      };
    }
    if (soldToMarketRatio >= 0.7) {
      return { quality: 'verified', reason: `Sold comps confirm ~$${Math.round(avgSoldPrice)} real market value` };
    }
  }

  // Suspicious: extremely high discount on premium tech/electronics
  if (pct >= 85 && HIGH_VALUE_CATEGORIES.test(item.title)) {
    return {
      quality: 'suspicious',
      reason: `${pct}% off on ${item.category || 'this item'} is unusually high — verify the original price`,
    };
  }

  // Suspicious: market price is a classic "fake MSRP" round number
  if (SUSPICIOUS_MARKET_PRICES.has(market)) {
    if (pct >= 70) {
      return {
        quality: 'suspicious',
        reason: `Market price of $${market} is a common inflated MSRP — actual discount may be lower`,
      };
    }
  }

  // Suspicious: price-to-market ratio is extreme (market price 10x+ the sale price)
  if (market > price * 8 && pct >= 80) {
    return {
      quality: 'suspicious',
      reason: `Listed at ${pct}% off — verify the original $${Math.round(market)} price is legitimate`,
    };
  }

  // Looks reasonable
  return { quality: 'verified', reason: null };
}
