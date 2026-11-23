import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

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

export default function config(phase: string): NextConfig {
  // `npm run build` -> static export into out/
  if (phase === PHASE_PRODUCTION_BUILD) {
    return { ...baseConfig, output: "export" };
  }

  // `npm run dev` -> proxy /api to the Flask backend
  return {
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
}