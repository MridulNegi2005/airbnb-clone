"use client";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { SearchBar } from "@/components/search/search-bar";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Globe, Heart, Menu, Search, UserRound, CircleUserRound, Plane, House, Mail, CircleHelp, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useUnreadCount } from "@/hooks/use-unread-count";
import { formatDateRange, plural } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { AppImage } from "@/components/ui/app-image";
import styles from "./site-shell.module.css";
import { Footer } from "./footer";
import { BrandLogo } from "./brand-logo";
import { CompactSearchContent } from "./compact-search-content";
import { useAfterPageLoad } from "@/hooks/use-after-page-load";


function SearchTypeIcon({asset,selected,active,video}:{asset:string;selected:string;active:boolean;video:string}) {
  const [ready,setReady]=useState(false);
  const [videoReady,setVideoReady]=useState(false),[selectionReady,setSelectionReady]=useState(false),[selectedPlayed,setSelectedPlayed]=useState(false);
  const art=useRef<HTMLSpanElement>(null);
  const twirl=useRef<HTMLVideoElement>(null),selection=useRef<HTMLVideoElement>(null),lastActive=useRef(active);
  const videosAllowed=useAfterPageLoad();
  const videoRoot="https://a0.muscache.com/videos/search-bar-icons/";
  const twirlSource=video==="globe"?`${videoRoot}unified/webm/Globe_Twirl_On_180px_01.webm`:`${videoRoot}webm/${video}-twirl.webm`;
  const selectedSource=video==="globe"?`${videoRoot}unified/webm/Globe_Selected_180px_01.webm`:`${videoRoot}webm/${video}-selected.webm`;
  useEffect(()=>{if(videosAllowed&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches)void twirl.current?.play().catch(()=>{});},[videosAllowed]);
  useEffect(()=>{if(lastActive.current!==active&&active&&!window.matchMedia("(prefers-reduced-motion: reduce)").matches&&selection.current){selection.current.currentTime=0;void selection.current.play().catch(()=>{});const frame=requestAnimationFrame(()=>setSelectedPlayed(true));lastActive.current=active;return()=>cancelAnimationFrame(frame);}lastActive.current=active;},[active]);
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{
      const image=art.current?.querySelectorAll("img")[active?1:0];
      if(image?.complete&&image.naturalWidth)setReady(true);
    });
    return()=>cancelAnimationFrame(frame);
  },[active]);
  return <span ref={art} className={styles.tabArt}><span className={`${styles.tabMotion} ${ready?styles.tabReady:""}`} data-video-ready={videoReady} data-selected-video={active&&selectedPlayed&&selectionReady}><AppImage className={styles.tabDefault} src={`https://a0.muscache.com/im/pictures/${asset}?im_w=240`} width={72} height={72} alt="" unoptimized loading="eager" onLoad={()=>{if(!active)setReady(true);}}/><AppImage className={styles.tabSelected} src={`https://a0.muscache.com/im/pictures/${selected}?im_w=240`} width={72} height={72} alt="" unoptimized loading="eager" onLoad={()=>{if(active)setReady(true);}}/><video ref={twirl} className={styles.tabTwirl} src={videosAllowed?twirlSource:undefined} width={72} height={72} muted playsInline preload="auto" aria-hidden="true" onLoadedData={()=>{setVideoReady(true);setReady(true);}}/><video ref={selection} className={styles.tabSelection} onLoadedData={()=>setSelectionReady(true)} src={videosAllowed?selectedSource:undefined} width={72} height={72} muted playsInline preload="auto" aria-hidden="true"/></span></span>;
}

function Header({hosting=false}:{hosting?:boolean}) {
  const params=useSearchParams(),router=useRouter(),path=usePathname();
  const homepage=path==="/"&&!params.size;
  const searchResults=path==="/"&&!homepage;
  const inbox=path.startsWith("/messages");
  const detail=path.startsWith("/rooms/");
  const profileEditor=path.startsWith("/account/profile");
  const publicProfile=path.startsWith("/users/");
  const trips=path==="/trips";
  const wishlists=path.startsWith("/wishlists");
  const wishlistDetail=wishlists&&path!=="/wishlists";
  const roundProfile=homepage||searchResults||inbox||detail||profileEditor||publicProfile||trips||wishlists;
  const [homeTab,setHomeTab]=useState("All");
  const [scrolled,setScrolled]=useState(false);
  useEffect(()=>{if(!homepage)return;const scroll=()=>setScrolled(window.scrollY>0&&window.innerWidth>=744);const frame=requestAnimationFrame(scroll);window.addEventListener("scroll",scroll,{passive:true});window.addEventListener("resize",scroll);return()=>{cancelAnimationFrame(frame);window.removeEventListener("scroll",scroll);window.removeEventListener("resize",scroll);};},[homepage]);
  const {user,isHost,openAuth,logout}=useAuth(); const unread=useUnreadCount();
  const [searchOpen,setSearchOpen]=useState(false),[menuOpen,setMenuOpen]=useState(false),[regionOpen,setRegionOpen]=useState(false);
  const [hostTab,setHostTab]=useState("today"); const menu=useRef<HTMLDivElement>(null);const menuTrigger=useRef<HTMLButtonElement>(null);
  const closeSearch=useCallback(()=>setSearchOpen(false),[]),closeRegion=useCallback(()=>setRegionOpen(false),[]);
  useEffect(()=>{
    if(!menuOpen)return;
    const frame=requestAnimationFrame(()=>menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({preventScroll:true}));
    const pointer=(event:PointerEvent)=>{if(event.target instanceof Node&&!menu.current?.contains(event.target))setMenuOpen(false);};
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){setMenuOpen(false);menuTrigger.current?.focus({preventScroll:true});}
      if(event.key==="ArrowDown"||event.key==="ArrowUp"){
        const options=Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')??[]);
        const current=options.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();options[(current+(event.key==="ArrowDown"?1:-1)+options.length)%options.length]?.focus({preventScroll:true});
      }
    };
    document.addEventListener("pointerdown",pointer);document.addEventListener("keydown",key);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener("pointerdown",pointer);document.removeEventListener("keydown",key);};
  },[menuOpen]);
  const checkIn=params.get("checkin"),checkOut=params.get("checkout"),guestCount=Number(params.get("adults")??0)+Number(params.get("children")??0);
  function host(){const route=isHost?"/hosting":"/hosting/listings/new";if(user)router.push(route);else openAuth(()=>router.push(route));}
  const tabs=[{name:"All",video:"globe",asset:"AirbnbPlatformAssets/AirbnbPlatformAssets-search-bar-icons/original/f50ce552-509c-4f54-af4c-605c5220d906.png",selected:"AirbnbPlatformAssets/AirbnbPlatformAssets-search-bar-icons/original/a811de29-114f-43a0-b8c5-698d4564bd04.png"},{name:"Homes",video:"house",asset:"airbnb-platform-assets/AirbnbPlatformAssets-search-bar-icons/original/a32adab1-f9df-47e1-a411-bdff91b579c3.png",selected:"airbnb-platform-assets/AirbnbPlatformAssets-search-bar-icons/original/4aae4ed7-5939-4e76-b100-e69440ebeae4.png"},{name:"Experiences",video:"balloon",asset:"airbnb-platform-assets/AirbnbPlatformAssets-search-bar-icons/original/e47ab655-027b-4679-b2e6-df1c99a5c33d.png",selected:"airbnb-platform-assets/AirbnbPlatformAssets-search-bar-icons/original/1e24b1c9-b070-48d9-8a70-91aae3151830.png"},{name:"Services",video:"consierge",asset:"airbnb-platform-assets/AirbnbPlatformAssets-search-bar-icons/original/3d67e9a9-520a-49ee-b439-7b3a75ea814d.png",selected:"airbnb-platform-assets/AirbnbPlatformAssets-search-bar-icons/original/2bf5d36d-e731-4465-a8ef-91abbf2ae8ce.png"}];
  const homeSearchActive=useCallback((active:boolean)=>setSearchOpen(active),[]);
  const collapsed=homepage&&scrolled&&!searchOpen;
  return <><header className={`${hosting?"site-header hosting-header":"site-header"} ${homepage?`${styles.homeHeader} ${scrolled&&!searchOpen?styles.homeCollapsed:""}`:inbox?styles.inboxHeader:detail||searchResults||profileEditor||publicProfile||trips||wishlists?styles.detailHeader:""} ${wishlistDetail?styles.wishlistDetailHeader:""} ${profileEditor||publicProfile||trips||wishlists?styles.utilityHeader:""}`}>{homepage&&<div className={styles.headerSurface} aria-hidden="true"/>}<div className="header-main page-shell">
    <BrandLogo/>
    {homepage?<nav className={styles.homeTabs} aria-label="Search type" aria-hidden={scrolled&&!searchOpen} inert={scrolled&&!searchOpen}>{tabs.map(tab=><button key={tab.name} type="button" aria-pressed={homeTab===tab.name} onClick={()=>{setHomeTab(tab.name);if(tab.name==="Experiences"||tab.name==="Services")toast(`${tab.name} are coming soon`);}}><SearchTypeIcon video={tab.video} asset={tab.asset} selected={tab.selected} active={homeTab===tab.name}/><span>{tab.name}</span></button>)}<span className={styles.tabUnderline} aria-hidden="true"><span/><span/><span/></span></nav>:inbox||profileEditor||publicProfile||trips||wishlists?null:hosting?<nav className="hosting-nav" aria-label="Hosting navigation"><Link href="/hosting#host-reservations" aria-current={hostTab==="today"?"page":undefined} onClick={()=>setHostTab("today")}>Today</Link><Link href="/hosting/calendar">Calendar</Link><Link href="/hosting#host-listings" aria-current={hostTab==="listings"?"page":undefined} onClick={()=>setHostTab("listings")}>Listings</Link><Link href="/messages">Messages</Link></nav>:searchOpen?<nav className="search-stays-tabs" aria-label="Search type"><button type="button">Stays</button><button type="button" className="muted" onClick={()=>toast("Experiences are coming soon")}>Experiences</button></nav>:<button className={`compact-search ${styles.compactPill}`} onClick={()=>setSearchOpen(true)} aria-expanded={searchOpen}><CompactSearchContent location={params.get("location")||"Anywhere"} dates={checkIn&&checkOut?formatDateRange(checkIn,checkOut):"Anytime"} guests={guestCount?plural(guestCount,"guest"):"Add guests"}/></button>}
    {homepage&&<><div className={styles.searchSurface} aria-hidden="true"/><button type="button" className={styles.homeCompact} aria-hidden={!collapsed} inert={!collapsed} tabIndex={collapsed?0:-1} aria-label="Start your search" aria-expanded={searchOpen} onClick={()=>setSearchOpen(true)}><CompactSearchContent/></button></>}
    <div className="header-actions" ref={menu}>
      <button className="host-link" type="button" onClick={hosting?()=>router.push("/"):host}>{hosting?"Switch to travelling":roundProfile?"Become a host":isHost?"Switch to hosting":"Airbnb your home"}</button>
      {!roundProfile&&<button type="button" className="icon-button" aria-label="Language and region" onClick={()=>setRegionOpen(true)}><Globe size={18}/></button>}
      {roundProfile&&<button className={styles.profileButton} type="button" aria-label={user?"Profile":"Log in"} onClick={()=>user?router.push(`/users/${user.id}`):openAuth()}>{user?.avatar_url?<AppImage src={user.avatar_url} width={40} height={40} alt=""/>:user?<span>{user.name.split(" ").map(part=>part[0]).slice(0,2).join("")}</span>:<CircleUserRound size={24}/>}</button>}
      <button ref={menuTrigger} type="button" className="user-menu-button" aria-label={unread?`Main menu, ${unread} unread messages`:"Main menu"} aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(value=>!value)}><Menu size={16}/>{!roundProfile&&<span className="user-avatar">{user?user.name.split(" ").map(part=>part[0]).slice(0,2).join(""):<UserRound size={22}/>}</span>}{unread>0&&<span className="unread-badge">{unread>99?"99+":unread}</span>}</button>
      {menuOpen&&<div className="user-dropdown" role="menu" onClick={()=>setMenuOpen(false)}>{user?<>
        <Link role="menuitem" href="/messages"><strong>Messages{unread?` (${unread})`:""}</strong></Link><Link role="menuitem" href="/trips"><strong>Trips</strong></Link><Link role="menuitem" href="/wishlists"><strong>Wishlists</strong></Link><hr/>
        <Link role="menuitem" href={isHost?"/hosting":"/hosting/listings/new"}>{isHost?"Manage listings":"Airbnb your home"}</Link><Link role="menuitem" href={`/users/${user.id}`}>Profile</Link><Link role="menuitem" href="/account">Account</Link>
        <Link role="menuitem" href="/coming-soon">Help Centre</Link><button role="menuitem" onClick={()=>{logout();router.push("/");}}>Log out</button>
      </>:<><button role="menuitem" onClick={()=>setRegionOpen(true)}><Globe size={16}/>Languages &amp; currency</button><Link role="menuitem" href="/coming-soon"><CircleHelp size={16}/>Help Centre</Link><hr/><button role="menuitem" className={styles.menuHost} onClick={host}><span><strong>Become a host</strong><small>It’s easy to start hosting and earn extra income.</small></span><span className={styles.menuHostArt}><AppImage src="https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-search-bar-icons/original/4aae4ed7-5939-4e76-b100-e69440ebeae4.png?im_w=120" width={56} height={56} alt="" unoptimized/></span></button><hr/><Link role="menuitem" href="/hosting/listings/new">Refer a host</Link><Link role="menuitem" href="/hosting/listings/new">Find a co-host</Link><hr/><button role="menuitem" onClick={()=>openAuth()}><UserPlus size={16}/>Log in or sign up</button></>}</div>}
    </div>
  </div>{homepage?<div className={styles.homeSearch} aria-hidden={collapsed} inert={collapsed}><SearchBar homepage startOpen={scrolled&&searchOpen} onClose={closeSearch} onActiveChange={homeSearchActive}/></div>:!hosting&&searchOpen&&<div className="expanded-search"><SearchBar onClose={closeSearch}/></div>}</header>
  {searchOpen&&!hosting&&(!homepage||scrolled)&&<div className={`search-dimmer ${homepage?styles.homeDimmer:""}`} onClick={closeSearch} aria-hidden="true"/>}
  <Modal open={regionOpen} onClose={closeRegion} title="Language and region"><h3>Choose a language and region</h3><p className="outline-button" style={{marginTop:24}}>English (India)</p><p className="muted" style={{marginTop:24}}>Currency: ₹ INR. Other languages and currencies are coming soon.</p></Modal></>;
}
function MobileTabs(){
  const path=usePathname();const {user,openAuth}=useAuth();const unread=useUnreadCount();
  const [hidden,setHidden]=useState(false);
  useEffect(()=>{
    let previous=window.scrollY,distance=0;
    const reset=requestAnimationFrame(()=>setHidden(false));
    const scroll=()=>{
      const current=window.scrollY,delta=current-previous;previous=current;
      if(window.innerWidth>=744||current<24){distance=0;setHidden(false);return;}
      if(Math.sign(delta)!==Math.sign(distance))distance=0;
      distance+=delta;
      if(Math.abs(distance)<8)return;
      setHidden(distance>0);distance=0;
    };
    window.addEventListener("scroll",scroll,{passive:true});
    window.addEventListener("resize",scroll);
    return()=>{cancelAnimationFrame(reset);window.removeEventListener("scroll",scroll);window.removeEventListener("resize",scroll);};
  },[path]);
  const tabs=[{href:"/",label:"Explore",icon:Search},{href:"/wishlists",label:"Wishlists",icon:Heart},{href:path.startsWith("/hosting")?"/hosting":"/trips",label:path.startsWith("/hosting")?"Hosting":"Trips",icon:path.startsWith("/hosting")?House:Plane},{href:"/messages",label:"Inbox",icon:Mail}];
  return <nav className="mobile-tab-bar" data-hidden={hidden} aria-hidden={hidden} inert={hidden} aria-label="Main navigation">{tabs.map(tab=><Link key={tab.href} href={tab.href} aria-current={tab.href==="/"?path==="/"?"page":undefined:path.startsWith(tab.href)?"page":undefined}><span className="tab-icon"><tab.icon size={24}/>{tab.href==="/messages"&&unread>0&&<span className="unread-badge">{unread}</span>}</span>{tab.label}</Link>)}{user?<Link href="/account" aria-current={path.startsWith("/account")?"page":undefined}><UserRound size={24}/>Profile</Link>:<button onClick={()=>openAuth()}><UserRound size={24}/>Log in</button>}</nav>;
}
export function SiteShell({children}:{children:ReactNode}){
  const path=usePathname();
  if(path.startsWith("/hosting/listings/"))return <>{children}</>;
  const inbox=path.startsWith("/messages"),checkout=path.startsWith("/book/"),account=path==="/account",wishlistDetail=path.startsWith("/wishlists/");
  const className=path.startsWith("/users/")?"public-profile-shell":path.startsWith("/account/profile")?"profile-editor-shell":path==="/trips"?"trips-shell":path.startsWith("/rooms/")?"detail-shell":path.startsWith("/book/")?"checkout-shell":inbox?"inbox-shell":wishlistDetail?"wishlist-detail-shell":"";
  return <div className={`${className} ${path==="/"?styles.homeRoute:""}`}>{account?<header className={styles.accountHeader}><BrandLogo/><Link href="/" className="outline-button">Done</Link></header>:checkout?<header className={styles.checkoutHeader}><BrandLogo/></header>:<Suspense fallback={<div className={styles.headerFallback}/>}><Header hosting={path.startsWith("/hosting")}/></Suspense>}<main id="main-content">{children}</main>{!inbox&&!account&&!wishlistDetail&&(checkout?<footer className={styles.checkoutFooter}><span>© {new Date().getFullYear()} Airbnb clone</span><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/coming-soon">Company details</Link></footer>:<Footer/>)}<MobileTabs/></div>;
}
