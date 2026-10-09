import type { MetadataRoute } from "next";

const site = "https://airbnb.mridulnegi.dev";
const api = process.env.NEXT_PUBLIC_API_URL || "https://airbnb-api.mridulnegi.dev";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [{ url: site, changeFrequency: "daily", priority: 1 }];
  try {
    for (let page = 1; page <= 20; page++) {
      const response = await fetch(`${api}/api/listings?page_size=50&page=${page}`);
      if (!response.ok) break;
      const { items, total } = (await response.json()) as { items: { id: number }[]; total: number };
      pages.push(...items.map(item => ({ url: `${site}/rooms/${item.id}`, changeFrequency: "weekly" as const, priority: 0.8 })));
      if (page * 50 >= total || items.length === 0) break;
    }
  } catch {
    // The sitemap still lists the home page when the API is unreachable.
  }
  return pages;
}
