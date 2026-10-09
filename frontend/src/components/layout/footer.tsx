import Link from "next/link";
import { Facebook, Globe, Instagram } from "lucide-react";
import styles from "./footer.module.css";

const groups=[
  {title:"Support",links:["Help Centre","Get help with a safety issue","AirCover","Anti-discrimination","Disability support","Cancellation options","Report neighbourhood concern"]},
  {title:"Hosting",links:["Airbnb your home","Airbnb your experience","Airbnb your service","AirCover for Hosts","Hosting resources","Community forum","Hosting responsibly","Join a free hosting class","Find a co-host","Refer a host"]},
  {title:"Airbnb",links:["2026 Summer Release","Newsroom","Careers","Investors","Airbnb.org emergency stays"]},
];

export function Footer(){
  return <footer className={`site-footer ${styles.footer}`}>
    <div className={styles.container}>
      <h2 className="sr-only">Site footer</h2>
      <div className={styles.columns}>{groups.map(group=><section key={group.title} aria-label={group.title}><h3>{group.title}</h3><ul>{group.links.map(label=><li key={label}><Link href={label==="Airbnb your home"?"/hosting/listings/new":"/coming-soon"}>{label}</Link></li>)}</ul></section>)}</div>
      <div className={styles.bottom}>
        <div className={styles.legal}><span>© {new Date().getFullYear()} Airbnb, Inc.</span><span aria-hidden="true">·</span><Link href="/privacy">Privacy</Link><span aria-hidden="true">·</span><Link href="/terms">Terms</Link><span aria-hidden="true">·</span><Link href="/coming-soon">Company details</Link></div>
        <div className={styles.settings}><Link href="/coming-soon"><Globe size={16}/>English (IN)</Link><Link href="/coming-soon"><span>₹</span>INR</Link><div className={styles.socials}><Link href="/coming-soon" aria-label="Facebook"><Facebook size={16} fill="currentColor"/></Link><Link href="/coming-soon" aria-label="X"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 3h4l12 18h-4L4 3Zm16 0L4 21" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></Link><Link href="/coming-soon" aria-label="Instagram"><Instagram size={16}/></Link></div></div>
      </div>
    </div>
  </footer>;
}
