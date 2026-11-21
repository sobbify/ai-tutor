import { t } from '@/i18n';
import { ChevronLeftIcon } from '@/components/ui/Icons';

interface AppHeaderProps {
  title: string;
  onBack: () => void;
}

/** Blue app bar from the design: back chevron + bold white title. */
export function AppHeader({ title, onBack }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-header pt-[max(env(safe-area-inset-top),38px)] pb-2.5 text-white">
      <div className="flex h-14 items-center gap-2.5 pr-5 pl-3.5">
        <button
          type="button"
          onClick={onBack}
          aria-label={t.common.back}
          className="-ml-0.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-white"
        >
          <ChevronLeftIcon size={26} />
        </button>
        <h1 className="truncate text-[22px] leading-tight font-bold">{title}</h1>
      </div>
    </header>
  );
}
