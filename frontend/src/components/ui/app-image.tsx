"use client";
import { useState } from "react";
import Image, { type ImageLoaderProps, type ImageProps } from "next/image";

const optimizedHosts = new Set(["images.unsplash.com", "i.pravatar.cc", "lh3.googleusercontent.com"]);
function unsplashLoader({src,width,quality}:ImageLoaderProps) {
  const image=new URL(src);
  image.searchParams.set("w",String(width));
  image.searchParams.set("q",String(quality??75));
  image.searchParams.set("auto","format");
  return image.toString();
}

/** Unknown host photos stay browser-side and never enter the server image optimizer. */
export function SmartImage({ src, unoptimized, onError, priority, preload, loading, fetchPriority, ...props }: ImageProps) {
  const [failedSource, setFailedSource] = useState<ImageProps["src"] | null>(null);
  let direct = false;
  let unsplash = false;
  if (typeof src === "string" && /^https?:\/\//i.test(src)) {
    try {
      const url = new URL(src);
      unsplash = url.protocol === "https:" && url.hostname === "images.unsplash.com";
      direct = !(url.protocol === "https:" && (optimizedHosts.has(url.hostname) || (url.hostname === "storage.googleapis.com" && url.pathname.startsWith("/airbnb-clone-mridul-media/")))) && !(url.hostname === "localhost" && url.port === "8000" && url.pathname.startsWith("/media/"));
    } catch {
      direct = true;
    }
  }
  const useDirectSource = Boolean(unoptimized) || direct || failedSource === src;
  const eager=Boolean(priority)||fetchPriority==="high";
  const imageLoading=eager?"eager":loading;
  const imagePriority=eager?"high":fetchPriority;
  const imagePreload=Boolean(preload)&&!imageLoading&&!imagePriority;
  if(useDirectSource && typeof src==="string"){
    // eslint-disable-next-line @next/next/no-img-element -- V2 requires plain img for arbitrary HTTPS photo hosts.
    return <img src={src} alt={props.alt} width={props.width} height={props.height} className={props.className} sizes={props.sizes} loading={imageLoading??(preload?"eager":"lazy")} fetchPriority={imagePriority} decoding={props.decoding??"async"} onLoad={props.onLoad} onError={onError} style={{...(props.fill?{position:"absolute",inset:0,width:"100%",height:"100%"} as const:{}),...props.style}}/>;
  }
  const local=typeof src==="string" && src.startsWith("http://localhost:8000/");
  return <Image {...props} loader={props.loader??(unsplash?unsplashLoader:undefined)} alt={props.alt} src={src} loading={imageLoading} fetchPriority={imagePriority} preload={imagePreload} unoptimized={local||unoptimized} onError={event=>{
    onError?.(event);
    if (!useDirectSource) setFailedSource(src);
  }} />;
}
export { SmartImage as AppImage };
