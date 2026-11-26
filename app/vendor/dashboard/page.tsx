import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import VendorDashboard from './VendorDashboard';
import VendorDashboardRenewal from './VendorDashboardRenewal';

function VendorLoading() {
    return (
        <main className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-gray-500">Loading vendor dashboard…</p>
        </main>
    );
}

async function VendorDashboardContent() {
    const session = await getSession();

    if (!session || session.role !== 'vendor' || !session.vendorId) {
        redirect('/vendor/login');
    }

    if (session.renewalOnly) return <main className="min-h-screen bg-slate-50 px-4 py-10"><div className="mx-auto max-w-2xl"><VendorDashboardRenewal/></div></main>;
    return <VendorDashboard vendorId={session.vendorId} />;
}

export default function VendorDashboardPage() {
    return (
        <Suspense fallback={<VendorLoading />}>
            <VendorDashboardContent />
        </Suspense>
    );
}
