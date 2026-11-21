import { create } from 'zustand';
import { clearOfflineData } from '@/lib/offline';

/**
 * Set when the backend says the session cookie is gone (403). The app then shows the
 * "Session not available" screen instead of retrying. A new session must come from the host app
 * (a fresh `/in?uid=..&name=..` link).
 */
export const useSessionLost = create<{ lost: boolean }>(() => ({ lost: false }));

export function notifySessionLost() {
  clearOfflineData();
  useSessionLost.setState({ lost: true });
}
