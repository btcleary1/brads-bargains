'use client';

import { useEffect, useState } from 'react';
import { ShoppingBag, Package, ChevronDown, ChevronUp } from 'lucide-react';
import Header from '@/components/Header';

interface OrderLineItem {
  title: string;
  quantity: number;
  price: number | null;
}

interface Order {
  orderId: string;
  date: string;
  items: OrderLineItem[];
  total: number | null;
}

export default function EbayOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [xmlSnippet, setXmlSnippet] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/ebay-orders')
      .then(r => r.json())
      .then(d => {
        if (d.debug?.tradingXmlSnippet) setXmlSnippet(d.debug.tradingXmlSnippet);
        if (d.error) setError(d.error);
        else setOrders(d.orders ?? []);
      })
      .catch(() => setError('Failed to load orders'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const totalItems = orders.reduce((n, o) => n + o.items.length, 0);

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg,#050814 0%,#0B1120 60%,#0f172a 100%)' }}>
      <Header />
      <div className="max-w-3xl mx-auto px-4 py-6 pb-24 sm:pb-10">

        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center justify-center w-10 h-10 rounded-2xl shrink-0"
            style={{ background: 'linear-gradient(135deg,#3B82F6,#6366F1)', boxShadow: '0 2px 12px rgba(99,102,241,0.3)' }}>
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">eBay Purchase History</h1>
            <p className="text-xs" style={{ color: '#6B7280' }}>
              {loading ? 'Loading…' : `${orders.length} orders · ${totalItems} items`}
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-xl p-4 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>
            {error === 'Unauthorized' ? 'Please log in to view your orders.' : error}
            {(error === 'Unauthorized' || orders.length === 0) && !loading && (
              <p className="mt-1" style={{ color: '#9CA3AF' }}>Make sure your eBay account is connected in Settings.</p>
            )}
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Package className="w-10 h-10 mx-auto mb-3" style={{ color: '#4B5563' }} />
            <p className="text-white font-medium mb-1">No orders found</p>
            <p className="text-sm" style={{ color: '#6B7280' }}>No purchases found in the last 180 days, or your eBay account may need to be reconnected in Settings.</p>
            {xmlSnippet && (
              <pre className="mt-4 text-left text-[10px] rounded-xl p-3 overflow-x-auto" style={{ background: 'rgba(0,0,0,0.3)', color: '#9CA3AF', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{xmlSnippet}</pre>
            )}
          </div>
        )}

        <div className="space-y-3">
          {orders.map(order => {
            const open = expanded.has(order.orderId);
            const date = new Date(order.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return (
              <div key={order.orderId} className="rounded-2xl overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => toggle(order.orderId)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Package className="w-4 h-4 shrink-0" style={{ color: '#6366F1' }} />
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">
                        {order.items[0]?.title ?? 'Order'}
                        {order.items.length > 1 && (
                          <span className="ml-1" style={{ color: '#6B7280' }}>+{order.items.length - 1} more</span>
                        )}
                      </p>
                      <p className="text-xs" style={{ color: '#6B7280' }}>{date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {order.total != null && (
                      <span className="text-sm font-semibold text-white">${order.total.toFixed(2)}</span>
                    )}
                    {open ? <ChevronUp className="w-4 h-4" style={{ color: '#6B7280' }} />
                           : <ChevronDown className="w-4 h-4" style={{ color: '#6B7280' }} />}
                  </div>
                </button>

                {open && (
                  <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs pt-3 mb-2" style={{ color: '#4B5563' }}>Order #{order.orderId}</p>
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-3">
                        <p className="text-sm text-white leading-snug">{item.title}</p>
                        <div className="text-right shrink-0">
                          {item.price != null && (
                            <p className="text-sm font-medium text-white">${item.price.toFixed(2)}</p>
                          )}
                          {item.quantity > 1 && (
                            <p className="text-xs" style={{ color: '#6B7280' }}>×{item.quantity}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
