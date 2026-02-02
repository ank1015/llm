'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type React from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/usage', label: 'Usage' },
  { href: '/settings', label: 'Settings' },
] as const;

export function Header(): React.ReactElement {
  const pathname = usePathname();

  return (
    <header className="flex items-center justify-between py-6 bg-[#131313]">
      {/* Left: Logo and Navigation */}
      <div className="flex items-center">
        {/* Logo */}
        <Link href="/" className="">
          <Image src={'/logo.png'} width={80} height={80} className="w-[80px]" alt="logo" />
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-0">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors font-google-sans ${
                  isActive
                    ? 'text-white'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 '
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
