"use client";
export default function ErrorPage({reset}: {error:Error&{digest?:string};reset:()=>void}){return <section className="content-shell utility-page"><h1>Something went wrong</h1><p>We couldn&apos;t load this page. Please try again.</p><button className="dark-button" onClick={reset}>Try again</button></section>;}
