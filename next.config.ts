import type { NextConfig } from "next";

const securityHeaders = [
  // Global baseline (all routes)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Payment-specific (stricter)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://webpay3gint.transbank.cl https://webpay3g.transbank.cl" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // Global headers for all routes
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
