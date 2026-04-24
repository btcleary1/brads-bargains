'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Search, Zap, Loader2, Plus, ExternalLink, Tag, TrendingDown, TrendingUp, Package, AlertCircle, Mail, CheckCircle, Clock, FlaskConical, ThumbsUp, ThumbsDown, Minus, Flame, Sparkles } from 'lucide-react';
import { DIGEST_CATEGORIES } from '@/lib/digest-categories';

interface EbayItem {
  itemId: string;
  title: string;
  price: number;
  currency: string;
  marketPrice: number | null;
  discountPct: number | null;
  condition: string;
  imageUrl: string;
  additionalImages: string[];
  itemUrl: string;
  seller: string;
  sellerFeedbackScore: number | null;
  sellerFeedbackPercent: number | null;
  location: string;
  category: string;
  shippingCost: number | null;
  listingType: string;
  listingDate: string | null;
  quantity: number | null;
  isHotDeal: boolean;
  sellScore?: number;
}

interface SearchResult {
  query: string;
  total: number;
  hotDeals: number;
  minDiscount: number;
  items: EbayItem[];
}

interface CompsVerdict {
  verdict: 'buy' | 'skip' | 'maybe';
  avgSoldPrice: number;
  soldCount: number;
  netProfit: number;
  marginPct: number;
  reasoning: string;
  searchQuery: string;
  daysToSell?: number;
  capitalEfficiency?: number;
  platformRecommendation?: 'ebay' | 'facebook' | 'either';
  multiSourceConfidence?: 'high' | 'medium' | 'low';
  stockxLastSale?: number | null;
  mercariAvgSold?: number | null;
  amazonPrice?: number | null;
  discountQuality?: 'verified' | 'suspicious' | 'inflated' | 'unknown';
  discountQualityReason?: string | null;
}

interface WatcherVelocity {
  itemId: string;
  currentCount: number;
  delta24h: number | null;
  velocityLabel: 'hot' | 'rising' | 'steady' | 'cooling';
}

interface BrowseDeal {
  itemId: string;
  title: string;
  price: number;
  marketPrice: number | null;
  discountPct: number | null;
  condition: string;
  imageUrl: string;
  itemUrl: string;
  category: string;
  shippingCost: number | null;
  listingDate: string | null;
  seller: string;
  sellerFeedbackPercent: number | null;
  flipVerdict: 'buy' | 'maybe';
  avgSoldPrice: number;
  soldCount: number;
  flipNetProfit: number;
  flipMarginPct: number;
  watcherVelocity?: WatcherVelocity | null;
  discountQuality?: 'verified' | 'suspicious' | 'inflated' | 'unknown';
  discountQualityReason?: string | null;
  pickReason?: string | null;
}

interface TrendingItem {
  itemId: string;
  title: string;
  price: number;
  marketPrice: number | null;
  discountPct: number | null;
  condition: string;
  imageUrl: string;
  itemUrl: string;
  watchCount: number;
  listingDate: string | null;
  category: string;
  demandScore: number;
  trendSignal: string;
}

function SellBadge({ score }: { score: number }) {
  const label = score >= 70 ? 'High Confidence' : score >= 45 ? 'Med Confidence' : 'Lower Confidence';
  const color = score >= 70 ? '#4ADE80' : score >= 45 ? '#FCD34D' : '#F87171';
  const bg    = score >= 70 ? 'rgba(34,197,94,0.12)' : score >= 45 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)';
  const border= score >= 70 ? 'rgba(34,197,94,0.3)'  : score >= 45 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)';
  const tooltip = `Sell Confidence Score: ${score}/100\n\n🟢 High (70+): Single item, fast-moving category, deep discount, unique price\n🟡 Medium (45–69): Some competition or moderate discount\n🔴 Lower (<45): Multi-quantity, slow category, or modest discount`;
  return (
    <span
      className="text-xs font-semibold px-2 py-1 rounded-lg cursor-help"
      style={{ background: bg, border: `1px solid ${border}`, color }}
      title={tooltip}
    >
      {label}
    </span>
  );
}

function DealBadge({ pct }: { pct: number }) {
  const color = pct >= 80 ? '#F87171' : pct >= 70 ? '#FB923C' : '#60A5FA';
  return (
    <span className="text-xs px-1.5 py-0.5 rounded" style={{ color, opacity: 0.75 }}>
      {pct}% off
    </span>
  );
}

function itemModelYear(title: string): number | null {
  const yearMatch = title.match(/\b(20\d{2})\b/);
  if (yearMatch) return parseInt(yearMatch[1]);
  const iphone = title.match(/iPhone\s+(\d+)/i);
  if (iphone) { const n = parseInt(iphone[1]); return n >= 16 ? 2024 : n === 15 ? 2023 : n === 14 ? 2022 : n === 13 ? 2021 : n === 12 ? 2020 : n === 11 ? 2019 : 2017; }
  if (/iPhone SE/i.test(title)) { return /3rd|gen\s*3/i.test(title) ? 2022 : /2nd|gen\s*2/i.test(title) ? 2020 : 2016; }
  if (/iPad Pro\s+(?:9\.7|10\.5)/i.test(title)) return 2017;
  const ipad = title.match(/iPad(?:\s+(?:Pro|Air|Mini))?\s+(\d+)(?!\s*[."])/i);
  if (ipad) { const n = parseInt(ipad[1]); return n >= 10 ? 2022 : n === 9 ? 2021 : n === 8 ? 2020 : n === 7 ? 2019 : 2018; }
  if (/Apple Watch/i.test(title)) {
    if (/Watch Ultra/i.test(title)) return 2022;
    if (/SE.*2nd|2nd.*SE/i.test(title)) return 2022;
    if (/Watch SE/i.test(title)) return 2021;
    const w = title.match(/Apple Watch(?:\s+Series)?\s+(\d+)/i);
    if (w) { const n = parseInt(w[1]); return n >= 10 ? 2024 : n === 9 ? 2023 : n === 8 ? 2022 : n === 7 ? 2021 : n === 6 ? 2020 : n === 5 ? 2019 : 2018; }
  }
  if (/airpods/i.test(title)) {
    if (/AirPods.*4th/i.test(title)) return 2024;
    if (/AirPods Pro.*2nd|AirPods Pro 2\b/i.test(title)) return 2022;
    if (/AirPods.*3rd/i.test(title)) return 2021;
    return 2019;
  }
  if (/macbook/i.test(title)) {
    if (/\bM4\b/i.test(title)) return 2024;
    if (/\bM3\b/i.test(title)) return 2023;
    if (/\bM2\b/i.test(title)) return 2022;
    if (/\bM1\b/i.test(title)) return 2020;
  }
  return null;
}

function listingAge(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'Listed minutes ago';
  if (hours < 24) return `Listed ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Listed ${days}d ago`;
  return null; // older listings don't need a badge
}

function soldCompsUrl(title: string): string {
  const q = encodeURIComponent(title.split(' ').slice(0, 6).join(' '));
  return `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Complete=1&LH_Sold=1`;
}

function VerdictBadge({ verdict }: { verdict: 'buy' | 'skip' | 'maybe' }) {
  if (verdict === 'buy') return (
    <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ADE80' }}>
      <ThumbsUp className="w-3 h-3" /> BUY
    </span>
  );
  if (verdict === 'skip') return (
    <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171' }}>
      <ThumbsDown className="w-3 h-3" /> SKIP
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#FCD34D' }}>
      <Minus className="w-3 h-3" /> MAYBE
    </span>
  );
}

function MultiSourceBadge({ confidence, stockx, mercari, amazon }: { confidence?: string; stockx?: number | null; mercari?: number | null; amazon?: number | null }) {
  if (!confidence) return null;
  const parts = [stockx ? `StockX $${stockx}` : null, mercari ? `Mercari $${mercari}` : null, amazon ? `Amazon $${amazon}` : null].filter(Boolean);
  const sourcesText = parts.join(' · ');
  const sourceCount = parts.length + 1; // +1 for eBay
  if (confidence === 'high') return (
    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg cursor-help"
      style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34D399' }}
      title={sourcesText ? `Multi-source confirmed: ${sourcesText}` : 'Multiple sources agree on this price'}>
      ✦ {sourceCount}-Source Confirmed
    </span>
  );
  if (confidence === 'medium') return (
    <span className="text-xs px-2 py-1 rounded-lg cursor-help" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#FCD34D' }}
      title={sourcesText || 'eBay comps only'}>
      {sourcesText ? sourcesText : 'eBay comps only'}
    </span>
  );
  return null;
}

function WatcherBadge({ velocity }: { velocity?: WatcherVelocity | null }) {
  if (!velocity || velocity.velocityLabel === 'steady') return null;
  if (velocity.velocityLabel === 'hot') return (
    <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg animate-pulse"
      style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#F87171' }}
      title={velocity.delta24h ? `+${velocity.delta24h} watchers in last 24h` : 'Surging in demand'}>
      🔥 {velocity.delta24h ? `+${velocity.delta24h} watchers` : 'Hot'}
    </span>
  );
  if (velocity.velocityLabel === 'rising') return (
    <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg"
      style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', color: '#FB923C' }}
      title={velocity.delta24h ? `+${velocity.delta24h} watchers in last 24h` : 'Rising demand'}>
      ↑ {velocity.delta24h ? `+${velocity.delta24h}` : 'Rising'}
    </span>
  );
  return null;
}

function DiscountQualityBadge({ quality, reason }: { quality?: string; reason?: string | null }) {
  if (!quality || quality === 'unknown' || quality === 'verified') return null;
  if (quality === 'inflated') return (
    <span className="text-xs px-2 py-1 rounded-lg cursor-help"
      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}
      title={reason ?? 'Market price may be inflated'}>
      ⚠ Inflated MSRP
    </span>
  );
  if (quality === 'suspicious') return (
    <span className="text-xs px-2 py-1 rounded-lg cursor-help"
      style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#FCD34D' }}
      title={reason ?? 'Verify original price'}>
      ⚠ Verify discount
    </span>
  );
  return null;
}

function BrowseTrackButton({ deal }: { deal: BrowseDeal }) {
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);
  const track = async () => {
    setTracking(true);
    const res = await fetch('/api/tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ebayItemId: deal.itemId, title: deal.title, ebayPrice: deal.price, marketPrice: deal.marketPrice, discountPct: deal.discountPct, condition: deal.condition, imageUrl: deal.imageUrl, ebayUrl: deal.itemUrl, category: deal.category, shippingCost: deal.shippingCost }),
    });
    if (res.ok) setTracked(true);
    setTracking(false);
  };
  return (
    <button onClick={track} disabled={tracking || tracked} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-60"
      style={tracked ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80' } : { background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60A5FA' }}>
      {tracking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
      {tracked ? 'Tracked!' : 'Track Deal'}
    </button>
  );
}

function ItemCard({ item, onTrack, preFlip, preFlipLoading }: {
  item: EbayItem;
  onTrack: (item: EbayItem) => void;
  preFlip?: CompsVerdict | null;
  preFlipLoading?: boolean;
}) {
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);
  const [compsLoading, setCompsLoading] = useState(false);
  const [comps, setComps] = useState<CompsVerdict | null>(null);
  const [compsError, setCompsError] = useState('');

  // Use pre-computed flip if available — only if it's a valid verdict shape
  const rawPreFlip = preFlip?.verdict && preFlip?.avgSoldPrice != null ? preFlip : null;
  const activeComps = comps ?? rawPreFlip ?? null;
  const activeLoading = compsLoading || (!comps && !!preFlipLoading);

  const checkFlip = async () => {
    setCompsLoading(true);
    setCompsError('');
    setComps(null);
    try {
      const res = await fetch('/api/sold-comps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, price: item.price, shippingCost: item.shippingCost, marketPrice: item.marketPrice, discountPct: item.discountPct }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Agent failed');
      setComps(data);
    } catch (e: any) {
      setCompsError(e.message);
    } finally {
      setCompsLoading(false);
    }
  };

  const handleTrack = async () => {
    setTracking(true);
    const res = await fetch('/api/tracker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ebayItemId: item.itemId,
        title: item.title,
        ebayPrice: item.price,
        marketPrice: item.marketPrice,
        discountPct: item.discountPct,
        condition: item.condition,
        imageUrl: item.imageUrl,
        additionalImages: item.additionalImages,
        ebayUrl: item.itemUrl,
        category: item.category,
        shippingCost: item.shippingCost,
      }),
    });
    if (res.ok) { setTracked(true); onTrack(item); }
    setTracking(false);
  };

  const age = listingAge(item.listingDate);
  const isFresh = item.listingDate && (Date.now() - new Date(item.listingDate).getTime()) < 24 * 3_600_000;
  const year = itemModelYear(item.title);

  // Net profit after ~15% eBay fees
  const profit = item.marketPrice && item.marketPrice > 0
    ? Math.round((item.marketPrice * 0.85 - item.price - (item.shippingCost ?? 0)) * 100) / 100
    : null;

  return (
    <div className="rounded-2xl overflow-hidden transition-all" style={{ background: 'rgba(255,255,255,0.04)', border: item.isHotDeal ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex">
        {item.isHotDeal && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171' }}>
            <Zap className="w-3 h-3" /> Hot Deal
          </div>
        )}
        {isFresh && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ADE80' }}>
            <Clock className="w-3 h-3" /> Fresh
          </div>
        )}
      </div>
      <div className="flex gap-3 p-4">
        {item.imageUrl && (
          <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white text-sm leading-snug line-clamp-2 mb-2">{item.title}</p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-lg font-bold" style={{ color: '#34D399' }}>${item.price.toFixed(2)}</span>
            {item.marketPrice && (
              <span className="text-sm line-through" style={{ color: '#4B5563' }}>${item.marketPrice.toFixed(2)}</span>
            )}
            {profit !== null && profit > 0 && (
              <span className="text-sm font-bold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ADE80' }}>
                +${profit.toFixed(0)} profit
              </span>
            )}
            {item.discountPct !== null && <DealBadge pct={item.discountPct} />}
            {item.sellScore !== undefined && <SellBadge score={item.sellScore} />}
          </div>
          <div className="flex flex-wrap gap-3 text-xs mb-2" style={{ color: '#6B7280' }}>
            <span className="flex items-center gap-1"><Package className="w-3 h-3" />{item.condition}{year ? ` · ${year}` : ''}</span>
            <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{item.category || 'Other'}</span>
            {age && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{age}</span>}
          </div>
          {item.sellerFeedbackPercent !== null && (
            <div className="text-xs mb-3" style={{ color: item.sellerFeedbackPercent >= 99 ? '#4ADE80' : item.sellerFeedbackPercent >= 98 ? '#FCD34D' : '#F87171' }}>
              Seller: {item.seller} &middot; {item.sellerFeedbackPercent}% ({item.sellerFeedbackScore?.toLocaleString()} ratings)
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={item.itemUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.12)', color: '#9CA3AF' }}
            >
              <ExternalLink className="w-3 h-3" /> View
            </a>
            <a
              href={soldCompsUrl(item.title)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ border: '1px solid rgba(251,191,36,0.3)', color: '#FCD34D' }}
            >
              <TrendingDown className="w-3 h-3" /> Sold
            </a>
            <button
              onClick={handleTrack}
              disabled={tracking || tracked}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-60"
              style={tracked
                ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80' }
                : { background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#60A5FA' }}
            >
              {tracking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {tracked ? 'Tracked!' : 'Track Deal'}
            </button>
            <button
              onClick={checkFlip}
              disabled={activeLoading}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-60"
              style={activeComps
                ? activeComps.verdict === 'buy'
                  ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80' }
                  : activeComps.verdict === 'skip'
                  ? { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }
                  : { background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#FCD34D' }
                : { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#C4B5FD' }
              }
            >
              {activeLoading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : activeComps
                ? <FlaskConical className="w-3 h-3" />
                : <FlaskConical className="w-3 h-3" />
              }
              {activeLoading
                ? (preFlipLoading && !compsLoading ? 'Grading…' : 'Checking…')
                : activeComps
                ? (activeComps.verdict === 'buy' ? 'BUY' : activeComps.verdict === 'skip' ? 'SKIP' : 'MAYBE')
                : 'Check Flip'
              }
            </button>
          </div>

          {/* Comps verdict */}
          {compsLoading && (
            <div className="mt-3 rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#A78BFA' }}>
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
              Agent searching sold listings on eBay…
            </div>
          )}
          {compsError && (
            <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>
              {compsError}
            </div>
          )}
          {activeComps && activeComps.verdict && activeComps.avgSoldPrice != null && !compsLoading && (
            <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <VerdictBadge verdict={activeComps.verdict} />
                {preFlip && !comps && <span className="text-xs" style={{ color: '#6B7280' }}>Auto-graded</span>}
                <MultiSourceBadge confidence={activeComps.multiSourceConfidence} stockx={activeComps.stockxLastSale} mercari={activeComps.mercariAvgSold} amazon={activeComps.amazonPrice} />
                <span className="text-xs font-medium" style={{ color: '#D1D5DB' }}>
                  Avg sold: <strong style={{ color: '#34D399' }}>${(activeComps.avgSoldPrice ?? 0).toFixed(2)}</strong>
                  {' '}({activeComps.soldCount ?? 0} sales)
                </span>
                {(activeComps.netProfit ?? 0) > 0 && (
                  <span className="text-xs font-semibold ml-auto" style={{ color: (activeComps.netProfit ?? 0) >= 30 ? '#4ADE80' : '#FCD34D' }}>
                    ~${(activeComps.netProfit ?? 0).toFixed(0)} profit
                  </span>
                )}
              </div>
              {activeComps.discountQualityReason && (
                <DiscountQualityBadge quality={activeComps.discountQuality} reason={activeComps.discountQualityReason} />
              )}
              {activeComps.reasoning && <p className="text-xs leading-relaxed mb-2 mt-2" style={{ color: '#9CA3AF' }}>{activeComps.reasoning}</p>}
              <div className="flex flex-wrap gap-3 text-xs" style={{ color: '#6B7280' }}>
                {activeComps.daysToSell != null && activeComps.daysToSell >= 1 && (
                  <span>~{activeComps.daysToSell}d to sell</span>
                )}
                {activeComps.capitalEfficiency != null && activeComps.daysToSell != null && activeComps.daysToSell >= 7 && activeComps.capitalEfficiency <= 2000 && (
                  <span style={{ color: activeComps.capitalEfficiency >= 200 ? '#4ADE80' : activeComps.capitalEfficiency >= 100 ? '#FCD34D' : '#9CA3AF' }}>
                    {activeComps.capitalEfficiency.toFixed(0)}% ann. ROI
                  </span>
                )}
                {activeComps.platformRecommendation && (
                  <span style={{ color: '#A78BFA' }}>
                    Sell on: {activeComps.platformRecommendation === 'either' ? 'eBay or FB' : activeComps.platformRecommendation === 'facebook' ? 'Facebook' : 'eBay'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DealsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [filterPct, setFilterPct] = useState<number | ''>('');
  const [filterSingleQty, setFilterSingleQty] = useState(false);
  const [priceMin, setPriceMin] = useState<number | ''>('');
  const [priceMax, setPriceMax] = useState<number | ''>('');
  const [filterMinProfit, setFilterMinProfit] = useState<number | ''>('');
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [pickedItemId, setPickedItemId] = useState<string | null>(null);
  const [pickedFlip, setPickedFlip] = useState<CompsVerdict | null>(null);
  const [pickedFlipLoading, setPickedFlipLoading] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [trendingSummary, setTrendingSummary] = useState('');
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState('');
  const [trendingTracked, setTrendingTracked] = useState<Set<string>>(new Set());
  const [browseItems, setBrowseItems] = useState<BrowseDeal[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseGeneratedAt, setBrowseGeneratedAt] = useState<string | null>(null);
  const [bulkFlips, setBulkFlips] = useState<Record<string, CompsVerdict>>({});
  const [bulkPending, setBulkPending] = useState<Set<string>>(new Set());
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingCats, setOnboardingCats] = useState<string[]>([]);
  const [onboardingSaving, setOnboardingSaving] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => { if (r.status === 401) router.replace('/login'); }).catch(() => { /* network error — don't log out */ });

    // Check if user has set category preferences; also load default price range
    fetch('/api/prefs').then(r => r.ok ? r.json() : {}).then((p: any) => {
      if (p.defaultPriceMin != null) setPriceMin(p.defaultPriceMin);
      if (p.defaultPriceMax != null) setPriceMax(p.defaultPriceMax);
      if (p.defaultMinProfit != null) setFilterMinProfit(p.defaultMinProfit);
      if (p.defaultMinDiscount != null) setFilterPct(p.defaultMinDiscount);
      if (p.defaultSingleQtyOnly) setFilterSingleQty(true);
      const dismissed = typeof window !== 'undefined' && localStorage.getItem('onboarding-dismissed');
      if (!dismissed && (!p.digestCategories || p.digestCategories.length === 0)) {
        setShowOnboarding(true);
      }
    }).catch(() => {
      const dismissed = typeof window !== 'undefined' && localStorage.getItem('onboarding-dismissed');
      if (!dismissed) setShowOnboarding(true);
    });

    // Load trending and browse feed on mount in parallel
    setTrendingLoading(true);
    fetch('/api/trending')
      .then(r => r.json())
      .then(d => { setTrending(d.items ?? []); setTrendingSummary(d.summary ?? ''); })
      .catch(() => setTrendingError('Could not load trending'))
      .finally(() => setTrendingLoading(false));

    setBrowseLoading(true);
    fetch('/api/browse')
      .then(r => r.json())
      .then(d => { setBrowseItems(d.items ?? []); setBrowseGeneratedAt(d.generatedAt ?? null); })
      .catch(() => {})
      .finally(() => setBrowseLoading(false));
  }, [router]);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResults(null);
    setShowAll(false);
    setEmailState('idle');
    setRecommendation(null);
    setPickedItemId(null);
    setPickedFlip(null);
    setBulkFlips({});
    setBulkPending(new Set());
    try {
      const res = await fetch(`/api/deals?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed.');
      setResults(data);
      // Fetch AI recommendation in background — sort items the same way the display will
      if (data.items?.length > 0) {
        setRecLoading(true);
        const allItems: EbayItem[] = data.items;
        const totalItems = allItems.length;
        const sortedForAI = allItems
          .map((item: EbayItem, idx: number) => {
            const ebayRank = Math.round((1 - idx / Math.max(totalItems - 1, 1)) * 100);
            const sell = computeSellScore(item, allItems);
            return { item, blendScore: Math.round(ebayRank * 0.5 + sell * 0.5) };
          })
          .sort((a, b) => b.blendScore - a.blendScore)
          .slice(0, 10)
          .map(x => x.item);
        // Bulk grade top 8 items progressively — stagger 400ms apart to avoid rate limits
        const top8 = sortedForAI.slice(0, 8);
        setBulkPending(new Set(top8.map(i => i.itemId)));
        top8.forEach((item, idx) => {
          setTimeout(() => {
            fetch('/api/sold-comps', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: item.title, price: item.price, shippingCost: item.shippingCost, marketPrice: item.marketPrice, discountPct: item.discountPct }),
            }).then(r => r.json()).then(flip => {
              // Only store if it's a valid verdict — discard error responses
              if (flip?.verdict && flip?.avgSoldPrice != null && flip?.netProfit != null) {
                setBulkFlips(prev => ({ ...prev, [item.itemId]: flip }));
              }
            }).catch(() => {}).finally(() => {
              setBulkPending(prev => { const next = new Set(prev); next.delete(item.itemId); return next; });
            });
          }, idx * 400);
        });

        fetch('/api/deal-rec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: sortedForAI }),
        }).then(r => r.json()).then(d => {
          const recText: string | null = d.recommendation ?? null;
          const pid: string | null = d.pickedItemId ?? null;
          // Keep recLoading true while flip verification runs — single uninterrupted load
          const tryFlip = (candidates: EbayItem[], idx: number, originalRec: string | null) => {
            if (idx >= candidates.length) {
              // Exhausted — show original pick without flip badge
              setRecommendation(originalRec);
              setPickedItemId(pid);
              setPickedFlipLoading(false);
              return;
            }
            const item = candidates[idx];
            fetch('/api/sold-comps', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: item.title, price: item.price, shippingCost: item.shippingCost, marketPrice: item.marketPrice, discountPct: item.discountPct }),
            }).then(r => r.json()).then((flip: CompsVerdict) => {
              if (flip.verdict === 'skip' && idx < candidates.length - 1) {
                tryFlip(candidates, idx + 1, originalRec);
              } else if (flip.verdict === 'skip') {
                // All candidates exhausted with Skip — show no flip badge, neutral text
                setPickedItemId(null);
                setPickedFlip(null);
                setRecommendation('No strong flip found in current results — comps suggest low resale margin on top items.');
                setPickedFlipLoading(false);
                setRecLoading(false);
              } else {
                setPickedItemId(item.itemId);
                setPickedFlip(flip);
                if (item.itemId !== pid) {
                  const net = flip.netProfit > 0 ? ` ~$${flip.netProfit.toFixed(0)} net profit.` : '';
                  setRecommendation(`${item.title.split(' ').slice(0, 8).join(' ')} — avg sold $${flip.avgSoldPrice.toFixed(0)} across ${flip.soldCount} sales.${net}`);
                } else {
                  setRecommendation(originalRec);
                }
                setPickedFlipLoading(false);
                setRecLoading(false);
              }
            }).catch(() => {
              setRecommendation(originalRec);
              setPickedItemId(pid);
              setPickedFlipLoading(false);
              setRecLoading(false);
            });
          };

          setPickedFlipLoading(true);
          const startIdx = pid ? Math.max(0, sortedForAI.findIndex(i => i.itemId === pid || pid.includes(i.itemId) || i.itemId.includes(pid))) : 0;
          tryFlip(sortedForAI.slice(startIdx), 0, recText);

        }).catch(() => { setPickedFlipLoading(false); setRecLoading(false); });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const sendEmail = async () => {
    if (!query.trim() || emailState !== 'idle') return;
    setEmailState('sending');
    setError('');
    try {
      const res = await fetch(`/api/deals?q=${encodeURIComponent(query)}&notify=1`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send email.');
        setEmailState('idle');
      } else {
        setEmailState('sent');
        setTimeout(() => setEmailState('idle'), 3000);
      }
    } catch {
      setError('Failed to send email. Check your alert email is saved in Settings.');
      setEmailState('idle');
    }
  };

  const saveOnboarding = async () => {
    if (onboardingCats.length === 0) return;
    setOnboardingSaving(true);
    try {
      await fetch('/api/prefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digestCategories: onboardingCats }),
      });
    } catch { /* silent */ }
    localStorage.setItem('onboarding-dismissed', '1');
    setShowOnboarding(false);
    setOnboardingSaving(false);
    // Refresh browse feed to apply personalization
    setBrowseLoading(true);
    fetch('/api/browse').then(r => r.json()).then(d => { setBrowseItems(d.items ?? []); setBrowseGeneratedAt(d.generatedAt ?? null); }).catch(() => {}).finally(() => setBrowseLoading(false));
  };

  const dismissOnboarding = () => {
    localStorage.setItem('onboarding-dismissed', '1');
    setShowOnboarding(false);
  };

  const activeFilter = filterPct !== '' ? filterPct : null;

  const displayItems = results
    ? (() => {
        let pool = showAll ? results.items : results.items.filter(i => i.isHotDeal).length > 0 ? results.items.filter(i => i.isHotDeal) : results.items.slice(0, 20);
        if (activeFilter !== null) pool = pool.filter(i => i.discountPct !== null && i.discountPct >= activeFilter);
        if (filterSingleQty) pool = pool.filter(i => i.quantity === null || i.quantity <= 1);
        if (priceMin !== '') pool = pool.filter(i => i.price >= (priceMin as number));
        if (priceMax !== '') pool = pool.filter(i => i.price <= (priceMax as number));
        if (filterMinProfit !== '') {
          const minP = filterMinProfit as number;
          pool = pool.filter(i => {
            if (!i.marketPrice) return false;
            const net = Math.round(i.marketPrice * 0.85 - i.price - (i.shippingCost ?? 0));
            return net >= minP;
          });
        }
        // Sort by net profit descending
        return pool
          .map(i => {
            const net = i.marketPrice ? Math.round(i.marketPrice * 0.85 - i.price - (i.shippingCost ?? 0)) : -9999;
            return { ...i, netProfit: net };
          })
          .sort((a, b) => (b as any).netProfit - (a as any).netProfit);
      })()
    : [];

  function computeSellScore(item: EbayItem, allItems: EbayItem[]): number {
    const qty = item.quantity ?? 1;
    const quantityScore = qty <= 1 ? 30 : qty <= 3 ? 20 : qty <= 10 ? 10 : 0;
    const pct = item.discountPct ?? 0;
    const discountScore = pct >= 80 ? 25 : pct >= 70 ? 20 : pct >= 60 ? 14 : pct >= 50 ? 8 : 3;
    const liquidityMap: Record<string, number> = { phone: 100, laptop: 95, gaming: 90, tablet: 85, audio: 80, watch: 80, camera: 70, cards: 75, lego: 65, comic: 50, vintage: 40 };
    const text = `${item.title} ${item.category}`.toLowerCase();
    let liq = 55;
    if (/iphone|samsung.*phone|pixel/.test(text)) liq = 100;
    else if (/macbook|laptop/.test(text)) liq = 95;
    else if (/playstation|ps5|xbox/.test(text)) liq = 90;
    else if (/ipad|tablet/.test(text)) liq = 85;
    else if (/airpods|headphone/.test(text)) liq = 80;
    else if (/nintendo|switch/.test(text)) liq = 80;
    else if (/apple watch|smartwatch/.test(text)) liq = 80;
    else if (/drone|camera/.test(text)) liq = 70;
    else if (/pokemon|sports card/.test(text)) liq = 75;
    else if (/lego/.test(text)) liq = 65;
    const demandScore = Math.round((liq / 100) * 25);
    const similar = allItems.filter(i => i.itemId !== item.itemId && i.title.toLowerCase().split(' ').slice(0, 3).join(' ') === item.title.toLowerCase().split(' ').slice(0, 3).join(' '));
    const cheaperCount = similar.filter(i => i.price <= item.price).length;
    const uniquenessScore = similar.length === 0 ? 20 : cheaperCount === 0 ? 20 : cheaperCount <= 1 ? 12 : 4;
    // Tech age penalty — checks explicit year OR Apple model number
    const techPatterns = /iphone|ipad|macbook|laptop|samsung|pixel|airpods|apple watch|playstation|xbox|nintendo/i;
    let agePenalty = 0;
    if (techPatterns.test(item.title)) {
      const yearMatch = item.title.match(/\b(20\d{2})\b/);
      let releaseYear: number | null = yearMatch ? parseInt(yearMatch[1]) : null;
      if (!releaseYear) {
        const iphone = item.title.match(/iPhone\s+(\d+)/i);
        if (iphone) { const n = parseInt(iphone[1]); releaseYear = n >= 16 ? 2024 : n === 15 ? 2023 : n === 14 ? 2022 : n === 13 ? 2021 : n === 12 ? 2020 : n === 11 ? 2019 : 2017; }
        const ipad = !releaseYear && item.title.match(/iPad\s+(?:Pro|Air|Mini)?\s*(\d+)/i);
        if (ipad) { const n = parseInt(ipad[1]); releaseYear = n >= 10 ? 2022 : n === 9 ? 2021 : n === 8 ? 2020 : n === 7 ? 2019 : 2018; }
      }
      if (releaseYear) {
        const age = 2026 - releaseYear;
        agePenalty = age <= 2 ? 0 : age <= 3 ? 10 : age <= 4 ? 20 : age <= 5 ? 30 : age <= 7 ? 45 : 60;
      }
    }
    return Math.max(0, quantityScore + demandScore + discountScore + uniquenessScore - agePenalty);
  }

  const hotCount = results?.items.filter(i => i.isHotDeal).length ?? 0;
  const minDiscount = results?.minDiscount ?? 60;

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 sm:pb-10">

        {/* Hero search */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-2xl shrink-0" style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 2px 12px rgba(99,102,241,0.4)' }}>
              <Search className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">Find Deals</h1>
              <p className="text-xs" style={{ color: '#6B7280' }}>eBay discounted items</p>
            </div>
          </div>

          <form onSubmit={search} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search eBay... e.g. iPhone 13, PlayStation 5, Air Jordan"
              className="flex-1 px-4 py-3 rounded-xl text-sm text-white placeholder-gray-600 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-5 py-3 rounded-xl font-semibold text-sm text-white flex items-center gap-2 transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 2px 12px rgba(99,102,241,0.35)' }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span className="hidden sm:inline">Search</span>
            </button>
          </form>

        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl p-4 mb-5 flex gap-2 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center py-16 gap-3" style={{ color: '#6B7280' }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#3B82F6' }} />
            <p className="text-sm">Scanning eBay for deals…</p>
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div>
            {/* Stats row */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="rounded-xl px-4 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-xs" style={{ color: '#6B7280' }}>Results</div>
                <div className="font-bold text-white">{results.total}</div>
              </div>
              <div className="rounded-xl px-4 py-2.5" style={{ background: hotCount > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)', border: hotCount > 0 ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-xs" style={{ color: '#6B7280' }}>Hot deals</div>
                <div className="font-bold" style={{ color: hotCount > 0 ? '#F87171' : 'white' }}>{hotCount}</div>
              </div>
              {hotCount === 0 && (
                <div className="flex items-center text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#FCD34D' }}>
                  No hot deals found — try a different search or check back later
                </div>
              )}
            </div>

            {/* Email button */}
            <button
              onClick={sendEmail}
              disabled={emailState !== 'idle'}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold mb-4 transition-all disabled:opacity-70"
              style={emailState === 'sent'
                ? { background: 'linear-gradient(135deg,#16A34A,#15803D)', color: '#FFFFFF', boxShadow: '0 2px 12px rgba(22,163,74,0.4)' }
                : { background: 'linear-gradient(135deg,#0EA5E9,#2563EB)', color: '#FFFFFF', boxShadow: '0 2px 12px rgba(14,165,233,0.4)' }}
            >
              {emailState === 'sending' && <Loader2 className="w-4 h-4 animate-spin" />}
              {emailState === 'sent' && <CheckCircle className="w-4 h-4" />}
              {emailState === 'idle' && <Mail className="w-4 h-4" />}
              {emailState === 'sending' ? 'Sending…' : emailState === 'sent' ? 'Sent to your email!' : 'Email me the Top 5 Item Deals'}
            </button>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs shrink-0" style={{ color: '#6B7280' }}>Min % off:</span>
              <input
                type="number"
                min={0}
                max={100}
                value={filterPct}
                onChange={e => setFilterPct(e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value))))}
                placeholder={`${minDiscount}`}
                className="w-20 px-3 py-1.5 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              {filterPct !== '' && (
                <button onClick={() => setFilterPct('')} className="text-xs px-2 py-1 rounded-lg" style={{ color: '#6B7280', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Clear
                </button>
              )}
              <span className="text-xs shrink-0" style={{ color: '#6B7280' }}>Price:</span>
              <input
                type="number"
                min={0}
                value={priceMin}
                onChange={e => setPriceMin(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                placeholder="$ min"
                className="w-20 px-3 py-1.5 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <span className="text-xs" style={{ color: '#6B7280' }}>–</span>
              <input
                type="number"
                min={0}
                value={priceMax}
                onChange={e => setPriceMax(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                placeholder="$ max"
                className="w-20 px-3 py-1.5 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              <button
                onClick={() => setFilterSingleQty(v => !v)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                style={{
                  background: filterSingleQty ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                  border: filterSingleQty ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.08)',
                  color: filterSingleQty ? '#4ADE80' : '#6B7280',
                }}
              >
                {filterSingleQty ? '✓ ' : ''}Single qty only
              </button>
            </div>

            {/* Second filter row: min profit */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-xs shrink-0" style={{ color: '#6B7280' }}>Min profit $:</span>
              <input
                type="number"
                min={0}
                value={filterMinProfit}
                onChange={e => setFilterMinProfit(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                placeholder="any"
                className="w-20 px-3 py-1.5 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              {filterMinProfit !== '' && (
                <button onClick={() => setFilterMinProfit('')} className="text-xs px-2 py-1 rounded-lg" style={{ color: '#6B7280', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Clear
                </button>
              )}
            </div>

            {/* AI Recommendation */}
            {(recLoading || recommendation) && (
              <div className="rounded-xl p-4 mb-4 flex gap-3 items-start" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)' }}>🤖</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-xs font-semibold" style={{ color: '#818CF8' }}>AI Pick of the Day</div>
                    {pickedItemId && (
                      <button
                        onClick={() => {
                          setShowAll(true);
                          const findAndScroll = (attemptsLeft: number) => {
                            let el: HTMLElement | null = document.getElementById(`item-${pickedItemId}`);
                            if (!el) {
                              const candidates = document.querySelectorAll<HTMLElement>('[id^="item-"]');
                              for (const c of Array.from(candidates)) {
                                const cid = c.id.replace('item-', '');
                                if (cid.includes(pickedItemId!) || pickedItemId!.includes(cid)) { el = c; break; }
                              }
                            }
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.style.outline = '2px solid #818CF8';
                              el.style.borderRadius = '16px';
                              setTimeout(() => { if (el) { el.style.outline = ''; el.style.borderRadius = ''; } }, 2000);
                            } else if (attemptsLeft > 0) {
                              setTimeout(() => findAndScroll(attemptsLeft - 1), 150);
                            }
                          };
                          setTimeout(() => findAndScroll(10), 50);
                        }}
                        className="text-xs font-medium flex items-center gap-1 px-2 py-0.5 rounded-lg transition-colors"
                        style={{ background: 'rgba(99,102,241,0.2)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.35)' }}
                      >
                        Jump to item ↓
                      </button>
                    )}
                  </div>
                  {recLoading
                    ? <div className="flex items-center gap-2 text-xs" style={{ color: '#6B7280' }}><Loader2 className="w-3 h-3 animate-spin" /> Analyzing deals…</div>
                    : <p className="text-sm leading-relaxed mb-2" style={{ color: '#E2E8F0' }}>{recommendation}</p>
                  }
                  {!recLoading && pickedFlip && (
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <VerdictBadge verdict={pickedFlip.verdict} />
                      <span className="text-xs" style={{ color: '#9CA3AF' }}>
                        Avg sold ${pickedFlip.avgSoldPrice.toFixed(0)} · {pickedFlip.soldCount} sales
                        {pickedFlip.netProfit > 0 && <> · <span style={{ color: '#4ADE80' }}>~${pickedFlip.netProfit.toFixed(0)} profit</span></>}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Items */}
            {displayItems.length > 0 && (
              <div className="space-y-3 mb-5">
                {displayItems.map(item => (
                  <div key={item.itemId} id={`item-${item.itemId}`} className="rounded-2xl transition-all" style={{ scrollMarginTop: '80px' }}>
                    <ItemCard
                      item={item}
                      onTrack={() => {}}
                      preFlip={bulkFlips[item.itemId] ?? null}
                      preFlipLoading={bulkPending.has(item.itemId)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Toggle */}
            {!showAll && hotCount > 0 && results.items.length > hotCount && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF' }}
              >
                Show all {results.total} results
              </button>
            )}
            {showAll && hotCount > 0 && (
              <button
                onClick={() => setShowAll(false)}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#9CA3AF' }}
              >
                Show hot deals only
              </button>
            )}
          </div>
        )}

        {/* Onboarding — shown once for users with no category preferences */}
        {showOnboarding && !results && !loading && (
          <div className="rounded-2xl p-5 mb-5" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" style={{ color: '#818CF8' }} />
                <h3 className="font-bold text-white text-[15px]">What do you flip?</h3>
              </div>
              <button onClick={dismissOnboarding} className="text-xs px-2 py-1 rounded-lg transition-colors" style={{ color: '#6B7280' }}>Skip</button>
            </div>
            <p className="text-xs mb-4" style={{ color: '#6B7280' }}>Pick your categories so Today&apos;s Picks and your daily email stay in your wheelhouse.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {DIGEST_CATEGORIES.map(cat => {
                const active = onboardingCats.includes(cat.key);
                return (
                  <button
                    key={cat.key}
                    onClick={() => setOnboardingCats(prev => prev.includes(cat.key) ? prev.filter(k => k !== cat.key) : [...prev, cat.key])}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                    style={{
                      background: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                      border: active ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.08)',
                      color: active ? '#A5B4FC' : '#6B7280',
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={saveOnboarding}
              disabled={onboardingCats.length === 0 || onboardingSaving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', boxShadow: '0 2px 10px rgba(99,102,241,0.35)' }}
            >
              {onboardingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {onboardingCats.length > 0 ? `Save ${onboardingCats.length} categor${onboardingCats.length === 1 ? 'y' : 'ies'}` : 'Select categories above'}
            </button>
          </div>
        )}

        {/* Browse Feed — Today's Picks (shown when no search active) */}
        {!results && !loading && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0" style={{ background: 'linear-gradient(135deg,#10B981,#059669)', boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}>
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white leading-tight">Today&apos;s Picks</h2>
                  <p className="text-xs" style={{ color: '#6B7280' }}>
                    Pre-verified flips — BUY verdict confirmed with real sold data
                    {browseGeneratedAt && (
                      <> · updated {Math.round((Date.now() - new Date(browseGeneratedAt).getTime()) / 60000)}m ago</>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setBrowseLoading(true);
                  fetch('/api/browse?refresh=1').then(r => r.json()).then(d => { setBrowseItems(d.items ?? []); setBrowseGeneratedAt(d.generatedAt ?? null); }).catch(() => {}).finally(() => setBrowseLoading(false));
                }}
                disabled={browseLoading}
                className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all disabled:opacity-50"
                style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#6B7280' }}
              >
                {browseLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : '↻'} Refresh
              </button>
            </div>

            {browseLoading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', height: '100px' }} />
                ))}
                <p className="text-xs text-center pt-2" style={{ color: '#4B5563' }}>Scanning eBay + verifying flip margins across {14} categories…</p>
              </div>
            )}

            {!browseLoading && browseItems.length > 0 && (
              <div className="space-y-3">
                {browseItems.map(deal => (
                  <div key={deal.itemId} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: deal.flipVerdict === 'buy' ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(251,191,36,0.2)' }}>
                    <div className="flex gap-3 p-4">
                      {deal.imageUrl && (
                        <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={deal.imageUrl} alt={deal.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white text-sm leading-snug line-clamp-2 mb-1">{deal.title}</p>
                        {deal.pickReason && (
                          <p className="text-xs mb-2" style={{ color: '#60A5FA' }}>{deal.pickReason}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <VerdictBadge verdict={deal.flipVerdict} />
                          <WatcherBadge velocity={deal.watcherVelocity} />
                          <span className="text-lg font-bold" style={{ color: '#34D399' }}>${deal.price.toFixed(2)}</span>
                          {deal.marketPrice && <span className="text-sm line-through" style={{ color: '#4B5563' }}>${deal.marketPrice.toFixed(0)}</span>}
                          {deal.discountPct != null && <DealBadge pct={deal.discountPct} />}
                          {deal.flipNetProfit > 0 && (
                            <span className="text-sm font-bold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ADE80' }}>
                              +${deal.flipNetProfit} profit
                            </span>
                          )}
                          {deal.discountPct != null && <DealBadge pct={deal.discountPct} />}
                          <DiscountQualityBadge quality={deal.discountQuality} reason={deal.discountQualityReason} />
                        </div>
                        {/* Check Flip inline result */}
                        <div className="rounded-xl px-3 py-2 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ background: deal.flipVerdict === 'buy' ? 'rgba(34,197,94,0.08)' : 'rgba(251,191,36,0.08)', border: deal.flipVerdict === 'buy' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(251,191,36,0.2)' }}>
                          <span className="text-xs font-bold" style={{ color: deal.flipVerdict === 'buy' ? '#4ADE80' : '#FCD34D' }}>{deal.flipVerdict === 'buy' ? '✓ BUY' : '~ MAYBE'}</span>
                          <span className="text-xs" style={{ color: '#9CA3AF' }}>Avg sold <strong style={{ color: '#E5E7EB' }}>${deal.avgSoldPrice.toFixed(0)}</strong> ({deal.soldCount} comps)</span>
                          {deal.flipNetProfit > 0 && <span className="text-xs font-semibold" style={{ color: '#4ADE80' }}>~${deal.flipNetProfit} net</span>}
                          <span className="text-xs" style={{ color: '#6B7280' }}>{deal.flipMarginPct}% margin</span>
                        </div>
                        <div className="text-xs mb-2" style={{ color: '#6B7280' }}>{deal.condition}</div>
                        <div className="flex gap-2 flex-wrap">
                          <a href={deal.itemUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
                            style={{ border: '1px solid rgba(255,255,255,0.12)', color: '#9CA3AF' }}>
                            <ExternalLink className="w-3 h-3" /> View on eBay
                          </a>
                          <BrowseTrackButton deal={deal} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!browseLoading && browseItems.length === 0 && (
              <div className="text-center py-10" style={{ color: '#4B5563' }}>
                <div className="text-sm">No pre-verified flips found right now — check back in a few hours or search manually.</div>
              </div>
            )}
          </div>
        )}

        {/* Trending Now */}
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0" style={{ background: 'linear-gradient(135deg,#F97316,#EF4444)', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}>
              <Flame className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">Trending Now</h2>
              <p className="text-xs" style={{ color: '#6B7280' }}>Items surging in demand — not available anywhere else</p>
            </div>
          </div>

          {trendingLoading && (
            <div className="flex items-center gap-2 py-4 text-sm" style={{ color: '#6B7280' }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Scanning eBay for demand signals…
            </div>
          )}

          {trendingSummary && !trendingLoading && (
            <div className="rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2 text-xs" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', color: '#FED7AA' }}>
              <TrendingUp className="w-3.5 h-3.5 shrink-0 text-orange-400" />
              {trendingSummary}
            </div>
          )}

          {trending.length > 0 && !trendingLoading && (
            <div className="space-y-2">
              {trending.slice(0, 8).map((item, idx) => {
                const net = item.marketPrice ? Math.round(item.marketPrice * 0.85 - item.price) : null;
                const tracked = trendingTracked.has(item.itemId || item.title);
                const trackItem = async () => {
                  const key = item.itemId || item.title;
                  try {
                    await fetch('/api/tracker', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ebayItemId: item.itemId || `trend-${Date.now()}`,
                        title: item.title, ebayPrice: item.price, marketPrice: item.marketPrice,
                        discountPct: item.discountPct, condition: item.condition, imageUrl: item.imageUrl,
                        ebayUrl: item.itemUrl, category: item.category, shippingCost: null,
                        status: 'watching',
                      }),
                    });
                    setTrendingTracked(prev => new Set([...Array.from(prev), key]));
                  } catch { /* silent */ }
                };
                return (
                  <div key={idx} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-start gap-3">
                      {item.imageUrl && (
                        <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white leading-snug line-clamp-1 mb-0.5">{item.title}</p>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="text-sm font-bold" style={{ color: '#34D399' }}>${item.price.toFixed(2)}</span>
                          {net !== null && net > 0 && (
                            <span className="text-sm font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80' }}>+${net} profit</span>
                          )}
                          {item.discountPct != null && item.discountPct >= 10 && (
                            <span className="text-xs" style={{ color: '#60A5FA', opacity: 0.75 }}>{item.discountPct}% off</span>
                          )}
                          <span className="text-xs font-bold" style={{ color: item.demandScore >= 70 ? '#F87171' : item.demandScore >= 40 ? '#FCD34D' : '#9CA3AF' }}>
                            {item.demandScore >= 70 ? '🔥 Hot' : item.demandScore >= 40 ? '📈 Rising' : '👀 Watch'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={trackItem}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                            style={tracked
                              ? { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80' }
                              : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#9CA3AF' }}
                          >
                            {tracked ? '✓ Tracked' : '+ Track Deal'}
                          </button>
                          <a href={item.itemUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs px-3 py-1.5 rounded-lg"
                            style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#6B7280' }}>
                            View on eBay
                          </a>
                        </div>
                      </div>
                      {item.watchCount > 0 && (
                        <div className="shrink-0 text-xs text-right" style={{ color: '#6B7280' }}>{item.watchCount} watching</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!trendingLoading && trending.length === 0 && !trendingError && (
            <div className="text-sm py-3" style={{ color: '#4B5563' }}>No trending signals found right now — check back later.</div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-xs mb-3" style={{ color: '#4B5563' }}>
            Search results powered by the{' '}
            <a href="https://developer.ebay.com" target="_blank" rel="noopener noreferrer" style={{ color: '#6B7280' }}>
              eBay Browse API
            </a>
            . Brad&apos;s Bargains is not affiliated with or endorsed by eBay Inc.
          </p>
          <div className="flex items-center justify-center gap-4 text-xs" style={{ color: '#4B5563' }}>
            <a href="/terms" style={{ color: '#6B7280' }} className="hover:underline">Terms of Service</a>
            <span>·</span>
            <a href="/privacy" style={{ color: '#6B7280' }} className="hover:underline">Privacy Policy</a>
          </div>
        </div>
      </div>
    </div>
  );
}
