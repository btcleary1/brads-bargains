import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { DIGEST_CATEGORIES } from '@/lib/digest-categories';
import { searchDeals, EbayItem } from '@/lib/ebay';
import { MOCK_DEALS } from '@/lib/mock-deals';
import { topDeals, sellabilityScore } from '@/lib/deal-score';
import { sendDailyDigest, sendSmsDigest } from '@/lib/notify';
import { r2Get, r2Put } from '@/lib/r2';
import { getAllUsers } from '@/lib/users';
import { getUserPrefs } from '@/lib/tracker-data';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const runtime = 'nodejs';

const DIGEST_STATE_PATH = 'deal-wiz/digest-state.json';
const DIGEST_SECRET = process.env.DIGEST_SECRET ?? 'digest-2026';

// Categories to search when live eBay API is available
const SEARCH_QUERIES = DIGEST_CATEGORIES.map(c => c.query);

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const force  = req.nextUrl.searchParams.get('force') === '1';

  if (secret !== DIGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Prevent double-sending on the same day unless forced
  if (!force) {
    const state = await r2Get<{ lastSentDate: string }>(DIGEST_STATE_PATH);
    if (state?.lastSentDate === todayKey()) {
      return NextResponse.json({ skipped: true, reason: 'Already sent today', date: todayKey() });
    }
  }

  const forceMock = req.nextUrl.searchParams.get('mock') === '1';
  // ?to= overrides for manual testing; otherwise sends to all registered users
  const toOverride = req.nextUrl.searchParams.get('to') || null;

  try {
    let allItems;

    if (forceMock || process.env.EBAY_MOCK === 'true' || !process.env.EBAY_CLIENT_ID) {
      allItems = MOCK_DEALS;
    } else {
      // Run searches in batches of 5 with a small delay to avoid rate limiting
      const allResults: EbayItem[] = [];
      const batchSize = 5;
      for (let i = 0; i < SEARCH_QUERIES.length; i += batchSize) {
        const batch = SEARCH_QUERIES.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(batch.map(q => searchDeals(q, 30)));
        batchResults.forEach(r => { if (r.status === 'fulfilled') allResults.push(...r.value); });
        if (i + batchSize < SEARCH_QUERIES.length) await new Promise(r => setTimeout(r, 500));
      }
      const seen = new Set<string>();
      allItems = allResults.filter(item => {
        if (seen.has(item.itemId)) return false;
        seen.add(item.itemId);
        return true;
      });
      console.log(`[digest] eBay searches: ${SEARCH_QUERIES.length} total, ${allItems.length} raw items`);
    }

    // Hard-remove refurbished items before scoring
    const nonRefurb = allItems.filter(i => !/refurb/i.test(i.condition) && !/refurb/i.test(i.title));
    const itemPool = nonRefurb.length >= 10 ? nonRefurb : allItems;
    console.log(`[digest] non-refurb items: ${nonRefurb.length} of ${allItems.length}`);

    // Flex down from 60% to 35% minimum — never send weak deals
    let best5 = topDeals(itemPool, 5, 60);
    if (best5.length < 5) {
      for (let pct = 59; pct >= 35 && best5.length < 5; pct--) {
        best5 = topDeals(itemPool, 5, pct);
      }
    }

    if (best5.length === 0) {
      return NextResponse.json({ sent: false, reason: 'No qualifying deals found' });
    }

    // Sort by sellabilityScore once — AI pick and email both use this ordering
    best5 = [...best5].sort((a, b) => sellabilityScore(b, best5) - sellabilityScore(a, best5));

    // Build recipient list with personalized deals per user
    type UserDigest = { email: string; phone?: string; deals: typeof best5 };
    let userDigests: UserDigest[] = [];

    if (toOverride) {
      userDigests = [{ email: toOverride, deals: best5 }];
    } else {
      const users = await getAllUsers();
      const prefsResults = await Promise.allSettled(users.map(u => getUserPrefs(u.userId)));

      for (let i = 0; i < users.length; i++) {
        const r = prefsResults[i];
        if (r.status !== 'fulfilled') continue;
        const prefs = r.value;
        if (!prefs.notificationEmail && !prefs.notificationPhone) continue;

        const count = prefs.digestCount ?? 5;

        // Filter allItems by user's preferred categories if set
        let pool = allItems;
        if (prefs.digestCategories && prefs.digestCategories.length > 0) {
          const allowedQueries = DIGEST_CATEGORIES
            .filter(c => prefs.digestCategories!.includes(c.key))
            .map(c => c.query.toLowerCase());
          pool = allItems.filter(item =>
            allowedQueries.some(q => item.title.toLowerCase().includes(q.split(' ')[0]))
          );
          if (pool.length === 0) pool = allItems; // fallback to all if filter yields nothing
        }

        // If user has a personal watchlist, search those terms for their digest
        let userDeals: typeof best5 = [];
        let baseDeals = topDeals(pool, count, 60);
        for (let pct = 59; pct >= 40 && baseDeals.length < count; pct--) {
          baseDeals = topDeals(pool, count, pct);
        }
        userDeals = baseDeals;

        if (prefs.watchlistQueries && prefs.watchlistQueries.length > 0) {
          const personalResults = await Promise.allSettled(prefs.watchlistQueries.map(q => searchDeals(q, 20)));
          const seen = new Set<string>();
          const personalItems = personalResults
            .flatMap(res => res.status === 'fulfilled' ? res.value : [])
            .filter(item => { if (seen.has(item.itemId)) return false; seen.add(item.itemId); return true; });
          if (personalItems.length > 0) {
            let personalDeals = topDeals(personalItems, count, 60);
            for (let pct = 59; pct >= 40 && personalDeals.length < count; pct--) {
              personalDeals = topDeals(personalItems, count, pct);
            }
            userDeals = personalDeals.length > 0 ? personalDeals : userDeals;
          }
        }

        const sortedDeals = [...userDeals].sort((a, b) => sellabilityScore(b, userDeals) - sellabilityScore(a, userDeals));
        userDigests.push({ email: prefs.notificationEmail ?? '', phone: prefs.notificationPhone, deals: sortedDeals });
      }

      if (userDigests.length === 0 && process.env.NOTIFICATION_EMAIL) {
        userDigests = [{ email: process.env.NOTIFICATION_EMAIL, deals: best5 }];
      }
    }

    if (userDigests.length === 0) {
      return NextResponse.json({ sent: false, reason: 'No recipients configured' });
    }

    // Generate AI Pick of the Day from best5
    let aiPick: string | undefined;
    try {
      const top = best5.slice(0, 5).map((i, idx) => {
        const netProfit = i.marketPrice ? Math.round(i.marketPrice * 0.85 - i.price - (i.shippingCost ?? 0)) : null;
        return `#${idx + 1} ${i.title} — buy $${i.price}, market $${i.marketPrice ?? 'unknown'}, net profit after fees ~$${netProfit ?? '?'}. Condition: ${i.condition}.`;
      }).join('\n');
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `You are a sharp eBay flip advisor. Net profit figures already account for eBay fees. Given these listings, recommend the single best one to buy today for resale profit. Reference the net profit figure. Be direct, specific, and under 50 words. No disclaimers. No markdown formatting.\n\n${top}`,
        }],
      });
      aiPick = msg.content[0].type === 'text' ? msg.content[0].text.trim() : undefined;
    } catch (e) { console.error('AI pick failed:', e); }

    // Send to all recipients — collect results to surface any errors
    const sendResults = await Promise.allSettled(userDigests.map(({ email, phone, deals }) =>
      Promise.all([
        email ? sendDailyDigest(deals, email, aiPick) : Promise.resolve(),
        phone ? sendSmsDigest(deals, phone) : Promise.resolve(),
      ])
    ));
    const errors = sendResults
      .map((r, i) => r.status === 'rejected' ? `${userDigests[i].email || userDigests[i].phone}: ${r.reason}` : null)
      .filter(Boolean);
    const successCount = sendResults.filter(r => r.status === 'fulfilled').length;

    if (successCount === 0) {
      return NextResponse.json({ sent: false, reason: 'All emails failed', errors }, { status: 500 });
    }

    // Record send date to prevent duplicates
    await r2Put(DIGEST_STATE_PATH, JSON.stringify({ lastSentDate: todayKey() }));

    return NextResponse.json({
      sent: true,
      date: todayKey(),
      recipients: successCount,
      rawItemCount: allItems.length,
      nonRefurbCount: nonRefurb.length,
      aiPick: aiPick ?? null,
      errors: errors.length > 0 ? errors : undefined,
      deals: best5.map(d => ({
        title: d.title,
        price: d.price,
        marketPrice: d.marketPrice,
        discountPct: d.discountPct,
        condition: d.condition,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
