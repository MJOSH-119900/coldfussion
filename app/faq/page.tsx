import type { Metadata } from 'next';
import FAQPageClient from './FAQPageClient';
import { getBrandSettings } from '../../lib/branding';

export async function generateMetadata(): Promise<Metadata> {
    const brand = await getBrandSettings();
    return {
        title: `Help & safety | ${brand.companyName}`,
        description: `Frequently asked questions, marketplace safety guidance, and support for ${brand.companyName} shoppers.`,
    };
}

export default async function FAQPage() {
    const brand = await getBrandSettings();
    return <FAQPageClient companyName={brand.companyName} />;
}
