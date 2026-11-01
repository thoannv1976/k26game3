import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { AttemptView, WorldResponse } from './types';

export const qk = {
  world: ['world'] as const,
  attempt: (id: string) => ['attempt', id] as const,
  results: (id: string) => ['results', id] as const,
};

export function useWorld(enabled = true) {
  return useQuery({ queryKey: qk.world, queryFn: () => api.get<WorldResponse>('/api/world'), enabled });
}

export function useAttempt(id: string | undefined) {
  return useQuery({ queryKey: qk.attempt(id ?? ''), queryFn: () => api.get<AttemptView>(`/api/attempts/${id}`), enabled: Boolean(id), staleTime: 0 });
}

/** Replaces the cached attempt view with a fresh one returned by a mutation (answers, plays, uploads…). */
export function useSetAttemptView() {
  const qc = useQueryClient();
  return useCallback(
    (view: AttemptView) => {
      const { attempt, quest, exam, challenges, items } = view;
      qc.setQueryData<AttemptView>(qk.attempt(attempt.id), { attempt, quest, exam, challenges, items });
    },
    [qc],
  );
}
