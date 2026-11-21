import { useLocation } from 'react-router';

/** Typed access to router navigation state (never trusted beyond simple UI flags). */
export function useLocationState<T extends object>(): Partial<T> | null {
  const state: unknown = useLocation().state;
  return state && typeof state === 'object' ? (state as Partial<T>) : null;
}
