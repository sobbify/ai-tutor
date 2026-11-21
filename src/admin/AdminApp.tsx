import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { cn } from '@/lib/cn';
import { applyTheme } from '@/lib/theme';
import { Button } from '@/components/ui/Button';
import { apiMode } from '@/api/client';
import { adminApi } from './api';
import { errorMessage } from './format';
import { adminKeys } from './keys';
import { ErrorBox, Field, Loading, TextInput, Toasts } from './ui';


const NAV = [
  { to: '/admin', label: 'Dashboard', end: true, icon: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z' },
  { to: '/admin/learners', label: 'Learners', icon: 'M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0M12 7a4 4 0 1 0 0 8' },
  { to: '/admin/replies', label: 'Replies', icon: 'M4 5h16v11H8l-4 4V5Z' },
  { to: '/admin/content', label: 'Content', icon: 'M6 4h9l3 3v13H6V4Zm3 6h6M9 14h6' },
  { to: '/admin/audit', label: 'Audit log', icon: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { to: '/admin/settings', label: 'Settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM4 12h2m12 0h2M12 4v2m0 12v2' },
];

/** /admin — the database console. Signs in with its own admin account. */
export default function AdminApp() {
  useEffect(() => applyTheme(), []); // the console is always light

  const me = useQuery({ queryKey: adminKeys.me, queryFn: adminApi.session, retry: false, staleTime: 60_000 });

  if (apiMode === 'mock') {
    return (
      <Centered>
        <h1 className="text-[22px] font-extrabold">Admin console</h1>
        <p className="mt-2 text-ink-2">The console needs the backend. Run the app with <code>python run.py</code> (or set VITE_API_MODE=http).</p>
      </Centered>
    );
  }
  if (me.isPending) return <Loading label="Opening the console…" />;
  if (me.error) {
    return (
      <Centered>
        <ErrorBox error={me.error} onRetry={() => void me.refetch()} />
      </Centered>
    );
  }
  if (!me.data.username) return <Login />;
  return <Shell username={me.data.username} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#eef3f8] p-4">
      <div className="w-full max-w-[420px] rounded-card bg-white p-8 shadow-card">{children}</div>
    </div>
  );
}

function Login() {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => adminApi.login(username, password),
    onSuccess: (me) => qc.setQueryData(adminKeys.me, me),
    onSettled: () => setPassword(''),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };
  return (
    <Centered>
      <div className="mb-6 flex items-center gap-3">
        <img src="/favicon.svg" alt="" className="size-11" />
        <div>
          <h1 className="text-[22px] leading-tight font-extrabold">AI Tutor console</h1>
          <p className="text-[14px] text-ink-2">Sign in to manage the database.</p>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Username">
          {(id) => <TextInput id={id} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />}
        </Field>
        <Field label="Password">
          {(id) => (
            <TextInput id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          )}
        </Field>
        {login.error && (
          <p role="alert" className="text-[14px] font-semibold text-[#a61b1b]">
            {errorMessage(login.error)}
          </p>
        )}
        <Button type="submit" disabled={login.isPending} aria-busy={login.isPending} block>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </Centered>
  );
}

function Shell({ username }: { username: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const logout = useMutation({
    mutationFn: adminApi.logout,
    onSettled: () => {
      qc.removeQueries({ queryKey: ['admin'] });
      void navigate('/admin', { replace: true });
    },
  });
  return (
    <div className="min-h-dvh bg-[#f4f7fb] text-ink lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="bg-[#0a5cad] text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:rounded-br-[28px]">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/favicon.svg" alt="" className="size-9 rounded-xl ring-2 ring-white/40" />
          <div className="leading-tight">
            <p className="text-[17px] font-extrabold">AI Tutor</p>
            <p className="text-[12.5px] text-white/85">Database console</p>
          </div>
        </div>
        <nav aria-label="Console" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] font-bold transition-colors',
                  isActive ? 'bg-white text-[#0b5fb3] shadow-sm' : 'text-white hover:bg-white/15',
                )
              }
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={item.icon} />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden border-t border-white/20 px-5 py-4 lg:block">
          <p className="text-[12.5px] text-white/85">Signed in as</p>
          <p className="truncate font-bold">{username}</p>
          <button type="button" onClick={() => logout.mutate()} className="mt-2 text-[14px] font-bold text-white underline-offset-4 hover:underline">
            Sign out
          </button>
        </div>
      </aside>
      <main id="admin-main" className="min-w-0 px-4 py-6 sm:px-8 lg:py-8">
        <div className="mb-4 flex justify-end lg:hidden">
          <Button size="sm" variant="outline" onClick={() => logout.mutate()}>
            Sign out {username}
          </Button>
        </div>
        <div className="mx-auto max-w-[1200px]">
          <Outlet />
        </div>
      </main>
      <Toasts />
    </div>
  );
}
