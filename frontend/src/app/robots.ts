import type { MetadataRoute } from "next";

const site = "https://airbnb.mridulnegi.dev";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/account", "/book/", "/trips", "/wishlists", "/messages", "/hosting"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
