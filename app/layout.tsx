import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { CartProvider } from "./(public)/components/CartProvider";
import { ToastProvider } from "./components/ToastProvider";
import StorefrontShell from "./(public)/components/StorefrontShell";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
export const metadata: Metadata = {
    title: "Fussion | Discover something good",
    description: "Discover standout tech, fashion and everyday essentials on Fussion.",
};
export default function RootLayout({ children }: LayoutProps<"/">) {
    return <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
    <body className="min-h-full flex flex-col"><ToastProvider><CartProvider><StorefrontShell />{children}</CartProvider></ToastProvider></body>
  </html>;
}
