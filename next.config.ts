import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    // Keep seed JSON available to the server functions that initialize /tmp.
    outputFileTracingIncludes: {
        '/*': ['./data/*.json'],
    },
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
