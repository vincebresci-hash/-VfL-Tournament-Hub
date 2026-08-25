import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Logo uploads use Server Actions + FormData (max 2 MB file + multipart overhead).
  // Default action body limit is 1 MB and silently rejects larger uploads.
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb",
    },
  },
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
