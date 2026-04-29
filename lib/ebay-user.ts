// eBay user-level OAuth 2.0 — authorization code flow
// Used for accessing buyer purchase history via the Trading API

import { createHmac } from 'crypto';

const EBAY_AUTH_URL         = 'https://auth.ebay.com/oauth2/authorize';
const EBAY_TOKEN_URL        = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_TRADING_URL      = 'https://api.ebay.com/ws/api.dll';
const EBAY_SBX_AUTH_URL     = 'https://auth.sandbox.ebay.com/oauth2/authorize';
const EBAY_SBX_TOKEN_URL    = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
const EBAY_SBX_TRADING_URL  = 'https://api.sandbox.ebay.com/ws/api.dll';

function isSandbox() {
  return process.env.EBAY_SANDBOX === 'true';
}

// Scopes required for buyer purchase history
const USER_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/buy.order.readonly',
].join(' ');

// ── State helpers ─────────────────────────────────────────────────────────────

export function buildOAuthState(userId: string): string {
  const payload = JSON.stringify({ userId, ts: Date.now() });
  const sig = createHmac('sha256', process.env.SESSION_SECRET!)
    .update(payload)
    .digest('hex')
    .slice(0, 16);
  return Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64url');
}

export function verifyOAuthState(state: string): string | null {
  try {
    const { p, s } = JSON.parse(Buffer.from(state, 'base64url').toString());
    const expected = createHmac('sha256', process.env.SESSION_SECRET!)
      .update(p)
      .digest('hex')
      .slice(0, 16);
    if (s !== expected) return null;
    const { userId, ts } = JSON.parse(p);
    if (Date.now() - ts > 15 * 60 * 1000) return null; // 15-min window
    return userId as string;
  } catch {
    return null;
  }
}

// ── OAuth URL ─────────────────────────────────────────────────────────────────

export function getEbayUserAuthUrl(redirectUri: string, state: string): string {
  const baseUrl = isSandbox() ? EBAY_SBX_AUTH_URL : EBAY_AUTH_URL;
  const params = new URLSearchParams({
    client_id: process.env.EBAY_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: USER_SCOPES,
    state,
  });
  return `${baseUrl}?${params}`;
}

// ── Token exchange ────────────────────────────────────────────────────────────

export interface EbayTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

function credentials(): string {
  return Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64');
}

export async function exchangeEbayCode(code: string, redirectUri: string): Promise<EbayTokenResponse> {
  const tokenUrl = isSandbox() ? EBAY_SBX_TOKEN_URL : EBAY_TOKEN_URL;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token exchange failed: ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    // eBay refresh tokens last ~547 days; fall back to that if not provided
    refreshExpiresAt: Date.now() + (data.refresh_token_expires_in ?? 47_304_000) * 1000,
  };
}

export async function refreshEbayUserToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
  const tokenUrl = isSandbox() ? EBAY_SBX_TOKEN_URL : EBAY_TOKEN_URL;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: USER_SCOPES,
    }).toString(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token refresh failed: ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

// ── Purchase history via Trading API (SOAP) ───────────────────────────────────

export interface PurchasedEbayItem {
  itemId: string;
  title: string;
  categoryName: string;
  price: number;
  endTime: string;
}

function extractXmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : null;
}

function parseGetMyeBayBuying(xml: string): PurchasedEbayItem[] {
  // Surface API-level errors
  if (xml.includes('<SeverityCode>Error</SeverityCode>')) {
    const msg = extractXmlTag(xml, 'LongMessage') ?? 'eBay API error';
    throw new Error(msg);
  }

  const items: PurchasedEbayItem[] = [];
  const itemMatches = Array.from(xml.matchAll(/<Item>([\s\S]*?)<\/Item>/g));

  for (const match of itemMatches) {
    const itemXml = match[1];
    const itemId      = extractXmlTag(itemXml, 'ItemID') ?? '';
    const title       = extractXmlTag(itemXml, 'Title') ?? '';
    const catBlock    = itemXml.match(/<PrimaryCategory>([\s\S]*?)<\/PrimaryCategory>/)?.[1] ?? '';
    const categoryName = extractXmlTag(catBlock, 'CategoryName') ?? '';
    const priceRaw    = extractXmlTag(itemXml, 'CurrentPrice') ?? '0';
    const endTime     = extractXmlTag(itemXml, 'EndTime') ?? '';

    if (itemId && title) {
      items.push({
        itemId,
        title,
        categoryName,
        price: parseFloat(priceRaw) || 0,
        endTime,
      });
    }
  }

  return items;
}

export async function getEbayPurchaseHistory(accessToken: string): Promise<PurchasedEbayItem[]> {
  const tradingUrl = isSandbox() ? EBAY_SBX_TRADING_URL : EBAY_TRADING_URL;

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBayBuyingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <PurchasedList>
    <Include>true</Include>
    <NumberOfDays>180</NumberOfDays>
    <Sort>EndTimeDescending</Sort>
    <Pagination>
      <EntriesPerPage>50</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </PurchasedList>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
</GetMyeBayBuyingRequest>`;

  const res = await fetch(tradingUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': 'GetMyeBayBuying',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-APP-NAME': process.env.EBAY_CLIENT_ID!,
      Authorization: `Bearer ${accessToken}`,
    },
    body: soapBody,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay Trading API failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const xml = await res.text();
  return parseGetMyeBayBuying(xml);
}

// ── Keyword extraction ────────────────────────────────────────────────────────

export function extractSearchKeywords(purchases: PurchasedEbayItem[]): string[] {
  const keywords = new Set<string>();

  for (const item of purchases) {
    const t = item.title.toLowerCase();
    const c = item.categoryName.toLowerCase();

    if (/iphone/.test(t))                              keywords.add('iPhone');
    else if (/samsung.*(?:phone|galaxy)|galaxy.*s\d/.test(t)) keywords.add('Samsung Galaxy phone');
    else if (/google.*pixel|pixel \d/.test(t))         keywords.add('Google Pixel');

    if (/macbook/.test(t))                             keywords.add('MacBook');
    else if (/laptop|notebook/.test(t))                keywords.add('laptop');

    if (/\bipad\b/.test(t))                            keywords.add('iPad');
    if (/playstation|ps5/.test(t))                     keywords.add('PlayStation 5');
    if (/xbox/.test(t))                                keywords.add('Xbox Series X');
    if (/nintendo|switch/.test(t))                     keywords.add('Nintendo Switch');
    if (/airpods/.test(t))                             keywords.add('AirPods');
    if (/apple watch/.test(t))                         keywords.add('Apple Watch');
    if (/\bdrone\b/.test(t))                           keywords.add('drone');
    if (/\bcamera\b/.test(t) && !/hidden camera|doorbell/.test(t)) keywords.add('mirrorless camera');
    if (/pokemon/.test(t))                             keywords.add('Pokemon cards');
    if (/\blego\b/.test(t))                            keywords.add('LEGO');
    if (/jordan|nike.*shoe|adidas.*shoe/.test(t))      keywords.add('Air Jordan sneakers');
    if (/rolex|omega|seiko.*watch/.test(t))            keywords.add('luxury watch');
    if (/gold.*coin|silver.*coin/.test(t))             keywords.add('gold coin');

    // Category fallback when title is generic
    if (!keywords.size) {
      if (c.includes('phone') || c.includes('mobile'))  keywords.add('smartphone');
      else if (c.includes('laptop'))                    keywords.add('laptop');
      else if (c.includes('tablet'))                    keywords.add('tablet');
      else if (c.includes('gaming'))                    keywords.add('gaming console');
      else if (c.includes('card') || c.includes('memorabilia')) keywords.add('trading cards');
    }
  }

  return Array.from(keywords).slice(0, 5);
}
