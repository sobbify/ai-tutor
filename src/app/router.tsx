import { createBrowserRouter, type RouteObject } from 'react-router';
import { RouteError, NotFound, RouteLoading } from './RouteError';

/** Route modules are lazy-loaded so the first screen ships only what it needs. */
export const routes: RouteObject[] = [
  {
    path: '/',
    errorElement: <RouteError />,
    hydrateFallbackElement: <RouteLoading />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('@/features/journey/JourneyPage')).default }) },
      { path: 'welcome', lazy: async () => ({ Component: (await import('@/features/welcome/WelcomePage')).default }) },
      { path: 'practise', lazy: async () => ({ Component: (await import('@/features/practise/PractisePage')).default }) },
      { path: 'me', lazy: async () => ({ Component: (await import('@/features/me/MePage')).default }) },
      { path: 'progress', lazy: async () => ({ Component: (await import('@/features/progress/ProgressPage')).default }) },
      { path: 'rehearse', lazy: async () => ({ Component: (await import('@/features/rehearse/RehearsePage')).default }) },
      { path: 'story', lazy: async () => ({ Component: (await import('@/features/story/StoryPage')).default }) },
      { path: 'phrasebook', lazy: async () => ({ Component: (await import('@/features/phrasebook/PhrasebookPage')).default }) },
      { path: 'certificate', lazy: async () => ({ Component: (await import('@/features/certificate/CertificatePage')).default }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('@/features/settings/SettingsPage')).default }) },
      {
        path: 'moments/:momentId',
        children: [
          { index: true, lazy: async () => ({ Component: (await import('@/features/conversation/ConversationPage')).default }) },
          { path: 'learn', lazy: async () => ({ Component: (await import('@/features/learn/LearnPage')).default }) },
          { path: 'chat', lazy: async () => ({ Component: (await import('@/features/chat/ChatPage')).default }) },
          { path: 'summary', lazy: async () => ({ Component: (await import('@/features/summary/SummaryPage')).default }) },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
  {
    // Database console — its own sign-in, lazy-loaded so learners never download it.
    path: '/admin',
    errorElement: <RouteError />,
    lazy: async () => ({ Component: (await import('@/admin/AdminApp')).default }),
    children: [
      { index: true, lazy: async () => ({ Component: (await import('@/admin/pages/Dashboard')).default }) },
      { path: 'learners', lazy: async () => ({ Component: (await import('@/admin/pages/Learners')).default }) },
      { path: 'learners/:uid', lazy: async () => ({ Component: (await import('@/admin/pages/LearnerDetail')).default }) },
      { path: 'replies', lazy: async () => ({ Component: (await import('@/admin/pages/Replies')).default }) },
      { path: 'content', lazy: async () => ({ Component: (await import('@/admin/pages/Content')).default }) },
      { path: 'content/:momentId', lazy: async () => ({ Component: (await import('@/admin/pages/MomentEditor')).default }) },
      { path: 'audit', lazy: async () => ({ Component: (await import('@/admin/pages/Audit')).default }) },
      { path: 'settings', lazy: async () => ({ Component: (await import('@/admin/pages/Settings')).default }) },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });
