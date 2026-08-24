import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-src 'self' https://www.meinturnierplan.de https://meinturnierplan.de;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
