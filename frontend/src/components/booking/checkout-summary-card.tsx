import type { ReactNode } from "react";
import { AppImage as Image } from "@/components/ui/app-image";
import { Star, Award } from "lucide-react";
import type { ListingDetail, PriceQuote } from "@/types/api";
import { formatPrice, formatRating, plural } from "@/lib/format";
import styles from "./booking.module.css";

export function CheckoutSummaryCard({ listing, quote, loading, error, onRetry, onPolicy, children }: {
  listing: ListingDetail; quote: PriceQuote | undefined; loading: boolean; error: string | null; onRetry: () => void; onPolicy: () => void; children?: ReactNode;
}) {
  const cover = listing.image_urls[0];
  return <aside className={styles.summary} aria-label="Booking summary">
    <div className={styles.property}>
      <div className={styles.propertyPhoto}>{cover ? <Image src={cover} alt={listing.title} fill sizes="96px" /> : <span>No photo available</span>}</div>
      <div className={styles.propertyText}>
        <p>{listing.title}</p>
        <div className={styles.rating}><Star size={12} fill="currentColor" aria-hidden="true" /><span>{formatRating(listing.rating)} {listing.review_count > 0 && `(${listing.review_count})`}</span></div>
        {listing.host.is_superhost && <div className={styles.rating}><Award size={12} aria-hidden="true" />Superhost</div>}
      </div>
    </div>
    <p className={styles.policy}>Cancel before check-in. <button type="button" className={styles.textButton} onClick={onPolicy}>Full policy</button></p>
    {children}
    <div className={styles.priceDetails}>
      <h2>Price details</h2>
      {loading ? <div aria-busy="true" aria-label="Loading price">{[1, 2, 3].map(key => <div key={key} className={`${styles.skeleton} ${styles.priceSkeleton}`} />)}</div> : error ? <div role="alert"><p className={styles.error}>{error}</p><button type="button" className={styles.textButton} onClick={onRetry}>Try again</button></div> : quote ? <div className={styles.quote} key={`${quote.nights}-${quote.total}`}>
        <div className={styles.priceRow}><span>{formatPrice(quote.nightly_rate)} x {plural(quote.nights, "night")}</span><span>{formatPrice(quote.subtotal)}</span></div>
        {quote.discount > 0 && <div className={`${styles.priceRow} ${styles.discount}`}><span>Weekly stay discount</span><span>−{formatPrice(quote.discount)}</span></div>}
        {quote.cleaning_fee > 0 && <div className={styles.priceRow}><span>Cleaning fee</span><span>{formatPrice(quote.cleaning_fee)}</span></div>}
        <div className={styles.priceRow}><span>Airbnb service fee</span><span>{formatPrice(quote.service_fee)}</span></div>
        <div className={`${styles.priceRow} ${styles.total}`}><span>Total before taxes</span><span>{formatPrice(quote.total)}</span></div>
      </div> : <p className={styles.secondary}>Add your travel dates for exact pricing.</p>}
    </div>
  </aside>;
}
