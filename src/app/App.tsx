import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router';
import { ApiProvider } from '@/api/ApiContext';
import type { TutorApi } from '@/api/types';
import { createQueryClient } from './queryClient';
import { SessionGate } from './SessionGate';
import { createRouter } from './router';

export function App({ api }: { api: TutorApi }) {
  const [queryClient] = useState(createQueryClient);
  const [router] = useState(createRouter);
  return (
    <ApiProvider api={api}>
      <QueryClientProvider client={queryClient}>
        <SessionGate>
          <RouterProvider router={router} />
        </SessionGate>
      </QueryClientProvider>
    </ApiProvider>
  );
}
