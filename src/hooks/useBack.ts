import { useCallback } from 'react';
import { useNavigate, type To } from 'react-router';

/** Go back within the app if there is history, otherwise to `fallback`. */
export function useBack(fallback: To) {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}

/** Leave the tutor: ask the embedding shell (Electron wrapper) first, else browser back. */
export function exitTutor() {
  if (window.aiTutorHost?.exit) window.aiTutorHost.exit();
  else window.history.back();
}
