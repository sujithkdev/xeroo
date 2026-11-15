'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Download, AlertTriangle, Info } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';
import { Order } from '@/lib/types';

const COLORS = ['#4f46e5', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

function dateRange(start: string, end: string, orders: Order[]) {
  const s = new Date(start + 'T00:00:00').getTime();
  const e = new Date(end + 'T23:59:59').getTime();
  return orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= s && t <= e;
  });
}

function isoDate(d: Date) { return d.toISOString().split('T')[0]; }

function last7Days() {
  const end = new Date();
  const start = new Date(); start.setDate(start.getDate() - 6);
  return { start: isoDate(start), end: isoDate(end) };
}

export default function ReportsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(last7Days().start);
  const [endDate, setEndDate] = useState(last7Days().end);
  const [includeTest, setIncludeTest] = useState(false);

  useEffect(() => {
    apiFetch('/api/orders').then((r) => r.json()).then((d) => {
      setOrders(d.orders ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const ranged = dateRange(startDate, endDate,
    includeTest ? orders : orders.filter((o) => o.source !== 'whatsapp' || true) // no test filter yet
  );

  const completed = ranged.filter((o) => ['completed', 'collected'].includes(o.status));
  const cancelled = ranged.filter((o) => ['cancelled', 'failed'].includes(o.status));
  const paid = ranged.filter((o) => o.isPaid && !o.refundState);
  const refunded = ranged.filter((o) => !!o.refundState);
  const onlineOrders = ranged.filter((o) => o.source === 'web');
  const counterOrders = ranged.filter((o) => o.source === 'counter' || o.source === 'whatsapp');
  const collectedRevenue = paid.reduce((s, o) => s + o.amount, 0);
  const avgOrderValue = paid.length ? collectedRevenue / paid.length : 0;

  // Daily breakdown
  const days: string[] = [];
  const cur = new Date(startDate + 'T00:00:00');
  const endD = new Date(endDate + 'T23:59:59');
  while (cur <= endD) { days.push(isoDate(cur)); cur.setDate(cur.getDate() + 1); }

  const dailyData = days.map((d) => {
    const dayOrders = ranged.filter((o) => isoDate(new Date(o.createdAt)) === d);
    const revenue = dayOrders.filter((o) => o.isPaid).reduce((s, o) => s + o.amount, 0);
    return { date: d.slice(5), orders: dayOrders.length, revenue };
  });

  // Colour breakdown
  const bwSheets = ranged.filter((o) => o.colorMode === 'bw').reduce((s, o) => s + o.pages * o.copies, 0);
  const colorSheets = ranged.filter((o) => o.colorMode === 'color').reduce((s, o) => s + o.pages * o.copies, 0);
  const pieData = [
    { name: 'B&W sides', value: bwSheets },
    { name: 'Colour sides', value: colorSheets },
  ].filter((d) => d.value > 0);

  const exportCsv = () => {
    const rows = [
      ['Order ID', 'Customer', 'Phone', 'Pages', 'Copies', 'Color', 'Amount', 'Paid', 'Method', 'Status', 'Created'],
      ...ranged.map((o) => [o.id, o.customerName, o.customerPhone, o.pages, o.copies, o.colorMode, o.amount, o.isPaid, o.paymentMethod, o.status, o.createdAt]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `report-${startDate}-to-${endDate}.csv`;
    a.click();
  };

  return (
    <div className="p-5 md:p-8">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="page-heading">Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Metrics based on order creation date.</p>
        </div>
        <button onClick={exportCsv} className="btn-secondary !py-2 !text-sm">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="surface p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
          <input type="date" className="input-field !py-2 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
          <input type="date" className="input-field !py-2 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
          Include test orders
        </label>
      </div>

      {/* KPI grid */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Orders received', value: ranged.length },
          { label: 'Completed', value: completed.length },
          { label: 'Collected revenue', value: `₹${collectedRevenue.toFixed(2)}`, note: 'Paid, no refund' },
          { label: 'Avg. order value', value: `₹${avgOrderValue.toFixed(2)}`, note: 'Paid orders' },
          { label: 'Refunds', value: refunded.length },
          { label: 'Cancelled', value: cancelled.length },
          { label: 'Online orders', value: onlineOrders.length },
          { label: 'Counter / WhatsApp', value: counterOrders.length },
        ].map(({ label, value, note }) => (
          <div key={label} className="surface p-4">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{loading ? '—' : value}</p>
            {note && <p className="text-xs text-slate-400 mt-0.5">{note}</p>}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[2fr_1fr] gap-6 mb-6">
        {/* Daily chart */}
        <div className="surface p-5">
          <h2 className="font-semibold mb-1">Orders per day</h2>
          <p className="text-xs text-slate-400 mb-4">Bar = orders received. Line represents revenue (₹).</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any, n: string) => n === 'revenue' ? `₹${Number(v).toFixed(2)}` : v} />
              <Bar dataKey="orders" fill="#4f46e5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie */}
        <div className="surface p-5">
          <h2 className="font-semibold mb-1">Print volume</h2>
          <p className="text-xs text-slate-400 mb-4">Printed sides by colour mode.</p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-300 text-sm">No print data</div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-slate-400 p-3 bg-slate-100 rounded-lg">
        <Info size={12} className="shrink-0 mt-0.5" />
        All metrics use order creation date. "Revenue" refers to collected payments only and does not represent profit.
        Unpaid orders are excluded from revenue figures.
      </div>
    </div>
  );
}
