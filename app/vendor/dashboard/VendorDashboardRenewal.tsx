'use client';

import { useRouter } from 'next/navigation';
import VendorUpgradePanel from './VendorUpgradePanel';
import { logoutAction } from '../../actions/auth';
import { useBranding } from '../../(public)/components/BrandingProvider';

export default function VendorDashboardRenewal() {
  const router = useRouter();
  const { brand } = useBranding();
  return <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.16em] text-violet-700">{brand.companyName} vendor portal</p><h1 className="mt-2 text-2xl font-black text-slate-950">Vendor access expired</h1></div><button type="button" onClick={async () => { await logoutAction(); router.replace('/vendor/login'); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Log out</button></div>
    <VendorUpgradePanel products={[]} renewalOnly/>
  </div>;
}
