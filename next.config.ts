import type { NextConfig } from "next";
const nextConfig: NextConfig = {
    // Match client assets and Server Actions to the Vercel deployment that served the page.
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID?.replace(/^dpl_/, '')
        ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 32),
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
