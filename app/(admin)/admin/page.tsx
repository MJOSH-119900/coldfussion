import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import AdminDashboardClient from './AdminDashboardClient';

function AdminLoading() {
    return (
        <main className="flex min-h-screen items-center justify-center">
            <p className="text-sm text-gray-500">Loading admin dashboard…</p>
        </main>
    );
}

async function AdminPageContent() {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
        redirect('/admin/login');
    }

    return <AdminDashboardClient />;
}

export default function AdminPage() {
    return (
        <Suspense fallback={<AdminLoading />}>
            <AdminPageContent />
        </Suspense>
    );
}
