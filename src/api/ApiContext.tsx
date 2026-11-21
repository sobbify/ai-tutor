import { createContext, useContext, type ReactNode } from 'react';
import type { TutorApi } from './types';

const ApiContext = createContext<TutorApi | null>(null);

export function ApiProvider({ api, children }: { api: TutorApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApi(): TutorApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>');
  return api;
}
