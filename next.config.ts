import type { NextConfig } from "next";
import { getContentSecurityPolicyHeaderValue } from "./src/lib/site";

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
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: getContentSecurityPolicyHeaderValue(),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
