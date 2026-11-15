'use client';
import { useShopName } from '@/components/ShopNameContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Printer, ArrowUpRight, Menu, X } from 'lucide-react';
import { useState } from 'react';

const NAV = [
  ['/upload', 'Print documents'],
  ['/track', 'Track order'],
  ['/pricing', 'Prices'],
  ['/help', 'Help'],
] as const;

export default function CustomerHeader() {
  const name = useShopName();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="customer-header sticky top-0 z-40">
      <div className="site-width flex items-center justify-between gap-4 py-4">
        <Link href="/" className="flex items-center gap-3 font-bold text-lg tracking-tight shrink-0">
          <span className="brand-mark"><Printer size={21} /></span>
          {name}
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Customer navigation" className="hidden sm:flex items-center gap-5 text-sm font-medium">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? 'page' : undefined}
              className={path === href ? 'text-indigo-700 font-semibold' : 'text-slate-600 hover:text-indigo-700 transition-colors'}
            >
              {label}
            </Link>
          ))}
          <Link href="/shop/login" className="hidden md:flex items-center gap-1 text-slate-400 border-l pl-5 hover:text-slate-600 transition-colors text-xs">
            Shop login <ArrowUpRight size={13} />
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-2 -mr-2 text-slate-600"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <nav
          aria-label="Mobile customer navigation"
          className="sm:hidden bg-white border-t border-slate-100 px-5 pb-4 flex flex-col gap-1"
        >
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`py-2.5 text-sm font-medium border-b border-slate-50 ${path === href ? 'text-indigo-700' : 'text-slate-600'}`}
            >
              {label}
            </Link>
          ))}
          <Link href="/shop/login" onClick={() => setOpen(false)} className="pt-3 text-xs text-slate-400 flex items-center gap-1">
            Shop login <ArrowUpRight size={12} />
          </Link>
        </nav>
      )}
    </header>
  );
}
