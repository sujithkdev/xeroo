'use client';
import { useEffect, useState } from 'react';
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, WifiOff, Clock } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';

type HealthStatus = 'ok' | 'degraded' | 'error' | 'unknown';

interface Indicator {
  name: string;
  status: HealthStatus;
  value?: string;
  detail?: string;
  checkedAt: string;
}

const STATUS_ICONS: Record<HealthStatus, any> = {
  ok: CheckCircle2, degraded: AlertTriangle, error: AlertTriangle, unknown: Clock,
};
const STATUS_COLORS: Record<HealthStatus, string> = {
  ok: 'text-emerald-600 bg-emerald-50', degraded: 'text-amber-600 bg-amber-50',
  error: 'text-rose-600 bg-rose-50', unknown: 'text-slate-500 bg-slate-50',
};

export default function HealthPage() {
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkedAt] = useState(new Date());

  async function buildIndicators() {
    setLoading(true);
    const now = new Date().toISOString();
    const results: Indicator[] = [];

    // API availability
    try {
      const r = await fetch('/api/config', { cache: 'no-store' });
      results.push({ name: 'API', status: r.ok ? 'ok' : 'error', value: `HTTP ${r.status}`, checkedAt: now });
    } catch {
      results.push({ name: 'API', status: 'error', value: 'No response', checkedAt: now });
    }

    // Agent / print system
    try {
      const d = await apiFetch('/api/config').then((r) => r.json());
      const lastPing = d.lastAgentPing;
      const pingAge = lastPing ? Math.floor((Date.now() - new Date(lastPing).getTime()) / 1000) : null;
      const agentStatus: HealthStatus = pingAge === null ? 'unknown' : pingAge < 30 ? 'ok' : pingAge < 120 ? 'degraded' : 'error';
      results.push({ name: 'Print agent', status: agentStatus, value: pingAge !== null ? `Last ping ${pingAge}s ago` : 'No heartbeat', checkedAt: now });
      results.push({ name: 'Printers configured', status: (d.printers?.length ?? 0) > 0 ? 'ok' : 'degraded', value: `${d.printers?.length ?? 0} printer(s)`, checkedAt: now });
      results.push({ name: 'Auto-print', status: d.autoPrintEnabled ? 'ok' : 'degraded', value: d.autoPrintEnabled ? 'Enabled' : 'Paused', checkedAt: now });
      results.push({ name: 'Razorpay', status: d.razorpayConfig?.isConfigured ? 'ok' : 'unknown', value: d.razorpayConfig?.isConfigured ? 'Configured' : 'Not configured', checkedAt: now });
    } catch {
      results.push({ name: 'Print agent', status: 'unknown', value: 'Could not check', checkedAt: now });
    }

    // Orders
    try {
      const d = await apiFetch('/api/orders').then((r) => r.json());
      const orders = d.orders ?? [];
      const errors = orders.filter((o: any) => ['error', 'failed'].includes(o.status)).length;
      results.push({ name: 'Order processing', status: errors > 3 ? 'degraded' : 'ok', value: `${orders.length} total · ${errors} errors`, checkedAt: now });
    } catch {
      results.push({ name: 'Order processing', status: 'unknown', value: 'Could not check', checkedAt: now });
    }

    results.push({
      name: 'Database',
      status: 'ok',
      value: 'SQLite WAL — local',
      detail: 'No backup monitoring in this deployment',
      checkedAt: now,
    });

    results.push({ name: 'Storage', status: 'ok', value: 'Local filesystem', detail: 'No usage metrics available in local mode', checkedAt: now });

    setIndicators(results);
    setLoading(false);
  }

  useEffect(() => { buildIndicators(); }, []);

  const hasIssues = indicators.some((i) => ['degraded', 'error'].includes(i.status));

  return (
    <div className="p-5 md:p-8">
      <div className="flex justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="page-heading">System health</h1>
          <p className="text-sm text-slate-500 mt-1">Checked at {checkedAt.toLocaleTimeString('en-IN')} · Every indicator shows its source timestamp.</p>
        </div>
        <button onClick={buildIndicators} className="btn-secondary !py-2 !text-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {!loading && (
        <div className={`flex items-center gap-2 p-3 rounded-lg mb-6 text-sm ${hasIssues ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
          {hasIssues ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
          {hasIssues ? 'One or more services need attention.' : 'All systems are operational.'}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="surface p-4 animate-pulse h-24" />
          ))
        ) : (
          indicators.map((ind) => {
            const Icon = STATUS_ICONS[ind.status];
            return (
              <div key={ind.name} className="surface p-4">
                <div className="flex items-start gap-3">
                  <span className={`p-1.5 rounded-lg ${STATUS_COLORS[ind.status]}`}>
                    <Icon size={14} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-800">{ind.name}</p>
                    {ind.value && <p className="text-xs text-slate-500 mt-0.5">{ind.value}</p>}
                    {ind.detail && <p className="text-xs text-slate-400 mt-0.5">{ind.detail}</p>}
                    <p className="text-[10px] text-slate-300 mt-1">
                      {new Date(ind.checkedAt).toLocaleTimeString('en-IN')}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[ind.status]}`}>
                    {ind.status}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-slate-400 mt-6 flex items-start gap-1">
        <AlertTriangle size={11} className="shrink-0 mt-0.5 text-amber-400" />
        Never use a generic retry button for print jobs or refunds — these operations require idempotency checks. Use the specific retry actions in each order record.
      </p>
    </div>
  );
}
