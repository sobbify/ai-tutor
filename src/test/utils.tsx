import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ApiProvider } from '@/api/ApiContext';
import { createMockApi, type KeyValueStore } from '@/api/mock/mockApi';
import type { TutorApi } from '@/api/types';
import { createQueryClient } from '@/app/queryClient';
import { routes } from '@/app/router';

export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

export function testApi() {
  return createMockApi({ storage: memoryStore(), latencyMs: 0, onboarded: true });
}

export function renderRoute(path: string | { pathname: string; state?: unknown }, api: TutorApi = testApi()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  const utils = render(
    <ApiProvider api={api}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ApiProvider>,
  );
  return { ...utils, router, api };
}
