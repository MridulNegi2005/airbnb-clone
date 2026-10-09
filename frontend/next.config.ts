import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== "production";

const config: NextConfig = {
  htmlLimitedBots: /.*/,
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "storage.googleapis.com", pathname: "/airbnb-clone-mridul-media/**" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      ...(development ? [{ protocol: "http" as const, hostname: "localhost", port: "8000", pathname: "/media/**" }] : []),
    ],
  },
  async headers() {
    const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL || "https://airbnb-api.mridulnegi.dev").origin;
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${development ? "'unsafe-eval'" : "'wasm-unsafe-eval'"} https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://accounts.google.com https://*.gstatic.com https://static.cloudflareinsights.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
      "font-src 'self' data: https://fonts.gstatic.com https://a0.muscache.com",
      `connect-src 'self' data: ${apiOrigin} https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://accounts.google.com https://*.gstatic.com https://cloudflareinsights.com ${development ? "ws://localhost:3000 ws://127.0.0.1:3000" : ""}`,
      `img-src 'self' data: blob: https: ${development ? "http://localhost:8000" : ""}`,
      "media-src 'self' https://stream.media.muscache.com https://a0.muscache.com",
      "frame-src https://accounts.google.com https://www.google.com",
      "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ].join("; ");
    return [{ source: "/:path*", headers: [
      {key:"Content-Security-Policy",value:csp},
      {key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"}, {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
      {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=(self)"},
    ] }];
  },
};

export default config;
