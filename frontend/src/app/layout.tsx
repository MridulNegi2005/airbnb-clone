import type { Metadata } from "next";
import { AppProviders } from "@/providers/app-providers";
import { SiteShell } from "@/components/layout/site-shell";
import "./globals.css";

export const metadata:Metadata={title:{default:"Airbnb clone | Find your next stay",template:"%s | Airbnb clone"},description:"Explore places to stay, save your favourites, and plan your next trip. An independent Airbnb demo project."};
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || "https://airbnb-api.mridulnegi.dev").origin;

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en" suppressHydrationWarning><head><link rel="preconnect" href="https://a0.muscache.com" crossOrigin="anonymous"/><link rel="preconnect" href={apiOrigin} crossOrigin="anonymous"/><link rel="preload" href="https://a0.muscache.com/airbnb/static/airbnb-dls-web/build/fonts/cereal-variable/AirbnbCerealVF_W_Wght.8816d9e5c3b6a860636193e36b6ac4e4.woff2" as="font" type="font/woff2" crossOrigin="anonymous"/></head><body><a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a><AppProviders><SiteShell>{children}</SiteShell></AppProviders></body></html>;}
