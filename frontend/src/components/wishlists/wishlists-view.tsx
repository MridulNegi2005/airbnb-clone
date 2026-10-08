"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Heart, MoreHorizontal, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { createWishlist, deleteWishlist, getSavedListings, getWishlist, getWishlists, queryKeys, renameWishlist } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { AppImage } from "@/components/ui/app-image";
import { Modal } from "@/components/ui/modal";
import { GradientButton } from "@/components/ui/gradient-button";
import { ListingCard } from "@/components/listings/listing-card";
import { WishlistMap } from "@/components/maps";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import type { SavedListing, WishlistSummary } from "@/types/api";
import styles from "./wishlists.module.css";

export function WishlistsView({id}:{id?:number}){
  const {status,openAuth}=useAuth();const client=useQueryClient(),router=useRouter();const prompted=useRef(false);
  const operationPending=useRef(false),cooldown=useApiCooldown();
  const optionsButton=useRef<HTMLButtonElement>(null),optionsMenu=useRef<HTMLDivElement>(null),firstOption=useRef<HTMLButtonElement>(null);
  const menuId=useId();
  const [menu,setMenu]=useState(false),[mode,setMode]=useState<"create"|"rename"|"delete"|null>(null),[name,setName]=useState(""),[pending,setPending]=useState(false),[error,setError]=useState("");
  const lists=useQuery({queryKey:queryKeys.wishlists,queryFn:({signal})=>getWishlists(signal),enabled:status==="authenticated"&&id===undefined});
  const detail=useQuery({queryKey:queryKeys.wishlistDetail(id??0),queryFn:({signal})=>getWishlist(id!,signal),enabled:status==="authenticated"&&id!==undefined});
  const saved=useQuery({queryKey:queryKeys.savedListings,queryFn:({signal})=>getSavedListings(signal),enabled:status==="authenticated"&&id!==undefined});
  useEffect(()=>{if(status==="anonymous"&&!prompted.current){prompted.current=true;openAuth();}},[status,openAuth]);
  useEffect(()=>{
    if(!menu)return;
    firstOption.current?.focus();
    function close(){setMenu(false);optionsButton.current?.focus();}
    function pointer(event:PointerEvent){if(event.target instanceof Node&&!optionsMenu.current?.contains(event.target))close();}
    function key(event:KeyboardEvent){if(event.key==="Escape"){event.preventDefault();close();}}
    document.addEventListener("pointerdown",pointer);
    document.addEventListener("keydown",key);
    return()=>{document.removeEventListener("pointerdown",pointer);document.removeEventListener("keydown",key);};
  },[menu]);
  function open(action:"create"|"rename"|"delete"){if(menu)optionsButton.current?.focus();setMode(action);setName(action==="rename"?detail.data?.name??"":"");setError("");setMenu(false);}
  async function submit(){
    if(operationPending.current||cooldown.blocked||mode===null||(mode!=="delete"&&!name.trim()))return;
    operationPending.current=true;setPending(true);setError("");
    try{
      if(mode==="delete"&&id!==undefined){
        await deleteWishlist(id);
        await client.cancelQueries({queryKey:queryKeys.savedListings});
        client.setQueryData<SavedListing[]>(queryKeys.savedListings,current=>(current??[]).filter(item=>item.wishlist_id!==id));
        client.setQueryData<WishlistSummary[]>(queryKeys.wishlists,current=>(current??[]).filter(item=>item.id!==id));
        client.removeQueries({queryKey:queryKeys.wishlistDetail(id),exact:true});
        setMode(null);toast("Wishlist deleted");router.push("/wishlists");
      }
      else if(mode==="rename"&&id!==undefined){
        const updated=await renameWishlist(id,{name:name.trim()});
        client.setQueryData(queryKeys.wishlistDetail(id),updated);
        client.setQueryData<WishlistSummary[]>(queryKeys.wishlists,current=>current?.map(list=>list.id===id?{...list,name:updated.name}:list));
        toast("Wishlist renamed");setMode(null);
      }
      else if(mode==="create"){
        const list=await createWishlist({name:name.trim()});
        client.setQueryData(queryKeys.wishlistDetail(list.id),list);
        setMode(null);toast("Wishlist created");router.push(`/wishlists/${list.id}`);
      }
      await Promise.all([client.invalidateQueries({queryKey:queryKeys.wishlists}),client.invalidateQueries({queryKey:queryKeys.savedListings})]);
    }catch(reason){cooldown.record(reason);const text=reason instanceof Error?reason.message:"Could not update your wishlist.";setError(text);toast.error(text);}finally{operationPending.current=false;setPending(false);}
  }
  if(status==="loading")return <Loading/>;
  if(status==="anonymous")return <section className={`page-shell ${styles.page}`}><h1>Wishlists</h1><div className={styles.empty}><Heart size={48}/><h2>Log in to view your wishlists</h2><p>Save your favourite places and plan your next getaway.</p><button className="dark-button" onClick={()=>openAuth()}>Log in</button></div></section>;
  const query=id===undefined?lists:detail;
  if(query.isPending)return <Loading/>;
  if(query.isError)return <section className={`page-shell ${styles.page}`}><h1>Wishlists</h1><div className={styles.empty} role="alert"><h2>We couldn&apos;t load your wishlists</h2><p>{query.error.message}</p><button className="outline-button" onClick={()=>void query.refetch()}>Try again</button><Link href="/wishlists" className="text-button">Back to wishlists</Link></div></section>;
  const places=(detail.data?.listings??[]).filter(listing=>saved.data===undefined||saved.data.some(item=>item.wishlist_id===id&&item.listing_id===listing.id));
  return <section className={`page-shell ${styles.page}`}>
    <header className={styles.heading}>{id!==undefined&&<Link href="/wishlists" className="icon-button" aria-label="Back to wishlists"><ArrowLeft size={20}/></Link>}<h1>{id===undefined?"Wishlists":detail.data?.name}</h1>{id===undefined?<button className="outline-button" onClick={()=>open("create")}><Plus size={18}/>Create wishlist</button>:<div className={styles.menu} ref={optionsMenu}><button ref={optionsButton} type="button" className="icon-button" aria-label="Wishlist options" aria-expanded={menu} aria-haspopup="menu" aria-controls={menu?menuId:undefined} onKeyDown={event=>{if(event.key==="ArrowDown"){event.preventDefault();setMenu(true);}}} onClick={()=>setMenu(value=>!value)}><MoreHorizontal size={22}/></button>{menu&&<div id={menuId} role="menu" aria-label="Wishlist options" onKeyDown={event=>{const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]"));const current=items.indexOf(document.activeElement as HTMLButtonElement);let next:number|undefined;if(event.key==="ArrowDown")next=(current+1)%items.length;if(event.key==="ArrowUp")next=(current-1+items.length)%items.length;if(event.key==="Home")next=0;if(event.key==="End")next=items.length-1;if(next!==undefined){event.preventDefault();items[next]?.focus();}}}><button ref={firstOption} type="button" role="menuitem" tabIndex={-1} onClick={()=>open("rename")}>Rename</button><button type="button" role="menuitem" tabIndex={-1} onClick={()=>open("delete")}>Delete wishlist</button></div>}</div>}</header>
    {id===undefined?lists.data?.length?<div className={styles.collections}>{lists.data.map(list=><Link href={`/wishlists/${list.id}`} key={list.id} className={styles.collection}><div className="wishlist-cover">{list.cover_image_url?<AppImage src={list.cover_image_url} alt="" fill sizes="(max-width:743px) 80vw, 320px"/>:<Heart size={48}/>}</div><h2>{list.name}</h2><p>{list.item_count} saved</p></Link>)}</div>:<div className={styles.empty}><Heart size={48}/><h2>Your next trip starts here</h2><p>Tap the heart on a place you love to save it to a wishlist.</p><Link href="/" className="dark-button">Start exploring</Link></div>:places.length?<div className={styles.split}><div className={`listing-grid ${styles.grid}`}>{places.map(listing=><ListingCard key={listing.id} listing={listing}/>)}</div><aside className={styles.map}><WishlistMap listings={places}/></aside></div>:<div className={styles.empty}><Heart size={48}/><h2>Find a place you love</h2><p>Your saved places will appear here.</p><Link href="/" className="dark-button">Start exploring</Link></div>}
    <Modal open={mode!==null} onClose={()=>{if(!pending)setMode(null);}} title={mode==="delete"?"Delete this wishlist?":mode==="rename"?"Rename wishlist":"Create wishlist"}>
      {mode==="delete"?<div className={styles.confirm}><p>This deletes the wishlist and removes its saved places from this collection.</p><button className="outline-button" disabled={pending} onClick={()=>setMode(null)}>Keep wishlist</button><button className={styles.danger} disabled={pending||cooldown.blocked} onClick={()=>void submit()}>{pending?"Deleting…":"Delete wishlist"}</button></div>:<form className="wishlist-name-form" onSubmit={event=>{event.preventDefault();void submit();}}><label htmlFor="wishlist-name">Wishlist name</label><input id="wishlist-name" autoFocus required maxLength={50} value={name} onChange={event=>setName(event.target.value)}/><span className="muted small">{name.length}/50</span><GradientButton disabled={pending||cooldown.blocked||!name.trim()}>{pending?"Saving…":mode==="rename"?"Save":"Create"}</GradientButton></form>}{error&&<p className="error-text" role="alert">{error}</p>}
    </Modal>
  </section>;
}
function Loading(){return <section className={`page-shell ${styles.page}`} aria-busy="true"><h1>Wishlists</h1><div className={styles.collections}>{[0,1,2].map(item=><div key={item}><div className={`skeleton ${styles.coverSkeleton}`}/><div className="skeleton" style={{marginTop:16,width:140}}/></div>)}</div></section>;}


