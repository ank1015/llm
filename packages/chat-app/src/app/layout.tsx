import { Geist, Geist_Mono } from 'next/font/google';

import type { Metadata } from 'next';

import { ChatInput } from '@/components-home/chat-input';
import { HomeLayout } from '@/components-home/root-layout';

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
        <HomeLayout>
          <div className="relative flex h-full w-full flex-col">{children}</div>
          <ChatInput />
        </HomeLayout>
      </body>
    </html>
  );
}
