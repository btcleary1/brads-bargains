'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import { Search, Zap, Loader2, Plus, ExternalLink, Tag, TrendingDown, TrendingUp, Package, AlertCircle, Mail, CheckCircle, Clock, FlaskConical, ThumbsUp, ThumbsDown, Minus, Flame, Sparkles, ShoppingBag, Smartphone, X, MessageSquarePlus } from 'lucide-react';
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
  sourcesCount?: number | null;
  noData?: boolean;
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
  estDaysToSell?: number | null;
  sourcesCount?: number | null;
  stockxLastSale?: number | null;
  mercariAvgSold?: number | null;
  amazonPrice?: number | null;
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

function estDaysFromTitle(title: string, category = ''): number {
  const t = `${title} ${category}`.toLowerCase();
  if (/iphone|samsung.*phone|pixel/.test(t)) return 4;
  if (/macbook|laptop/.test(t)) return 10;
  if (/playstation|ps5|xbox/.test(t)) return 7;
  if (/ipad|tablet/.test(t)) return 10;
  if (/airpods|headphone|earbuds/.test(t)) return 8;
  if (/nintendo|switch/.test(t)) return 8;
  if (/apple watch|smartwatch/.test(t)) return 10;
  if (/drone|camera/.test(t)) return 14;
  if (/pokemon|sports card|trading card/.test(t)) return 7;
  if (/lego/.test(t)) return 18;
  if (/comic/.test(t)) return 21;
  if (/tv|television/.test(t)) return 28;
  if (/vintage|antique/.test(t)) return 35;
  return 18;
}

function decodeBase64url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '=='.slice(0, (4 - b64.length % 4) % 4);
  return atob(padded);
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

function StatsCluster({
  avgSoldPrice, soldCount, sourcesCount, netProfit, estDaysToSell, annROI,
  stockxLastSale, mercariAvgSold, amazonPrice,
}: {
  avgSoldPrice?: number | null;
  soldCount?: number | null;
  sourcesCount?: number | null;
  netProfit?: number | null;
  estDaysToSell?: number | null;
  annROI?: number | null;
  stockxLastSale?: number | null;
  mercariAvgSold?: number | null;
  amazonPrice?: number | null;
}) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const hasLine1 = avgSoldPrice != null;
  const line2: { text: string; color: string; bold?: boolean }[] = [];
  if (netProfit != null) line2.push({ text: `${netProfit >= 0 ? '+' : ''}$${Math.abs(netProfit).toFixed(0)} Net Profit`, color: netProfit > 0 ? '#4ADE80' : '#F87171', bold: true });
  if (estDaysToSell != null && estDaysToSell >= 1) line2.push({ text: `Est. ${estDaysToSell}d to sell`, color: '#6B7280' });
  if (annROI != null && annROI > 0 && annROI <= 2000) line2.push({ text: `${Math.round(annROI)}% ann. ROI`, color: annROI >= 200 ? '#4ADE80' : annROI >= 100 ? '#FCD34D' : '#9CA3AF' });
  if (!hasLine1 && line2.length === 0) return null;

  const sources: { name: string; price: number; count?: number }[] = [];
  if (avgSoldPrice != null && avgSoldPrice > 0) sources.push({ name: 'eBay', price: avgSoldPrice, count: soldCount ?? undefined });
  if (stockxLastSale) sources.push({ name: 'StockX', price: stockxLastSale });
  if (mercariAvgSold) sources.push({ name: 'Mercari', price: mercariAvgSold });
  if (amazonPrice) sources.push({ name: 'Amazon', price: amazonPrice });
  const siteCount = sourcesCount ?? (sources.length > 0 ? sources.length : null);

  return (
    <div className="space-y-0.5">
      {hasLine1 && (
        <div className="text-xs" style={{ color: '#9CA3AF' }}>
          Avg sold <strong style={{ color: '#E5E7EB' }}>${avgSoldPrice!.toFixed(0)}</strong>
          {soldCount != null && (
            <> &middot; {soldCount} comps{siteCount != null ? (
              <> &middot; <button
                onClick={(e) => { e.stopPropagation(); setSourcesExpanded(v => !v); }}
                style={{ color: '#60A5FA', background: 'none', border: 'none', padding: 0, fontSize: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
              >{siteCount} {siteCount === 1 ? 'site' : 'sites'}</button></>
            ) : ''}</>
          )}
        </div>
      )}
      {sourcesExpanded && sources.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs mt-0.5">
          {sources.map(s => (
            <span key={s.name} style={{ color: '#6B7280' }}>
              {s.name} <strong style={{ color: '#D1D5DB' }}>${s.price.toFixed(0)}</strong>{s.count != null ? ` (${s.count})` : ''}
            </span>
          ))}
        </div>
      )}
      {line2.length > 0 && (
        <div className="flex flex-wrap gap-x-3 text-xs">
          {line2.map((f, i) => (
            <span key={i} style={{ color: f.color, fontWeight: f.bold ? 600 : 400 }}>{f.text}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function PwaBanner({ onDismiss }: { onDismiss: () => void }) {
  const [os, setOs] = useState<'ios' | 'android' | 'other'>('other');
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) setOs('ios');
    else if (/android/i.test(ua)) setOs('android');
  }, []);
  return (
    <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 shrink-0" style={{ color: '#60A5FA' }} />
          <span className="text-sm font-semibold text-white">Add to your home screen</span>
        </div>
        <button onClick={onDismiss} className="shrink-0 transition-colors hover:text-white" style={{ color: '#4B5563' }}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-xs mb-3" style={{ color: '#93C5FD' }}>
        Install Brad&apos;s Bargains as an app for instant access and deal notifications — no App Store needed.
      </p>
      {os === 'ios' && (
        <div className="text-xs space-y-1" style={{ color: '#CBD5E1' }}>
          <div>1. Tap the <strong style={{ color: 'white' }}>Share</strong> button at the bottom of Safari</div>
          <div>2. Scroll down and tap <strong style={{ color: 'white' }}>Add to Home Screen</strong></div>
          <div>3. Tap <strong style={{ color: 'white' }}>Add</strong> — done!</div>
        </div>
      )}
      {os === 'android' && (
        <div className="text-xs space-y-1" style={{ color: '#CBD5E1' }}>
          <div>1. Tap the <strong style={{ color: 'white' }}>⋮ menu</strong> in Chrome</div>
          <div>2. Tap <strong style={{ color: 'white' }}>Add to Home screen</strong></div>
          <div>3. Tap <strong style={{ color: 'white' }}>Add</strong> — done!</div>
        </div>
      )}
      {os === 'other' && (
        <div className="text-xs" style={{ color: '#CBD5E1' }}>
          On <strong style={{ color: 'white' }}>iPhone</strong>: Safari → Share → Add to Home Screen<br />
          On <strong style={{ color: 'white' }}>Android</strong>: Chrome → ⋮ menu → Add to Home Screen
        </div>
      )}
      <button
        onClick={onDismiss}
        className="mt-3 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
        style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.4)', color: '#93C5FD' }}
      >
        Got it!
      </button>
    </div>
  );
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
    if (comps && !compsError) return; // already have a valid result — no credit burn
    setCompsLoading(true);
    setCompsError('');
    try {
      const res = await fetch('/api/sold-comps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, price: item.price, shippingCost: item.shippingCost, marketPrice: item.marketPrice, discountPct: item.discountPct, condition: item.condition }),
      });
      const data = await res.json();
      setComps(data); // noData:true is handled in render as N/A
    } catch {
      setComps({ noData: true } as any);
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

  // Use comp-based profit when available; never show marketPrice estimate (it's unreliable)
  const compProfit = activeComps?.netProfit ?? null;

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
            {activeLoading && !activeComps && (
              <span className="text-xs px-2.5 py-1 rounded-lg flex items-center gap-1" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#A78BFA' }}>
                <Loader2 className="w-3 h-3 animate-spin" /> Grading…
              </span>
            )}
            {compProfit !== null && compProfit > 0 && (
              <span className="text-sm font-bold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ADE80' }}>
                +${compProfit.toFixed(0)} net profit
              </span>
            )}
            {compProfit !== null && compProfit <= 0 && activeComps && (
              <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#FCA5A5' }}>
                Low margin
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
          {activeComps?.noData && !compsLoading && (
            <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#6B7280' }}>
              No sold comps available for this item — N/A
            </div>
          )}
          {activeComps && activeComps.verdict && activeComps.avgSoldPrice != null && !compsLoading && !activeComps.noData && (
            <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <VerdictBadge verdict={activeComps.verdict} />
                {preFlip && !comps && <span className="text-xs" style={{ color: '#6B7280' }}>Auto-graded</span>}
                <MultiSourceBadge confidence={activeComps.multiSourceConfidence} stockx={activeComps.stockxLastSale} mercari={activeComps.mercariAvgSold} amazon={activeComps.amazonPrice} />
              </div>
              <div className="mb-2">
                <StatsCluster
                  avgSoldPrice={activeComps.avgSoldPrice}
                  soldCount={activeComps.soldCount}
                  sourcesCount={activeComps.sourcesCount}
                  netProfit={activeComps.netProfit}
                  estDaysToSell={activeComps.daysToSell}
                  annROI={activeComps.capitalEfficiency}
                  stockxLastSale={activeComps.stockxLastSale}
                  mercariAvgSold={activeComps.mercariAvgSold}
                  amazonPrice={activeComps.amazonPrice}
                />
              </div>
              {activeComps.platformRecommendation && (
                <div className="text-xs mb-1" style={{ color: '#A78BFA' }}>
                  Sell on: {activeComps.platformRecommendation === 'either' ? 'eBay or FB' : activeComps.platformRecommendation === 'facebook' ? 'Facebook' : 'eBay'}
                </div>
              )}
              {activeComps.discountQualityReason && (
                <DiscountQualityBadge quality={activeComps.discountQuality} reason={activeComps.discountQualityReason} />
              )}
              {activeComps.reasoning && <p className="text-xs leading-relaxed mt-2" style={{ color: '#9CA3AF' }}>{activeComps.reasoning}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DigestDealCard({ deal }: { deal: BrowseDeal }) {
  const [comps, setComps] = useState<CompsVerdict | null>(null);
  const [compsLoading, setCompsLoading] = useState(false);

  const checkFlip = async () => {
    if (comps) return; // already have a result — no credit burn
    setCompsLoading(true);
    try {
      const res = await fetch('/api/sold-comps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: deal.title, price: deal.price, shippingCost: deal.shippingCost, marketPrice: deal.marketPrice, discountPct: deal.discountPct, condition: deal.condition }),
      });
      const data = await res.json();
      setComps(data);
    } catch {
      setComps({ noData: true } as any);
    } finally {
      setCompsLoading(false);
    }
  };

  const activeVerdict = comps?.verdict ?? deal.flipVerdict;
  const activeBorder = activeVerdict === 'buy' ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(251,191,36,0.2)';

  return (
    <div id={`item-${deal.itemId}`} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: activeBorder, scrollMarginTop: '80px' }}>
      <div className="flex gap-3 p-4">
        {deal.imageUrl && (
          <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={deal.imageUrl} alt={deal.title} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-white text-sm leading-snug line-clamp-2 mb-1">{deal.title}</p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <VerdictBadge verdict={activeVerdict} />
            <span className="text-lg font-bold" style={{ color: '#34D399' }}>${deal.price.toFixed(2)}</span>
            {deal.marketPrice && <span className="text-sm line-through" style={{ color: '#4B5563' }}>${deal.marketPrice.toFixed(0)}</span>}
            {deal.discountPct != null && <DealBadge pct={deal.discountPct} />}
            {(comps?.netProfit ?? deal.flipNetProfit) > 0 && (
              <span className="text-sm font-bold px-2.5 py-1 rounded-lg" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ADE80' }}>
                +${comps?.netProfit ?? deal.flipNetProfit} Net Profit
              </span>
            )}
          </div>
          {/* Pre-computed flip data */}
          {!comps && deal.avgSoldPrice <= 0 && deal.soldCount <= 0 && (
            <div className="rounded-xl px-3 py-2 mb-2 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#6B7280' }}>
              No comps available
            </div>
          )}
          {!comps && deal.avgSoldPrice > 0 && (
            <div className="rounded-xl px-3 py-2 mb-2" style={{ background: deal.flipVerdict === 'buy' ? 'rgba(34,197,94,0.08)' : 'rgba(251,191,36,0.08)', border: deal.flipVerdict === 'buy' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(251,191,36,0.2)' }}>
              <span className="text-xs font-bold block mb-1" style={{ color: deal.flipVerdict === 'buy' ? '#4ADE80' : '#FCD34D' }}>{deal.flipVerdict === 'buy' ? '✓ BUY' : '~ MAYBE'}</span>
              <StatsCluster avgSoldPrice={deal.avgSoldPrice} soldCount={deal.soldCount} sourcesCount={deal.sourcesCount} netProfit={deal.flipNetProfit > 0 ? deal.flipNetProfit : null} estDaysToSell={deal.estDaysToSell} annROI={deal.estDaysToSell != null && deal.estDaysToSell >= 1 && deal.flipNetProfit > 0 ? Math.round((deal.flipNetProfit / deal.price / deal.estDaysToSell) * 365 * 100) : null} stockxLastSale={deal.stockxLastSale} mercariAvgSold={deal.mercariAvgSold} amazonPrice={deal.amazonPrice} />
            </div>
          )}
          {/* Live Check Flip result */}
          {comps && comps.noData && deal.avgSoldPrice > 0 && (
            <div className="rounded-xl px-3 py-2 mb-2" style={{ background: deal.flipVerdict === 'buy' ? 'rgba(34,197,94,0.08)' : 'rgba(251,191,36,0.08)', border: deal.flipVerdict === 'buy' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(251,191,36,0.2)' }}>
              <span className="text-xs font-bold block mb-1" style={{ color: deal.flipVerdict === 'buy' ? '#4ADE80' : '#FCD34D' }}>{deal.flipVerdict === 'buy' ? '✓ BUY' : '~ MAYBE'} <span className="font-normal opacity-60">(email data)</span></span>
              <StatsCluster avgSoldPrice={deal.avgSoldPrice} soldCount={deal.soldCount} sourcesCount={deal.sourcesCount} netProfit={deal.flipNetProfit} estDaysToSell={deal.estDaysToSell} annROI={null} stockxLastSale={deal.stockxLastSale} mercariAvgSold={deal.mercariAvgSold} amazonPrice={deal.amazonPrice} />
            </div>
          )}
          {comps && comps.noData && deal.avgSoldPrice <= 0 && (
            <div className="mt-2 rounded-xl px-3 py-2 mb-2 text-xs" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#6B7280' }}>
              No sold comps available — N/A
            </div>
          )}
          {comps && !comps.noData && (
            <div className="mt-2 rounded-xl p-3 mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <VerdictBadge verdict={comps.verdict} />
              </div>
              <div className="mb-2">
                <StatsCluster avgSoldPrice={comps.avgSoldPrice} soldCount={comps.soldCount} sourcesCount={comps.sourcesCount} netProfit={comps.netProfit} estDaysToSell={comps.daysToSell} annROI={comps.capitalEfficiency} stockxLastSale={comps.stockxLastSale} mercariAvgSold={comps.mercariAvgSold} amazonPrice={comps.amazonPrice} />
              </div>
              {comps.reasoning && <p className="text-xs leading-relaxed" style={{ color: '#9CA3AF' }}>{comps.reasoning}</p>}
            </div>
          )}
          <div className="text-xs mb-2" style={{ color: '#6B7280' }}>{deal.condition}</div>
          <div className="flex gap-2 flex-wrap">
            <a href={deal.itemUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg"
              style={{ border: '1px solid rgba(255,255,255,0.12)', color: '#9CA3AF' }}>
              <ExternalLink className="w-3 h-3" /> View on eBay
            </a>
            <BrowseTrackButton deal={deal} />
            <button
              onClick={checkFlip}
              disabled={compsLoading}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-60"
              style={comps
                ? comps.verdict === 'buy'
                  ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ADE80' }
                  : comps.verdict === 'skip'
                  ? { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#FCA5A5' }
                  : { background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: '#FCD34D' }
                : { background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#C4B5FD' }
              }
            >
              {compsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
              {compsLoading ? 'Checking…' : comps ? (comps.verdict === 'buy' ? 'BUY' : comps.verdict === 'skip' ? 'SKIP' : 'MAYBE') : 'Check Flip'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DealsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [digestItems, setDigestItems] = useState<BrowseDeal[]>([]);
  const [digestAiPick, setDigestAiPick] = useState<string | null>(null);
  const [digestAiPickItemId, setDigestAiPickItemId] = useState<string | null>(null);
  const [digestGeneratedAt, setDigestGeneratedAt] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const digestRef = useRef<HTMLDivElement>(null);
  const viewDigest = searchParams.get('view') === 'digest';
  const digestItemId = searchParams.get('item');
  const spotlightParam = searchParams.get('spotlight');
  const spotlightItem: BrowseDeal | null = (() => {
    if (!spotlightParam) return null;
    try {
      const data = JSON.parse(decodeBase64url(spotlightParam));
      return {
        itemId: data.itemId ?? '',
        title: data.title ?? '',
        price: data.price ?? 0,
        marketPrice: data.marketPrice ?? null,
        discountPct: data.discountPct ?? null,
        condition: data.condition ?? '',
        imageUrl: data.imageUrl ?? '',
        itemUrl: data.itemUrl ?? '',
        category: data.category ?? '',
        shippingCost: data.shippingCost ?? null,
        listingDate: null,
        seller: '',
        sellerFeedbackPercent: null,
        flipVerdict: data.flipVerdict === 'buy' ? 'buy' : data.flipVerdict === 'skip' ? 'maybe' : 'maybe',
        avgSoldPrice: data.avgSoldPrice ?? 0,
        soldCount: data.soldCount ?? 0,
        flipNetProfit: data.flipNetProfit ?? 0,
        flipMarginPct: 0,
        estDaysToSell: data.estDaysToSell ?? null,
        sourcesCount: data.sourcesCount ?? null,
        stockxLastSale: data.stockxLastSale ?? null,
        mercariAvgSold: data.mercariAvgSold ?? null,
        amazonPrice: data.amazonPrice ?? null,
      } as BrowseDeal;
    } catch { return null; }
  })();
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
  const [maxDaysToSell, setMaxDaysToSell] = useState<number | null>(60);
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
  const [trendingFlips, setTrendingFlips] = useState<Record<string, CompsVerdict>>({});
  const [trendingPending, setTrendingPending] = useState<Set<string>>(new Set());
  const [browseItems, setBrowseItems] = useState<BrowseDeal[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseGeneratedAt, setBrowseGeneratedAt] = useState<string | null>(null);
  const [bulkFlips, setBulkFlips] = useState<Record<string, CompsVerdict>>({});
  const [bulkPending, setBulkPending] = useState<Set<string>>(new Set());
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingCats, setOnboardingCats] = useState<string[]>([]);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [personalizedRecs, setPersonalizedRecs] = useState<EbayItem[] | null>(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsKeywords, setRecsKeywords] = useState<string[]>([]);
  const [ebayConnected, setEbayConnected] = useState(false);
  const [showPwaBanner, setShowPwaBanner] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [fbType, setFbType] = useState<'enhancement' | 'bug'>('enhancement');
  const [fbTitle, setFbTitle] = useState('');
  const [fbDesc, setFbDesc] = useState('');
  const [fbLoading, setFbLoading] = useState(false);
  const [fbMessage, setFbMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const submitFeedback = async () => {
    if (!fbTitle.trim() || !fbDesc.trim()) return;
    setFbLoading(true); setFbMessage(null);
    try {
      const res = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: fbType, title: fbTitle, description: fbDesc }) });
      if (!res.ok) throw new Error();
      setFbMessage({ type: 'success', text: 'Feedback submitted — thank you!' });
      setFbTitle(''); setFbDesc('');
      setTimeout(() => { setShowFeedback(false); setFbMessage(null); }, 2000);
    } catch {
      setFbMessage({ type: 'error', text: 'Failed to submit. Please try again.' });
    } finally { setFbLoading(false); }
  };

  useEffect(() => {
    const dismissed = typeof window !== 'undefined' && localStorage.getItem('pwa-banner-dismissed');
    const isStandalone = typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);
    if (!dismissed && !isStandalone) setShowPwaBanner(true);
  }, []);

  useEffect(() => {
    fetch('/api/auth/me').then(r => {
      if (r.status === 401) {
        const dest = window.location.pathname + window.location.search;
        router.replace(`/login?redirect=${encodeURIComponent(dest)}`);
      }
    }).catch(() => { /* network error — don't log out */ });

    // Check if user has set category preferences; also load default price range
    fetch('/api/prefs').then(r => r.ok ? r.json() : {}).then((p: any) => {
      if (p.defaultPriceMin != null) setPriceMin(p.defaultPriceMin);
      if (p.defaultPriceMax != null) setPriceMax(p.defaultPriceMax);
      if (p.defaultMinProfit != null) setFilterMinProfit(p.defaultMinProfit);
      if (p.defaultMinDiscount != null) setFilterPct(p.defaultMinDiscount);
      if (p.defaultSingleQtyOnly) setFilterSingleQty(true);
      setMaxDaysToSell(p.maxDaysToSell != null ? p.maxDaysToSell : 60);
      const dismissed = typeof window !== 'undefined' && localStorage.getItem('onboarding-dismissed');
      if (!dismissed && (!p.digestCategories || p.digestCategories.length === 0)) {
        setShowOnboarding(true);
      }
    }).catch(() => {
      const dismissed = typeof window !== 'undefined' && localStorage.getItem('onboarding-dismissed');
      if (!dismissed) setShowOnboarding(true);
    });

    // Check eBay connection status independently (fast, not rate-limited)
    fetch('/api/auth/ebay/status')
      .then(r => r.ok ? r.json() : { connected: false })
      .then((d: any) => { if (d?.connected) setEbayConnected(true); })
      .catch(() => {});

    // Fetch personalized recommendations on page load
    setRecsLoading(true);
    fetch('/api/recommendations')
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (d?.connected) {
          setEbayConnected(true);
          setPersonalizedRecs(d.recommendations ?? []);
          setRecsKeywords(d.keywords ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setRecsLoading(false));

    // Load trending and browse feed on mount in parallel
    setTrendingLoading(true);
    fetch('/api/trending')
      .then(r => r.json())
      .then(d => {
        const items: TrendingItem[] = d.items ?? [];
        setTrending(items);
        setTrendingSummary(d.summary ?? '');
        // Bulk grade top 6 trending items via sold-comps (AI, 4hr R2 cache)
        const top6 = items.slice(0, 6).filter(i => i.itemId);
        if (top6.length > 0) {
          setTrendingPending(new Set(top6.map(i => i.itemId)));
          top6.forEach((item, idx) => {
            setTimeout(() => {
              fetch('/api/sold-comps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: item.title, price: item.price, shippingCost: null, condition: item.condition }),
              }).then(r => r.json()).then(flip => {
                if (flip?.verdict && flip?.avgSoldPrice != null && flip?.netProfit != null) {
                  setTrendingFlips(prev => ({ ...prev, [item.itemId]: flip }));
                }
              }).catch(() => {}).finally(() => {
                setTrendingPending(prev => { const next = new Set(prev); next.delete(item.itemId); return next; });
              });
            }, idx * 500);
          });
        }
      })
      .catch(() => setTrendingError('Could not load trending'))
      .finally(() => setTrendingLoading(false));

    setBrowseLoading(true);
    fetch('/api/browse')
      .then(r => r.json())
      .then(d => { setBrowseItems(d.items ?? []); setBrowseGeneratedAt(d.generatedAt ?? null); })
      .catch(() => {})
      .finally(() => setBrowseLoading(false));
  }, [router]);

  useEffect(() => {
    if (!viewDigest) return;
    setDigestLoading(true);
    fetch('/api/digest-deals')
      .then(r => r.json())
      .then(d => {
        setDigestItems(d.items ?? []);
        setDigestAiPick(d.aiPick ?? null);
        setDigestAiPickItemId(d.aiPickItemId ?? null);
        setDigestGeneratedAt(d.generatedAt ?? null);
      })
      .catch(() => {})
      .finally(() => setDigestLoading(false));
  }, [viewDigest]);

  // Scroll to specific item AFTER React commits digestItems to DOM
  useEffect(() => {
    if (!digestItemId || digestItems.length === 0) return;
    const targetId = `item-${digestItemId}`;
    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.outline = '2px solid #818CF8';
        el.style.borderRadius = '16px';
        setTimeout(() => { el.style.outline = ''; el.style.borderRadius = ''; }, 2500);
      } else if (attempts < 15) {
        attempts++;
        setTimeout(tryScroll, 100);
      }
    };
    tryScroll();
  }, [digestItems, digestItemId]);

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
        // Bulk grade top 8 items via sold-comps (AI, 4hr R2 cache)
        const top8 = sortedForAI.slice(0, 8);
        setBulkPending(new Set(top8.map(i => i.itemId)));
        top8.forEach((item, idx) => {
          setTimeout(() => {
            fetch('/api/sold-comps', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: item.title, price: item.price, shippingCost: item.shippingCost, condition: item.condition }),
            }).then(r => r.json()).then(flip => {
              // Only store if it's a valid verdict — discard error responses
              if (flip?.verdict && flip?.avgSoldPrice != null && flip?.netProfit != null) {
                // Respect maxDaysToSell: keep N/A (null) always, filter items that exceed the limit
                const dts = flip.daysToSell ?? null;
                if (dts === null || maxDaysToSell === null || dts <= maxDaysToSell) {
                  setBulkFlips(prev => ({ ...prev, [item.itemId]: flip }));
                }
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
              body: JSON.stringify({ title: item.title, price: item.price, shippingCost: item.shippingCost, marketPrice: item.marketPrice, discountPct: item.discountPct, condition: item.condition }),
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
        let pool: EbayItem[];
        if (showAll) {
          pool = results.items;
        } else {
          const hot = results.items.filter(i => i.isHotDeal);
          if (hot.length >= 30) {
            pool = hot;
          } else {
            // Fill up to 30 with remaining scored items after hot deals
            const rest = results.items.filter(i => !i.isHotDeal);
            pool = [...hot, ...rest].slice(0, 30);
          }
        }
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

        {/* Spotlight — item linked from email */}
        {spotlightItem && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4" style={{ color: '#818CF8' }} />
              <span className="text-sm font-semibold" style={{ color: '#818CF8' }}>From today's email</span>
            </div>
            <DigestDealCard deal={spotlightItem} />
          </div>
        )}

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

        {/* PWA install banner — shown once until dismissed */}
        {showPwaBanner && (
          <PwaBanner onDismiss={() => {
            localStorage.setItem('pwa-banner-dismissed', '1');
            setShowPwaBanner(false);
          }} />
        )}

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
                    <div className="mt-2">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <VerdictBadge verdict={pickedFlip.verdict} />
                        <span className="text-[10px]" style={{ color: '#4B5563' }}>AI-verified at page load · Click Check Flip to refresh</span>
                      </div>
                      <StatsCluster
                        avgSoldPrice={pickedFlip.avgSoldPrice}
                        soldCount={pickedFlip.soldCount}
                        sourcesCount={pickedFlip.sourcesCount}
                        netProfit={pickedFlip.netProfit}
                        estDaysToSell={pickedFlip.daysToSell}
                        annROI={pickedFlip.capitalEfficiency}
                        stockxLastSale={pickedFlip.stockxLastSale}
                        mercariAvgSold={pickedFlip.mercariAvgSold}
                        amazonPrice={pickedFlip.amazonPrice}
                      />
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
                      preFlip={(pickedItemId && (item.itemId === pickedItemId || item.itemId.includes(pickedItemId) || pickedItemId.includes(item.itemId)) && pickedFlip) ? pickedFlip : (bulkFlips[item.itemId] ?? null)}
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

        {/* Today's Email Picks — shown when arriving from push notification */}
        {(viewDigest || digestItems.length > 0) && !results && !loading && (
          <div className="mt-2 mb-6" ref={digestRef}>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0" style={{ background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}>
                <Mail className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">Today&apos;s Email Picks</h2>
                <p className="text-xs" style={{ color: '#6B7280' }}>
                  From this morning&apos;s digest
                  {digestGeneratedAt && <> · {new Date(digestGeneratedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
                </p>
              </div>
            </div>
            {digestAiPick && (
              <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" style={{ color: '#818CF8' }} />
                    <span className="text-xs font-semibold" style={{ color: '#818CF8' }}>AI Pick of the Day</span>
                  </div>
                  {digestAiPickItemId && (
                    <button
                      onClick={() => {
                        const el = document.getElementById(`item-${digestAiPickItemId}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.style.outline = '2px solid #818CF8';
                          el.style.borderRadius = '16px';
                          setTimeout(() => { el.style.outline = ''; el.style.borderRadius = ''; }, 2500);
                        }
                      }}
                      className="text-xs font-medium flex items-center gap-1 px-2 py-0.5 rounded-lg transition-colors"
                      style={{ background: 'rgba(99,102,241,0.2)', color: '#A5B4FC', border: '1px solid rgba(99,102,241,0.35)' }}
                    >
                      Jump to item ↓
                    </button>
                  )}
                </div>
                <p className="text-sm" style={{ color: '#C7D2FE' }}>{digestAiPick}</p>
              </div>
            )}
            {digestLoading && (
              <div className="flex items-center gap-2 py-4 text-sm" style={{ color: '#6B7280' }}>
                <Loader2 className="w-4 h-4 animate-spin" /> Loading today&apos;s deals…
              </div>
            )}
            {!digestLoading && digestItems.length > 0 && (
              <div className="space-y-3">
                {digestItems.map(deal => <DigestDealCard key={deal.itemId} deal={deal} />)}
              </div>
            )}
            {!digestLoading && digestItems.length === 0 && (
              <div className="text-center py-6 text-sm" style={{ color: '#4B5563' }}>No digest deals cached yet — check back after 9 AM.</div>
            )}
          </div>
        )}

        {/* Empty state / Personalized Recommendations */}
        {!results && !loading && !error && (
          <div>
            {(recsLoading || (ebayConnected && personalizedRecs !== null)) && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)' }}>
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm">Recommended for You</div>
                    {recsKeywords.length > 0 && (
                      <div className="text-xs" style={{ color: '#6B7280' }}>Based on your eBay purchases: {recsKeywords.join(', ')}</div>
                    )}
                  </div>
                </div>
                {recsLoading ? (
                  <div className="flex items-center gap-2 py-6 justify-center text-sm" style={{ color: '#6B7280' }}>
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#F59E0B' }} /> Finding deals for you…
                  </div>
                ) : personalizedRecs && personalizedRecs.length > 0 ? (
                  <div className="space-y-3">
                    {personalizedRecs.map(item => <ItemCard key={item.itemId} item={item as any} onTrack={() => {}} />)}
                  </div>
                ) : (
                  <div className="rounded-xl p-4 text-sm text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#4B5563' }}>
                    No matching deals right now — check back later or search above.
                  </div>
                )}
              </div>
            )}
            {!recsLoading && !ebayConnected && (
              <div className="rounded-2xl p-5 mb-6 flex gap-3 items-start" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <div className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)' }}>
                  <ShoppingBag className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm mb-0.5" style={{ color: '#FCD34D' }}>Get personalized deal recommendations</div>
                  <div className="text-xs mb-3" style={{ color: '#92400E' }}>Connect your eBay account and we&apos;ll surface deals matching your purchase history — automatically.</div>
                  <a href="/settings" className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'linear-gradient(135deg,#F59E0B,#D97706)', color: '#fff' }}>
                    Connect in Settings →
                  </a>
                </div>
              </div>
            )}
            <div className="text-center py-10" style={{ color: '#4B5563' }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Search className="w-8 h-8" style={{ color: '#374151' }} />
              </div>
              <div className="font-medium" style={{ color: '#6B7280' }}>Search eBay for deals</div>
              <div className="text-sm mt-1" style={{ color: '#4B5563' }}>We&apos;ll find listings with varying discounts off market price</div>
            </div>
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
                          <DiscountQualityBadge quality={deal.discountQuality} reason={deal.discountQualityReason} />
                        </div>
                        {/* Stats cluster */}
                        <div className="rounded-xl px-3 py-2 mb-2" style={{ background: deal.flipVerdict === 'buy' ? 'rgba(34,197,94,0.08)' : 'rgba(251,191,36,0.08)', border: deal.flipVerdict === 'buy' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(251,191,36,0.2)' }}>
                          <span className="text-xs font-bold block mb-1" style={{ color: deal.flipVerdict === 'buy' ? '#4ADE80' : '#FCD34D' }}>{deal.flipVerdict === 'buy' ? '✓ BUY' : '~ MAYBE'}</span>
                          <StatsCluster
                            avgSoldPrice={deal.avgSoldPrice}
                            soldCount={deal.soldCount}
                            sourcesCount={deal.sourcesCount}
                            netProfit={deal.flipNetProfit}
                            estDaysToSell={deal.estDaysToSell}
                            annROI={deal.estDaysToSell != null && deal.estDaysToSell >= 1 && deal.flipNetProfit > 0 ? Math.round((deal.flipNetProfit / deal.price / deal.estDaysToSell) * 365 * 100) : null}
                            stockxLastSale={deal.stockxLastSale}
                            mercariAvgSold={deal.mercariAvgSold}
                            amazonPrice={deal.amazonPrice}
                          />
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
                // No marketPrice estimate — profit shown only after Check Flip runs
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
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-sm font-bold" style={{ color: '#34D399' }}>${item.price.toFixed(2)}</span>
                          {item.discountPct != null && item.discountPct >= 10 && (
                            <span className="text-xs" style={{ color: '#60A5FA', opacity: 0.75 }}>{item.discountPct}% off</span>
                          )}
                          <span className="text-xs font-bold" style={{ color: item.demandScore >= 70 ? '#F87171' : item.demandScore >= 40 ? '#FCD34D' : '#9CA3AF' }}>
                            {item.demandScore >= 70 ? '🔥 Hot' : item.demandScore >= 40 ? '📈 Rising' : '👀 Watch'}
                          </span>
                          {trendingPending.has(item.itemId) && !trendingFlips[item.itemId] && (
                            <span className="text-xs px-2 py-0.5 rounded-lg flex items-center gap-1" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#A78BFA' }}>
                              <Loader2 className="w-3 h-3 animate-spin" /> Grading…
                            </span>
                          )}
                        </div>
                        {trendingFlips[item.itemId] ? (
                          <div className="mb-2">
                            <StatsCluster
                              avgSoldPrice={trendingFlips[item.itemId].avgSoldPrice}
                              soldCount={trendingFlips[item.itemId].soldCount}
                              sourcesCount={trendingFlips[item.itemId].sourcesCount}
                              netProfit={trendingFlips[item.itemId].netProfit}
                              estDaysToSell={trendingFlips[item.itemId].daysToSell}
                              annROI={trendingFlips[item.itemId].capitalEfficiency}
                              stockxLastSale={trendingFlips[item.itemId].stockxLastSale}
                              mercariAvgSold={trendingFlips[item.itemId].mercariAvgSold}
                              amazonPrice={trendingFlips[item.itemId].amazonPrice}
                            />
                          </div>
                        ) : (
                          <div className="mb-2 text-xs" style={{ color: '#6B7280' }}>
                            Est. {estDaysFromTitle(item.title, item.category)}d to sell
                          </div>
                        )}
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

        {/* Floating Feedback Button */}
        <button
          onClick={() => { setShowFeedback(true); setFbMessage(null); }}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold text-white shadow-lg z-40 transition-all"
          style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}
        >
          <MessageSquarePlus className="w-4 h-4" />
          Feedback
        </button>

        {/* Feedback Modal */}
        {showFeedback && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={e => { if (e.target === e.currentTarget) setShowFeedback(false); }}>
            <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MessageSquarePlus className="w-5 h-5" style={{ color: '#60A5FA' }} />
                  <h2 className="font-semibold text-white text-[15px]">Submit Feedback</h2>
                </div>
                <button onClick={() => setShowFeedback(false)} style={{ color: '#6B7280' }}><X className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-2 mb-3">
                {(['enhancement', 'bug'] as const).map(t => (
                  <button key={t} onClick={() => setFbType(t)} className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all" style={{ background: fbType === t ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)', border: fbType === t ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.08)', color: fbType === t ? '#60A5FA' : '#6B7280' }}>
                    {t === 'enhancement' ? '✨ Enhancement' : '🐛 Bug Fix'}
                  </button>
                ))}
              </div>
              <input type="text" value={fbTitle} onChange={e => setFbTitle(e.target.value)} placeholder="Short title..." className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50 mb-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              <textarea value={fbDesc} onChange={e => setFbDesc(e.target.value)} placeholder="Describe the enhancement or bug in detail..." rows={4} className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50 mb-3 resize-none" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              {fbMessage && (
                <div className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: fbMessage.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: fbMessage.type === 'success' ? '#4ADE80' : '#F87171' }}>{fbMessage.text}</div>
              )}
              <button onClick={submitFeedback} disabled={fbLoading || !fbTitle.trim() || !fbDesc.trim()} className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)' }}>
                {fbLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Submit Feedback'}
              </button>
            </div>
          </div>
        )}

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

export default function DealsPage() {
  return (
    <Suspense>
      <DealsPageContent />
    </Suspense>
  );
}
