import { EbayItem } from './ebay';
import { AuctionSoldResult, AuctionSource, fetchAuctionDeals, searchAuctionSold } from './auction-scraper';

const VISTA: AuctionSource = {
  tag: 'vista',
  origin: 'https://www.vistaauctions.com',
  itemPath: '/items/',
  seller: 'Vista Auction',
  location: 'US',
  category: 'General',
  idKeys: ['id', 'lot_id', 'lotId', 'item_id', 'itemId'],
  priceKeys: ['current_bid', 'currentBid', 'current_price', 'currentPrice', 'startingBid', 'starting_bid', 'price', 'starting_price', 'buy_now_price', 'buyNowPrice', 'retail_price'],
  endKeys: ['end_time', 'endTime', 'ends_at', 'endsAt', 'auction_end', 'closing_time'],
  slugKeys: ['slug', 'id', 'item_id'],
  urlKeys: ['url', 'item_url', 'link', 'listing_url'],
  categoryKeys: ['category', 'category_name', 'productType', 'product_type'],
  soldFallbackKeys: ['current_price', 'currentPrice'],
  liveUrls: [
    'https://www.vistaauctions.com/api/items?status=active&per_page=50',
    'https://www.vistaauctions.com/api/lots?active=true&per_page=50',
    'https://www.vistaauctions.com/api/items?condition=like_new&status=active',
    'https://www.vistaauctions.com/api/search?status=active&limit=50',
    'https://www.vistaauctions.com/api/v1/items?active=true&per_page=50',
  ],
  soldUrls: (q) => [
    `https://www.vistaauctions.com/api/items?query=${q}&status=sold&per_page=20`,
    `https://www.vistaauctions.com/api/lots?query=${q}&status=ended&per_page=20`,
    `https://www.vistaauctions.com/api/search?q=${q}&status=completed&limit=20`,
  ],
};

export const searchVistaAuctionSold = (query: string): Promise<AuctionSoldResult | null> => searchAuctionSold(VISTA, query);
export const fetchVistaAuctionDeals = (): Promise<EbayItem[]> => fetchAuctionDeals(VISTA);
