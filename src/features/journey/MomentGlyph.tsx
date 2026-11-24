import { memo } from 'react';
import { cn } from '@/lib/cn';
import type { MomentIcon } from '@/types/tutor';

/**
 * Colourful illustrated objects for the moments (Buddy's World: learning content gets illustrated
 * icons, navigation stays grey). Drawn on a 32px grid; decorative — the title is always beside them.
 */
const WELLS: Record<MomentIcon, string> = {
  sun: '#fff4cf',
  backpack: '#ffe3dc',
  chat: '#dff0ff',
  handshake: '#ffe4ee',
  school: '#e5f6e8',
  phone: '#e1f7ee',
  bandage: '#fbeedd',
  star: '#fff1cc',
};

function Art({ icon }: { icon: MomentIcon }) {
  switch (icon) {
    case 'sun':
      return (
        <g>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x="15" y="3" width="2.4" height="5" rx="1.2" fill="#ff9f1c" transform={`rotate(${i * 45} 16.2 16)`} />
          ))}
          <circle cx="16.2" cy="16" r="6.6" fill="#ffc83d" />
          <circle cx="14" cy="14" r="2" fill="#ffe28a" />
        </g>
      );
    case 'backpack':
      return (
        <g>
          <path d="M12 9.5V8a4.2 4.2 0 0 1 8.4 0v1.5" fill="none" stroke="#b5452c" strokeWidth="2" strokeLinecap="round" />
          <rect x="7.5" y="9" width="17.4" height="18" rx="5" fill="#f2603f" />
          <rect x="11" y="18" width="10.4" height="7" rx="2.5" fill="#ff8a6b" />
          <rect x="14.6" y="19.5" width="3.2" height="1.8" rx=".9" fill="#ffd0c2" />
          <path d="M7.5 15h17.4" stroke="#d94a2e" strokeWidth="1.6" />
        </g>
      );
    case 'chat':
      return (
        <g>
          <path d="M5 8.5A3.5 3.5 0 0 1 8.5 5h10A3.5 3.5 0 0 1 22 8.5v5a3.5 3.5 0 0 1-3.5 3.5H12l-4.4 3.3a.6.6 0 0 1-1-.5V17A3.5 3.5 0 0 1 5 13.5Z" fill="#1f92fc" />
          <path d="M14 15.5A3 3 0 0 1 17 12.5h8a3 3 0 0 1 3 3v4.5a3 3 0 0 1-3 3v2.6a.5.5 0 0 1-.8.4L20.4 23H17a3 3 0 0 1-3-3Z" fill="#7fd3ff" />
          <circle cx="10" cy="11" r="1.3" fill="#fff" />
          <circle cx="13.5" cy="11" r="1.3" fill="#fff" />
          <circle cx="17" cy="11" r="1.3" fill="#fff" />
        </g>
      );
    case 'handshake':
      return (
        <g>
          <path d="M16 26.5s-9-5.3-9-11.4A4.6 4.6 0 0 1 16 13a4.6 4.6 0 0 1 9 2.1c0 6.1-9 11.4-9 11.4Z" fill="#f23875" />
          <path d="M11 13.6a2.8 2.8 0 0 1 3-1.6" stroke="#ff9bbd" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M4.5 20.5c2.5 0 3.7 1.2 5.2 2.6l2.3 2a2 2 0 0 0 1.4.6h4.3a1.6 1.6 0 0 0 0-3.2h-2.4" fill="none" stroke="#e9a36f" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'school':
      return (
        <g>
          <path d="M16 4.5v5" stroke="#5a6b7a" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M16.6 4.5h5l-1.4 1.8 1.4 1.8h-5Z" fill="#f23875" />
          <path d="M4.5 15 16 9l11.5 6Z" fill="#e25b45" />
          <rect x="6.5" y="15" width="19" height="12" rx="1.5" fill="#ffd36e" />
          <rect x="13.6" y="19.5" width="4.8" height="7.5" rx="1.2" fill="#b5703a" />
          <rect x="8.6" y="18" width="3.2" height="3.2" rx=".8" fill="#7fc8ff" />
          <rect x="20.2" y="18" width="3.2" height="3.2" rx=".8" fill="#7fc8ff" />
        </g>
      );
    case 'phone':
      return (
        <g>
          <path
            d="M9.4 5.6l2.7-.6a1.6 1.6 0 0 1 1.8 1l1.3 3.4a1.6 1.6 0 0 1-.5 1.8l-1.8 1.5a12 12 0 0 0 5.4 5.4l1.5-1.8a1.6 1.6 0 0 1 1.8-.5l3.4 1.3a1.6 1.6 0 0 1 1 1.8l-.6 2.7a2.4 2.4 0 0 1-2.5 1.9C13.2 22.9 9.1 18.8 7.5 8.1a2.4 2.4 0 0 1 1.9-2.5Z"
            fill="#20b26b"
          />
          <path d="M19 6.5a6.5 6.5 0 0 1 6.5 6.5M19 10a3 3 0 0 1 3 3" fill="none" stroke="#1f92fc" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      );
    case 'bandage':
      return (
        <g transform="rotate(-38 16 16)">
          <rect x="3.5" y="11.5" width="25" height="9" rx="4.5" fill="#f5c08a" />
          <rect x="11.5" y="11.5" width="9" height="9" fill="#fbe0bf" />
          {[13.5, 16, 18.5].map((x) => [14, 18].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r=".75" fill="#e2a868" />))}
        </g>
      );
    default:
      return (
        <g>
          <path d="M16 4.5l3.3 6.8 7.4 1-5.4 5.2 1.3 7.4L16 21.4l-6.6 3.5 1.3-7.4-5.4-5.2 7.4-1Z" fill="#ffc83d" stroke="#ff9f1c" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M25.5 21.5l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9Z" fill="#f23875" />
        </g>
      );
  }
}

/** The moment's illustration in a soft tinted well (round by default). */
export const MomentGlyph = memo(function MomentGlyph({ icon, size = 40, className }: { icon: MomentIcon; size?: number; className?: string }) {
  return (
    <span
      className={cn('dim-in-dark inline-flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: size, height: size, background: WELLS[icon] }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width={Math.round(size * 0.72)} height={Math.round(size * 0.72)} focusable="false">
        <Art icon={icon} />
      </svg>
    </span>
  );
});
