import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gnomehome.gg";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages = [
    "",
    "/events",
    "/guides",
    "/guides/raids",
    "/guides/bosses",
    "/guides/quests",
    "/guides/pvm",
    "/guides/skilling",
    "/tools",
    "/members",
    "/competitions",
    "/contests",
    "/newsletter",
    "/about",
  ];

  return staticPages.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : path === "/members" ? 0.9 : 0.7,
  }));
}
