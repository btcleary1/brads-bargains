'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { Search, Zap, Loader2, Plus, ExternalLink, Tag, TrendingDown, Package, AlertCircle, Mail, CheckCircle, Clock } from 'lucide-react';

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
  isHotDeal: boolean;
}

interface SearchResult {
  query: string;
  total: number;
  hotDeals: number;
  minDiscount: number;
  items: EbayItem[];
}

function DealBadge({ pct }: { pct: number }) {
  const bg = pct >= 80 ? 'rgba(239,68,68,0.15)' : pct >= 70 ? 'rgba(249,115,22,0.15)' : 'rgba(59,130,246,0.15)';
  const border = pct >= 80 ? 'rgba(239,68,68,0.35)' : pct >= 70 ? 'rgba(249,115,22,0.35)' : 'rgba(59,130,246,0.35)';
  const color = pct >= 80 ? '#F87171' : pct >= 70 ? '#FB923C' : '#60A5FA';
  return (
    <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: bg, border: `1px solid ${border}`, color }}>
      {pct}% off
    </span>
  );
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

function ItemCard({ item, onTrack }: { item: EbayItem; onTrack: (item: EbayItem) => void }) {
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);

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
            {item.discountPct !== null && <DealBadge pct={item.discountPct} />}
          </div>
          <div className="flex flex-wrap gap-3 text-xs mb-2" style={{ color: '#6B7280' }}>
            <span className="flex items-center gap-1"><Package className="w-3 h-3" />{item.condition}</span>
            <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{item.category || 'Other'}</span>
            {profit !== null && profit > 0 && (
              <span className="flex items-center gap-1" style={{ color: '#4ADE80' }}>
                <TrendingDown className="w-3 h-3" />~${profit.toFixed(0)} net profit
              </span>
            )}
            {age && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{age}</span>}
          </div>
          {item.sellerFeedbackPercent !== null && (
            <div className="text-xs mb-3" style={{ color: item.sellerFeedbackPercent >= 99 ? '#4ADE80' : item.sellerFeedbackPercent >= 98 ? '#FCD34D' : '#F87171' }}>
              Seller: {item.seller} &middot; {item.sellerFeedbackPercent}% ({item.sellerFeedbackScore?.toLocaleString()} ratings)
            </div>
          )}
          <div className="flex gap-2">
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
          </div>
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
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    fetch('/api/auth/me').then(r => { if (!r.ok) router.replace('/login'); }).catch(() => router.replace('/login'));
  }, [router]);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResults(null);
    setShowAll(false);
    setEmailState('idle');
    try {
      const res = await fetch(`/api/deals?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed.');
      setResults(data);
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

  const activeFilter = filterPct !== '' ? filterPct : null;

  const displayItems = results
    ? (() => {
        let pool = showAll ? results.items : results.items.filter(i => i.isHotDeal).length > 0 ? results.items.filter(i => i.isHotDeal) : results.items.slice(0, 20);
        if (activeFilter !== null) pool = pool.filter(i => i.discountPct !== null && i.discountPct >= activeFilter);
        return pool;
      })()
    : [];

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
              <p className="text-xs" style={{ color: '#6B7280' }}>eBay items at {minDiscount}%+ off market price</p>
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
                <div className="text-xs" style={{ color: '#6B7280' }}>{minDiscount}%+ off</div>
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
              {emailState === 'sending' ? 'Sending…' : emailState === 'sent' ? 'Sent to your email!' : 'Email me these deals'}
            </button>

            {/* Discount filter */}
            <div className="flex items-center gap-2 mb-4">
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
            </div>

            {/* Items */}
            {displayItems.length > 0 && (
              <div className="space-y-3 mb-5">
                {displayItems.map(item => (
                  <ItemCard key={item.itemId} item={item} onTrack={() => {}} />
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

        {/* Empty state */}
        {!results && !loading && !error && (
          <div className="text-center py-16" style={{ color: '#4B5563' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Search className="w-8 h-8" style={{ color: '#374151' }} />
            </div>
            <div className="font-medium" style={{ color: '#6B7280' }}>Search eBay for deals</div>
            <div className="text-sm mt-1" style={{ color: '#4B5563' }}>We&apos;ll find listings at {minDiscount}%+ off market price</div>
          </div>
        )}
      </div>
    </div>
  );
}
