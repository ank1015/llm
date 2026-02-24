import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { CreateSessionInput, PromptInput } from '@/lib/types';

import * as api from '@/lib/api';
import { toDisplayMessages } from '@/lib/types';
import { useSessionsStore } from '@/stores/sessions-store';

export function useSessions(projectId: string | undefined, artifactDirId: string | undefined) {
  const setSessions = useSessionsStore((s) => s.setSessions);

  return useQuery({
    queryKey: ['sessions', projectId, artifactDirId],
    queryFn: async () => {
      const data = await api.listSessions(projectId!, artifactDirId!);
      setSessions(artifactDirId!, data);
      return data;
    },
    enabled: !!projectId && !!artifactDirId,
  });
}

export function useSessionMessages(
  projectId: string | undefined,
  artifactDirId: string | undefined,
  sessionId: string | undefined
) {
  const setMessages = useSessionsStore((s) => s.setMessages);

  return useQuery({
    queryKey: ['messages', projectId, artifactDirId, sessionId],
    queryFn: async () => {
      const raw = await api.getMessages(projectId!, artifactDirId!, sessionId!);
      const messages = toDisplayMessages(raw);
      setMessages(sessionId!, messages);
      return messages;
    },
    enabled: !!projectId && !!artifactDirId && !!sessionId,
  });
}

export function useCreateSession(projectId: string, artifactDirId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSessionInput) => api.createSession(projectId, artifactDirId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['sessions', projectId, artifactDirId],
      });
    },
  });
}

export function usePromptSession(projectId: string, artifactDirId: string, sessionId: string) {
  const queryClient = useQueryClient();
  const appendMessages = useSessionsStore((s) => s.appendMessages);

  return useMutation({
    mutationFn: (input: PromptInput) =>
      api.promptSession(projectId, artifactDirId, sessionId, input),
    onSuccess: (raw) => {
      const newMessages = toDisplayMessages(raw);
      appendMessages(sessionId, newMessages);
      queryClient.invalidateQueries({
        queryKey: ['messages', projectId, artifactDirId, sessionId],
      });
    },
  });
}
