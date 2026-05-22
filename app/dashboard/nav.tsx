'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from './actions';

interface NavProps {
  email: string;
}

const LINKS: Array<{ href: string; label: string }> = [
  { href: '/dashboard/decks', label: 'My Decks' },
  { href: '/dashboard/cards', label: 'Cards' },
  { href: '/dashboard/public-decks', label: 'Public Decks' },
  { href: '/dashboard/matchups', label: 'Matchups' },
  { href: '/dashboard/account', label: 'Account' },
];

export default function DashboardNav({ email }: NavProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center gap-6">
        <Link
          href="/dashboard"
          className="text-sm font-semibold tracking-tight text-slate-900 shrink-0"
        >
          RiftBrewery
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={
                  'px-3 h-8 inline-flex items-center rounded-md text-sm transition ' +
                  (active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
                }
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[180px]">
            {email}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="h-8 px-3 rounded-md border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
