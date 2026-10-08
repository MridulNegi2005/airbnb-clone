import type { Metadata } from "next";
import { AppProviders } from "@/providers/app-providers";
import { SiteShell } from "@/components/layout/site-shell";
import "./globals.css";

export const metadata:Metadata={title:{default:"Airbnb clone | Find your next stay",template:"%s | Airbnb clone"},description:"Explore places to stay, save your favourites, and plan your next trip. An independent Airbnb demo project."};
const themeScript="try{var t=localStorage.getItem('theme')||'light';var m=matchMedia('(prefers-color-scheme: dark)');function sync(){if(t==='system')document.documentElement.classList.toggle('dark',m.matches)}document.documentElement.classList.toggle('dark',t==='dark'||(t==='system'&&m.matches));m.addEventListener('change',function(){t=localStorage.getItem('theme')||'light';sync()})}catch(e){}";
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en" suppressHydrationWarning><head><link rel="preconnect" href="https://a0.muscache.com" crossOrigin="anonymous"/><link rel="preload" href="https://a0.muscache.com/airbnb/static/airbnb-dls-web/build/fonts/cereal-variable/AirbnbCerealVF_W_Wght.8816d9e5c3b6a860636193e36b6ac4e4.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/><script dangerouslySetInnerHTML={{__html:themeScript}}/></head><body><a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a><AppProviders><SiteShell>{children}</SiteShell></AppProviders></body></html>;}
