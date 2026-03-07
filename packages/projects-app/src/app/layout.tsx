import { Geist, Geist_Mono } from 'next/font/google';

import type { Metadata } from 'next';

import { ThemeInit } from '@/components/theme-init';
import { Toaster } from '@/components/ui/sonner';

import 'katex/dist/katex.min.css';
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
  title: 'LLM Chat App',
  description: 'Chat application built with Next.js',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeInit />
        <Toaster />
        {children}
      </body>
    </html>
  );
}
