'use client';
import { useShopName } from '@/components/ShopNameContext';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Printer, LayoutDashboard, ShoppingBag, Users, BarChart3, Settings,
  Monitor, Inbox, Layers, Store, Menu, X, Tag, ListOrdered,
  CalendarDays, CreditCard, Package, ShieldCheck, Activity, HeadphonesIcon,
  ScrollText, SlidersHorizontal, UserCog, type LucideIcon,
} from 'lucide-react';

type NavItem = [string, string, LucideIcon];

const shopNav: { label: string; items: NavItem[] }[] = [
  { label:'WORKSPACE', items:[
    ['/shop','Overview',LayoutDashboard], ['/shop/orders','Orders',ShoppingBag],
    ['/shop/queue','Print queue',ListOrdered], ['/shop/daily-report','Daily report',BarChart3],
    ['/shop/settings','Shop settings',Settings],
  ]},
];

const adminNav: { label: string; items: NavItem[] }[] = [
  {
    label: 'PLATFORM',
    items: [
      ['/admin', 'Platform overview', LayoutDashboard],
      ['/admin/shops', 'Shops', Store],
      ['/admin/users', 'Users & access', UserCog],
      ['/admin/subscriptions', 'Plans & billing', CreditCard],
    ],
  },
  {
    label: 'OPERATIONS',
    items: [
      ['/admin/health', 'System health', Activity],
      ['/admin/support', 'Support', HeadphonesIcon],
      ['/admin/audit', 'Audit log', ScrollText],
      ['/admin/settings', 'Platform settings', Settings],
    ],
  },
];

export default function WorkspaceShell({
  children,
  admin = false,
  localMode = true,
}: {
  children: React.ReactNode;
  admin?: boolean;
  localMode?: boolean;
}) {
  const name = useShopName();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [account, setAccount] = useState('');
  const owner = localMode || account === 'Shop owner' || account === 'Platform admin';
  const groups = admin ? adminNav : shopNav.map(group=>({...group,items:group.items.filter(([href])=>owner || !['/shop/settings','/shop/daily-report'].includes(href))}));
  const current = groups.flatMap(group=>group.items).find(item=>item[0]===path);
  useEffect(() => {
    if (localMode || path.endsWith('/login')) return;
    const controller = new AbortController();
    const names: Record<string,string> = {owner:'Shop owner', manager:'Shop manager', staff:'Shop staff'};
    fetch('/api/auth/session', {cache:'no-store', signal:controller.signal})
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (data?.user) setAccount(data.user.isPlatformAdmin ? 'Platform admin' : names[data.user.role] || 'Shop account');
      }).catch(() => {});
    return () => controller.abort();
  }, [localMode,path]);
  if (path === '/admin/login' || path === '/shop/login') return <>{children}</>;
  async function signOut() {
    setSignOutError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw Error();
      window.location.assign(admin ? '/admin/login' : '/shop/login');
    } catch { setSignOutError('Could not sign out. Please retry.'); }
  }

  const accountControls = (<>
<p className="text-sm font-semibold">{localMode ? 'Local operator' : account || 'Account'}</p>
          {!localMode && <button className="text-sm text-indigo-600" onClick={signOut}>Log out</button>}
          {signOutError && <p role="alert" className="text-xs text-rose-700">{signOutError}</p>}
  </>);
  return (
    <div className="workspace">
      <a href="#workspace-content" className="skip-link">
        Skip to content
      </a>

      {/* ── Sidebar ── */}
      <aside className="workspace-sidebar">
        <Link
          href={admin ? '/admin' : '/shop'}
          className="flex items-center gap-3 px-5 py-7 text-xl font-bold tracking-tight"
        >
          <span className="brand-mark">
            <Printer size={22} />
          </span>
          {name}
          <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-1 rounded-md ml-auto">
            {admin ? 'ADMIN' : 'SHOP'}
          </span>
        </Link>

        <div className="px-6 pb-4 text-xs text-slate-500">
          {admin ? 'Platform management' : 'Your daily print workspace'}
        </div>

        <nav aria-label="Workspace navigation" className="space-y-5 px-3 flex-1">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="px-3 mb-1 text-[10px] font-semibold tracking-[.16em] text-slate-400">
                {g.label}
              </p>
              {g.items.map(([href, label, Icon]) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={path === href ? 'page' : undefined}
                  className={`workspace-nav ${path === href ? 'active' : ''}`}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-5 space-y-3 border-t mt-4">
          {accountControls}
        </div>
      </aside>

      {/* ── Body ── */}
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2"
              aria-label="Toggle navigation"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="text-slate-400 text-sm">{admin ? 'Platform' : 'Workspace'}</span>
            <span className="text-slate-300">/</span>
            <span className="text-sm font-semibold">{current?.[1] || 'Settings'}</span>
          </div>

          <div className="flex items-center gap-3">
            {!admin && (
              <Link href="/shop/orders/new" className="btn-primary !py-2 !px-4 !text-xs">
                <Package size={13} /> New counter order
              </Link>
            )}
            {admin && (
              <Link href="/admin/shops/new" className="btn-primary !py-2 !px-4 !text-xs">
                <Store size={13} /> Add shop
              </Link>
            )}
          </div>
        </header>

        {/* Mobile nav dropdown */}
        {open && (
          <nav
            aria-label="Mobile workspace navigation"
            className="lg:hidden bg-white border-b p-4 grid grid-cols-2 gap-2"
          >
            {groups.flatMap((g) => g.items).map(([href, label]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`workspace-nav text-xs ${path === href ? 'active' : ''}`}
              >
                {label}
              </Link>
            ))}
            <div className="col-span-2 border-t pt-3">{accountControls}</div>
          </nav>
        )}

        <main id="workspace-content" className="workspace-content">
          {children}
        </main>
      </div>
    </div>
  );
}
