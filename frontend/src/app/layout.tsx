import type { Metadata } from "next";
import { AppProviders } from "@/providers/app-providers";
import { SiteShell } from "@/components/layout/site-shell";
import { preconnect, preload } from "react-dom";
import "./globals.css";

export const metadata:Metadata={title:{default:"Airbnb clone | Find your next stay",template:"%s | Airbnb clone"},description:"Explore places to stay, save your favourites, and plan your next trip. An independent Airbnb demo project."};

const fontUrl = "https://a0.muscache.com/airbnb/static/airbnb-dls-web/build/fonts/cereal-variable/AirbnbCerealVF_W_Wght.8816d9e5c3b6a860636193e36b6ac4e4.woff2";

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  preconnect("https://a0.muscache.com", { crossOrigin: "anonymous" });
  preconnect("https://images.unsplash.com");
  preload(fontUrl, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return <html lang="en" suppressHydrationWarning><body><a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a><AppProviders><SiteShell>{children}</SiteShell></AppProviders></body></html>;
}
