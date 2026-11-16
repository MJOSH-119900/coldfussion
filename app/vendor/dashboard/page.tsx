import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import VendorDashboard from './VendorDashboard';

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

    return <VendorDashboard vendorId={session.vendorId} />;
}

export default function VendorDashboardPage() {
    return (
        <Suspense fallback={<VendorLoading />}>
            <VendorDashboardContent />
        </Suspense>
    );
}
