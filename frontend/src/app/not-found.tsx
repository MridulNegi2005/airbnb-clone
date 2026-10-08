import Link from "next/link";
import { MapPinOff } from "lucide-react";
export default function NotFound(){return <section className="content-shell not-found-page"><div><h1>Oops!</h1><p className="not-found-message">We can&apos;t seem to find the page you&apos;re looking for.</p><p className="small muted">Error code: 404</p><nav aria-label="Helpful links"><Link href="/">Home</Link><Link href="/trips">Trips</Link><Link href="/coming-soon">Help Centre</Link></nav></div><MapPinOff className="not-found-illustration" size={200} strokeWidth={1} aria-hidden="true"/></section>;}
