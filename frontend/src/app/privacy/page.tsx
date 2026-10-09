import type { Metadata } from "next";
import styles from "@/components/legal/legal-page.module.css";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@mridulnegi.dev";
  return <article className={styles.page}>
    <h1>Privacy Policy</h1>
    <p className={styles.updated}>Last updated: 8 October 2026</p>
    <p>Demo project for a hiring assignment. Not affiliated with Airbnb.</p>
    <h2>What we collect</h2>
    <p>We collect the name, email and profile photo you provide through email or Google sign-in, along with your listings, bookings, messages and uploaded photos.</p>
    <h2>Why we collect it</h2>
    <p>We use this information to run the demo booking features, show your profile, manage listings and let guests and hosts communicate.</p>
    <h2>Where information is stored</h2>
    <p>Information is stored on our server. Google Cloud may store uploaded media and provides Google sign-in and map services.</p>
    <h2>Sharing and location privacy</h2>
    <p>We never sell your information. Hosts can see a guest’s name and trip details. Exact property addresses are shown only after booking; public maps show approximate locations.</p>
    <p>Uploaded photos have their location metadata removed before they are stored.</p>
    <h2>Request deletion</h2>
    <p>Email the site owner at <a href={`mailto:${contactEmail}`}>{contactEmail}</a> to request deletion of your information.</p>
  </article>;
}
