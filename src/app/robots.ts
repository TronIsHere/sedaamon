import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// The API, the admin panel and personal invite links are never worth crawling.
const disallow = ["/api/", "/admin", "/invite/"];

// AI search and assistant crawlers. A crawler obeys only the group that names it, so each repeats the disallow list.
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: AI_BOTS, allow: ["/", "/llms.txt"], disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
