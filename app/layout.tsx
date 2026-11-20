import type { Metadata } from "next";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { CartProvider } from "./(public)/components/CartProvider";
import { ToastProvider } from "./components/ToastProvider";
import StorefrontShell from "./(public)/components/StorefrontShell";
import { BrandingProvider } from "./(public)/components/BrandingProvider";
import { getBrandSettings } from "../lib/branding";

// Store content comes from Supabase and must be read at request time, not
// during Next.js static prerendering.
export const dynamic = "force-dynamic";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });
export async function generateMetadata(): Promise<Metadata> {
    const brand = await getBrandSettings();
    return {
        title: `${brand.companyName} | Discover something good`,
        description: `Discover standout tech, fashion and everyday essentials on ${brand.companyName}.`,
    };
}
export default async function RootLayout({ children }: LayoutProps<"/">) {
    const brand = await getBrandSettings();
    return <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} h-full antialiased`}>
    <body className="min-h-full flex flex-col"><ToastProvider><CartProvider><BrandingProvider initialBrand={brand}><StorefrontShell />{children}</BrandingProvider></CartProvider></ToastProvider></body>
  </html>;
}
