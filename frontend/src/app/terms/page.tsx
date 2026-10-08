import type { Metadata } from "next";
import styles from "@/components/legal/legal-page.module.css";

export const metadata: Metadata = { title: "Terms of Service | Airbnb clone" };

export default function TermsPage() {
  return <article className={styles.page}>
    <h1>Terms of Service</h1>
    <p className={styles.updated}>Last updated: 8 October 2026</p>
    <p>Demo project for a hiring assignment. Not affiliated with Airbnb.</p>
    <h2>A demonstration of booking features</h2>
    <p>This website is a demo. Listings and bookings do not provide real stays, and the payment flow does not process real payments. Do not use it to arrange accommodation or submit real payment details.</p>
    <h2>Demo content and availability</h2>
    <p>Content and accounts may be reset at any time. Features may change or be unavailable. Use the demo at your own risk.</p>
    <h2>Responsible use</h2>
    <p>Use sample information when trying the demo, respect other users, and do not upload sensitive identity documents or unlawful content.</p>
  </article>;
}
