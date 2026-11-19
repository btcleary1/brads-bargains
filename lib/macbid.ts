import { EbayItem } from './ebay';
import { AuctionSoldResult, AuctionSource, fetchAuctionDeals, searchAuctionSold } from './auction-scraper';

const MACBID: AuctionSource = {
  tag: 'macbid',
  origin: 'https://mac.bid',
  itemPath: '/lot/',
  seller: 'Mac.bid',
  location: 'SC, US',
  category: 'Electronics',
  idKeys: ['id', 'lot_id', 'lotId', 'item_id'],
  priceKeys: ['current_bid', 'currentBid', 'current_price', 'currentPrice', 'startingBid', 'starting_bid', 'price', 'starting_price', 'buy_now_price', 'buyNowPrice'],
  endKeys: ['end_time', 'endTime', 'ends_at', 'endsAt', 'closingTime'],
  slugKeys: ['slug', 'id', 'lot_id'],
  urlKeys: ['url', 'item_url', 'listing_url'],
  categoryKeys: ['category', 'productType', 'product_type', 'category_name'],
  soldFallbackKeys: ['current_bid', 'currentBid'],
  liveUrls: [
    'https://mac.bid/api/lots?active=true&per_page=50',
    'https://mac.bid/api/search?query=&active=true&page=1&per_page=50',
    'https://mac.bid/api/lots?status=active&per_page=50',
    'https://mac.bid/api/v1/lots?active=true&per_page=50',
    'https://mac.bid/api/auctions?active=true&per_page=50',
  ],
  soldUrls: (q) => [
    `https://mac.bid/api/search?query=${q}&status=ended&per_page=20`,
    `https://mac.bid/api/lots?query=${q}&status=completed&per_page=20`,
    `https://mac.bid/api/search?query=${q}&active=false&per_page=20`,
  ],
};

export const searchMacBidSold = (query: string): Promise<AuctionSoldResult | null> => searchAuctionSold(MACBID, query);
export const fetchMacBidDeals = (): Promise<EbayItem[]> => fetchAuctionDeals(MACBID);
