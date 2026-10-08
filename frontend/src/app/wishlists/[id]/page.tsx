import { notFound } from "next/navigation";
import { WishlistsView } from "@/components/wishlists/wishlists-view";
export const metadata = { title: "Saved places" };
export default async function WishlistPage({params}:{params:Promise<{id:string}>}){const {id}=await params;const value=Number(id);if(!Number.isSafeInteger(value)||value<1)notFound();return <WishlistsView id={value}/>;}
