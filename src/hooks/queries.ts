import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/api/ApiContext';
import { clearOfflineData } from '@/lib/offline';
import type { SubmitReplyInput } from '@/api/types';
import type { MomentId, OnboardingInput, PreferencesUpdate, Reply, Run } from '@/types/tutor';

export const queryKeys = {
  home: ['home'] as const,
  preferences: ['preferences'] as const,
  phrasebook: ['phrasebook'] as const,
  stories: ['stories'] as const,
  certificate: ['certificate'] as const,
  progress: ['progress'] as const,
  moment: (id: MomentId) => ['moment', id] as const,
  run: (id: MomentId) => ['run', id] as const,
  summary: (id: MomentId) => ['summary', id] as const,
};

export function useHome() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.home, queryFn: () => api.getHome() });
}

export function usePreferences() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.preferences, queryFn: () => api.getPreferences() });
}

/** Anything that changes home, progress or the programme day. */
function useRefreshJourney() {
  const qc = useQueryClient();
  return useCallback(() => {
    for (const key of [queryKeys.home, queryKeys.progress, queryKeys.certificate]) void qc.invalidateQueries({ queryKey: key });
  }, [qc]);
}

export function useOnboard() {
  const api = useApi();
  const qc = useQueryClient();
  const refresh = useRefreshJourney();
  return useMutation({
    mutationFn: (input: OnboardingInput) => api.onboard(input),
    onSuccess: (prefs) => {
      qc.setQueryData(queryKeys.preferences, prefs);
      refresh();
    },
  });
}

export function useSavePreferences() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: PreferencesUpdate) => api.savePreferences(update),
    onSuccess: (prefs) => {
      qc.setQueryData(queryKeys.preferences, prefs);
      void qc.invalidateQueries({ queryKey: queryKeys.home });
    },
  });
}

export function useDeleteMyData() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteMyData(),
    onSuccess: () => {
      clearOfflineData();
      void qc.invalidateQueries();
    },
  });
}

export function usePhrasebook() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.phrasebook, queryFn: () => api.getPhrasebook() });
}

export function useSavePhrase() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ text, momentId }: { text: string; momentId?: MomentId | null }) => api.savePhrase(text, momentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.phrasebook }),
  });
}

export function useDeletePhrase() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deletePhrase(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.phrasebook }),
  });
}

export function useStories() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.stories, queryFn: () => api.getStories() });
}

export function useTellStory() {
  const api = useApi();
  const qc = useQueryClient();
  const refresh = useRefreshJourney();
  return useMutation({
    mutationFn: (text: string) => api.tellStory(text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.stories });
      refresh();
    },
  });
}

export function useDeleteStory() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteStory(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.stories }),
  });
}

export function useCertificate() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.certificate, queryFn: () => api.getCertificate() });
}

export function useProgress() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.progress, queryFn: () => api.getProgress() });
}

export function useMoment(id: MomentId) {
  const api = useApi();
  // Scripts don't change during a session.
  return useQuery({ queryKey: queryKeys.moment(id), queryFn: () => api.getMoment(id), staleTime: Infinity });
}

export function useSummary(id: MomentId) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.summary(id), queryFn: () => api.getSummary(id) });
}

export function useRun(id: MomentId) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.run(id), queryFn: () => api.getRun(id) });
}

/** Resumes the unfinished run or starts one. Used when the conversation screen opens. */
export function useStartRun(id: MomentId) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (options?: { restart?: boolean; quick?: boolean }) => api.startRun(id, options),
    onSuccess: (run) => {
      qc.setQueryData<Run | null>(queryKeys.run(id), run);
      void qc.invalidateQueries({ queryKey: queryKeys.progress });
    },
  });
}

/** Put a checked reply into the cached run (upload path and realtime path alike). */
export function useApplyReply(id: MomentId) {
  const qc = useQueryClient();
  return useCallback(
    (reply: Reply) => {
      if (!reply.feedback.heard) return;
      void qc.invalidateQueries({ queryKey: queryKeys.home }); // practice day / streak
      qc.setQueryData<Run | null>(queryKeys.run(id), (run) =>
        run ? { ...run, replies: [...run.replies.filter((r) => r.turnId !== reply.turnId), reply] } : run,
      );
    },
    [id, qc],
  );
}

export function useSubmitReply(id: MomentId) {
  const api = useApi();
  const applyReply = useApplyReply(id);
  return useMutation({
    mutationFn: (input: SubmitReplyInput) => api.submitReply(id, input),
    onSuccess: applyReply,
  });
}

export function useAdvance(id: MomentId) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.advance(id),
    onSuccess: (run) => {
      qc.setQueryData<Run | null>(queryKeys.run(id), run);
      void qc.invalidateQueries({ queryKey: queryKeys.progress });
      void qc.invalidateQueries({ queryKey: queryKeys.home });
      if (run.completed) {
        void qc.invalidateQueries({ queryKey: queryKeys.summary(id) });
        void qc.invalidateQueries({ queryKey: queryKeys.certificate });
      }
    },
  });
}
