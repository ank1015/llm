'use client';

import { use, useEffect, useRef } from 'react';

import { ThreadInput } from '@/components/thread-input';
import { ThreadMessages } from '@/components/thread-messages';
import { findThread } from '@/lib/mock-data';

export default function ThreadPage({
  params,
}: {
  params: Promise<{ projectName: string; artifactName: string; threadId: string }>;
}): React.ReactElement {
  const { artifactName, threadId } = use(params);
  const thread = findThread(artifactName, threadId);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread?.id]);

  if (!thread) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Thread not found</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={scrollRef}
        className="no-scrollbar flex w-full flex-1 flex-col items-center overflow-y-auto px-8"
      >
        <div className="mx-auto w-full max-w-3xl pb-[200px] pt-4">
          <ThreadMessages messages={thread.messages} />
        </div>
      </div>
      <ThreadInput />
    </div>
  );
}
