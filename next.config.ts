import type { NextConfig } from "next";

const isExport = process.env.NEXT_EXPORT === "1";

const baseConfig: NextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const nextConfig: NextConfig = isExport
  ? {
      ...baseConfig,
      output: "export",
    }
  : {
      ...baseConfig,

      async rewrites() {
        return [
          {
            source: "/api/:path*",
            destination: `${process.env.BACKEND_API_URL ?? "http://127.0.0.1:5200"}/api/:path*`,
          },
        ];
      },
    };

export default nextConfig;