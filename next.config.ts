import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/checkout/:path*",
        headers: securityHeaders,
      },
      {
        source: "/api/webpay/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
