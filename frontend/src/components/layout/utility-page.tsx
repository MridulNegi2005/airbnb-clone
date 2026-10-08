import Link from "next/link";
import { MessageCircle, ShieldCheck, Compass } from "lucide-react";
export function UtilityPage({title,description,icon="compass"}: {title:string;description:string;icon?:"messages"|"shield"|"compass"}) {const Icon=icon==="messages"?MessageCircle:icon==="shield"?ShieldCheck:Compass;return <section className="utility-page content-shell"><Icon size={64} strokeWidth={1.5}/><h1>{title}</h1><p>{description}</p><Link href="/" className="dark-button">Back to home</Link></section>;}
