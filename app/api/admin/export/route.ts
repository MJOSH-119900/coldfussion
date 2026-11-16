import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/auth';
import { readJson } from '../../../../lib/json-store';
import { Product, Order } from '../../../(public)/components/types/store';
function csv(rows: any[]) { if (!rows.length)
    return ''; const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r)))); return [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'); }
export async function GET(req: NextRequest) { try {
    await requireAdmin();
    const type = req.nextUrl.searchParams.get('type') || 'orders';
    let rows: any[] = [];
    if (type === 'products')
        rows = await readJson<Product[]>('products.json', []);
    else if (type === 'vendors')
        rows = await readJson<any[]>('vendors.json', []);
    else if (type === 'analytics')
        rows = await readJson<any[]>('analytics.json', []);
    else {
        const orders = await readJson<Order[]>('orders.json', []);
        rows = type === 'sales' ? orders.filter(o => o.status === 'Sold') : orders;
    }
    const body = csv(rows);
    return new NextResponse(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename=fussion-${type}.csv` } });
}
catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
} }
