import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    experimental: {
        serverActions: { bodySizeLimit: "100mb" },
    },
    /* config options here */
    turbopack: {
        rules: {
            "*.css": {
                loaders: ["@tailwindcss/turbopack"],
                as: "*.css",
            },
        },
    },
};
export default nextConfig;
