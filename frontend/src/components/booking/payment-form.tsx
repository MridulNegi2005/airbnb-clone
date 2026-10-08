"use client";
import { useState, type FormEvent } from "react";
import { BriefcaseBusiness, CreditCard, House, Info, ShieldCheck } from "lucide-react";
import { AppImage } from "@/components/ui/app-image";
import type { UserPublic } from "@/types/api";
import { GradientButton } from "@/components/ui/gradient-button";
import { cancellationPolicy, groundRules, houseRules } from "@/lib/constants";
import styles from "./booking.module.css";

type DemoCard = { number: string; expiration: string; cvv: string; zip: string; country: string };
const emptyCard: DemoCard = { number: "", expiration: "", cvv: "", zip: "", country: "India" };

export function PaymentForm({ pending, disabled, error, onConfirm, onComingSoon, host, onMessage }: {
  pending: boolean; disabled: boolean; error: string | null; onConfirm: () => void; onComingSoon: (title: string) => void; host: UserPublic; onMessage: () => void;
}) {
  const [tripType, setTripType] = useState("personal");
  const [card, setCard] = useState<DemoCard>(emptyCard);
  const [formatError, setFormatError] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || pending) return;
    const [month, year] = card.expiration.split("/").map(Number);
    const now = new Date();
    if (!month || year === undefined || month > 12 || month < 1 || new Date(2000 + year, month) <= now) {
      setFormatError("Enter a future expiration date in MM/YY format.");
      return;
    }
    setFormatError(null);
    onConfirm();
  }
  function fillDemo() {
    setCard({ number: "4242 4242 4242 4242", expiration: `12/${String(new Date().getFullYear() + 2).slice(-2)}`, cvv: "123", zip: "560001", country: "India" });
    setFormatError(null);
  }
  return <form onSubmit={submit} className={styles.paymentForm}>
    <section className={styles.section}>
      <h2 id="trip-type-heading">Type of trip</h2>
      <div role="radiogroup" aria-labelledby="trip-type-heading" className={styles.tripTypes}>
        {([['personal', 'Personal', House], ['work', 'Work', BriefcaseBusiness]] as const).map(([value, label, Icon]) => <label className={styles.tripType} key={value}><span className={styles.tripTypeIcon}><Icon size={24} strokeWidth={1.5} aria-hidden="true" /></span><span><strong>{label}</strong>{value === 'work' && <small>No workplace details are shared.</small>}</span><input type="radio" name="trip-type" value={value} checked={tripType === value} disabled={pending} onChange={() => setTripType(value)} /></label>)}
      </div>
    </section>
    <section className={styles.section}>
      <h2>Write a message to the host</h2>
      <p className={styles.hostMessageDescription}>Let {host.name.split(' ')[0]} know a little about your trip and why their place is a good fit.</p>
      <div className={styles.hostMessageRow}>{host.avatar_url ? <AppImage src={host.avatar_url} width={40} height={40} alt="" className={styles.hostAvatar} /> : <span className={styles.hostInitial} aria-hidden="true">{host.name[0]}</span>}<span>{host.name.split(' ')[0]}<small>Hosting since {new Date(host.created_at).getFullYear()}</small></span></div>
      <button type="button" className={styles.messageButton} disabled={pending} onClick={onMessage}>Message the host</button>
    </section>
    <section className={styles.section}>
      <div className={styles.headingRow}><h2>Pay with</h2><CreditCard size={24} strokeWidth={2} aria-hidden="true" /></div>
      <div className={styles.demoBanner}><Info size={22} aria-hidden="true" /><p><strong>Demo checkout.</strong> No real payment is taken. Do not enter real card details.</p></div>
      <button className={styles.textButton} type="button" onClick={fillDemo} disabled={pending}>Use demo details</button>
      <div className={styles.groupedFields}>
        <label className={styles.field}><span>Card number</span><input required disabled={pending} inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" pattern="(?:[0-9] ?){16}" maxLength={19} value={card.number} onChange={event => setCard(current => ({ ...current, number: event.target.value.replace(/[^\d ]/g, "") }))} /></label>
        <div className={styles.fieldPair}>
          <label className={styles.field}><span>Expiration</span><input required disabled={pending} inputMode="numeric" autoComplete="off" placeholder="MM/YY" pattern="[0-9]{2}/[0-9]{2}" maxLength={5} value={card.expiration} onChange={event => setCard(current => ({ ...current, expiration: event.target.value }))} /></label>
          <label className={styles.field}><span>CVV</span><input required disabled={pending} inputMode="numeric" autoComplete="off" placeholder="123" pattern="[0-9]{3,4}" maxLength={4} value={card.cvv} onChange={event => setCard(current => ({ ...current, cvv: event.target.value.replace(/\D/g, "") }))} /></label>
        </div>
      </div>
      <label className={`${styles.field} ${styles.standaloneField}`}><span>ZIP code</span><input required disabled={pending} autoComplete="off" placeholder="560001" maxLength={12} value={card.zip} onChange={event => setCard(current => ({ ...current, zip: event.target.value }))} /></label>
      <label className={`${styles.field} ${styles.standaloneField}`}><span>Country/region</span><select disabled={pending} value={card.country} onChange={event => setCard(current => ({ ...current, country: event.target.value }))}>{["United States", "India", "United Kingdom", "Canada", "Australia"].map(country => <option key={country}>{country}</option>)}</select></label>
      {formatError && <p className={styles.error} role="alert">{formatError}</p>}
      <p className={styles.small}>These fields only validate the demo form. Their values are never sent or saved.</p>
      <div className={styles.alternatives}><button type="button" disabled>PayPal <span>Coming soon</span></button><button type="button" disabled>Google Pay <span>Coming soon</span></button></div>
    </section>
    <section className={styles.section}>
      <h2>Required for your trip</h2>
      <div className={styles.requiredRow}><strong>Phone number</strong><button type="button" className={styles.outlineButton} disabled={pending} onClick={() => onComingSoon("Phone number")}>Add</button></div>
    </section>
    <section className={styles.section}><h2>Cancellation policy</h2><p>{cancellationPolicy}</p></section>
    <section className={styles.section}>
      <div className={styles.headingRow}><h2>Ground rules</h2><ShieldCheck size={24} aria-hidden="true" /></div>
      <p>{groundRules}</p><p className={styles.small}>{houseRules}</p>
      <p className={styles.legal}>By selecting the button below, I agree to the Host&apos;s House Rules and the Ground rules for guests.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <GradientButton type="submit" disabled={disabled || pending} className={styles.confirmButton}>{pending ? <span className={styles.pending} aria-label="Confirming booking">•••</span> : "Confirm and pay"}</GradientButton>
      <p className={styles.small}>Demo reservation only. No payment is taken.</p>
    </section>
  </form>;
}
