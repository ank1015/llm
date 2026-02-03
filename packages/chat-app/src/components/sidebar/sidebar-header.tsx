'use client';

import { motion } from 'framer-motion';
import { SquareArrowLeft, SquareArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores';

export function SidebarHeader() {
  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed);

  return (
    <div className="mb-3 flex w-full flex-row items-center justify-between">
      <Link href="/" className="w-full">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className={cn(
            'flex h-8 w-full cursor-pointer items-center justify-start gap-1.5 px-4',
            isSidebarCollapsed && 'justify-center px-0'
          )}
        >
          {!isSidebarCollapsed && (
            <Image src={'/logo-dark.png'} alt="logo" width={25} height={25} />
          )}
        </motion.div>
      </Link>
      {!isSidebarCollapsed && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebarCollapsed}
          className={cn(isSidebarCollapsed && 'mx-auto', 'mr-2 cursor-pointer')}
        >
          <SquareArrowLeft size={24} strokeWidth={2} />
        </Button>
      )}
      {isSidebarCollapsed && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebarCollapsed}
          className={cn(isSidebarCollapsed && 'mx-auto', 'mr-2 cursor-pointer')}
        >
          <SquareArrowRight size={24} strokeWidth={2} />
        </Button>
      )}
    </div>
  );
}
