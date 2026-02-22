import { Geist, Geist_Mono } from 'next/font/google';

import type { Metadata } from 'next';

import { ThemeToggle } from '@/components/theme-toggle';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'LLM App',
  description: 'LLM application built with Next.js',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="bg-home-page flex h-dvh w-full flex-col overflow-hidden">
          <header className="flex h-12 w-full shrink-0 items-center justify-end px-3">
            <ThemeToggle />
          </header>
          <main className="relative flex-1 overflow-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}
