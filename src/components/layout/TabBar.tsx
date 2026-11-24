import { Link } from 'react-router';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { HomeIcon, MeIcon, PhrasebookIcon, PractiseIcon } from '@/components/ui/Icons';

export type Tab = 'home' | 'practise' | 'phrasebook' | 'me';

const TABS: { id: Tab; to: string; Icon: typeof HomeIcon }[] = [
  { id: 'home', to: '/', Icon: HomeIcon },
  { id: 'practise', to: '/practise', Icon: PractiseIcon },
  { id: 'phrasebook', to: '/phrasebook', Icon: PhrasebookIcon },
  { id: 'me', to: '/me', Icon: MeIcon },
];

/**
 * The four main screens. Buddy's World navigation style: grey rounded outline icons; the active
 * tab's icon fills in white on a blue pill with a bold label.
 */
export function TabBar({ active }: { active: Tab }) {
  return (
    <nav
      aria-label={t.tabs.label}
      className="sticky bottom-0 z-20 border-t border-line bg-surface/95 px-2 pt-1.5 pb-[max(env(safe-area-inset-bottom),8px)] backdrop-blur-sm"
    >
      <ul className="grid grid-cols-4">
        {TABS.map(({ id, to, Icon }) => {
          const on = id === active;
          return (
            <li key={id}>
              <Link
                viewTransition
                replace
                to={to}
                aria-current={on ? 'page' : undefined}
                className="group flex flex-col items-center gap-0.5 rounded-2xl py-1 focus-visible:outline-offset-0"
              >
                <span
                  className={cn(
                    'flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200',
                    on ? 'bg-header text-white [--tab-ink:var(--color-header)]' : 'text-[#92979A] group-hover:bg-mist [--tab-ink:var(--color-surface)]',
                  )}
                >
                  <Icon size={22} filled={on} />
                </span>
                <span className={cn('text-[12px] leading-4', on ? 'font-extrabold text-action' : 'font-semibold text-ink-2')}>{t.tabs[id]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
