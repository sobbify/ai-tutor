export const adminKeys = {
  me: ['admin', 'me'] as const,
  stats: ['admin', 'stats'] as const,
  learners: (p: object) => ['admin', 'learners', p] as const,
  learner: (uid: string) => ['admin', 'learner', uid] as const,
  replies: (p: object) => ['admin', 'replies', p] as const,
  moments: ['admin', 'moments'] as const,
  moment: (id: string) => ['admin', 'moment', id] as const,
  audit: (p: object) => ['admin', 'audit', p] as const,
  admins: ['admin', 'admins'] as const,
  nudges: ['admin', 'nudges'] as const,
};
