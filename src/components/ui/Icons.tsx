import type { SVGProps } from 'react';

/** Outline icon set (24px grid, 2px stroke, currentColor). Decorative by default. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon strokeWidth={2.6} {...p}>
    <path d="m15 5-7 7 7 7" />
  </Icon>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Icon strokeWidth={2.6} {...p}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
);
export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);
export const LockOpenIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 7.75-1.4" />
  </Icon>
);
export const SpeakerIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z" />
    <path d="M15.5 9a4 4 0 0 1 0 6" />
  </Icon>
);
export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Icon>
);
export const StopIcon = (p: IconProps) => (
  <Icon {...p} stroke="none" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2.5" />
  </Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon strokeWidth={2.6} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
  </Icon>
);
export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h16M7 17v-6M11 17V7M15 17v-4M19 17v-2" />
  </Icon>
);
export const SpeakingBarsIcon = (p: IconProps) => (
  <Icon strokeWidth={2.6} {...p}>
    <path d="M4 10v4M9 7v10M14 9v6M19 6v12" />
  </Icon>
);
export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
    <path d="M4 5.5v16M8 7h8" />
  </Icon>
);
export const BookmarkIcon = (p: IconProps & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return (
    <Icon fill={filled ? 'currentColor' : 'none'} {...rest}>
      <path d="M6 3h12v18l-6-4-6 4z" />
    </Icon>
  );
};
export const BoltIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Icon>
);
export const ChatBubbleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5h16v11H9l-5 4z" />
  </Icon>
);
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
  </Icon>
);
export const FlameIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 22c4 0 7-2.7 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5.7-5 8 0 4.3 3 7 7 7z" />
  </Icon>
);
export const AwardIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="9" r="6" />
    <path d="m8.5 14-1.5 8 5-3 5 3-1.5-8" />
  </Icon>
);
export const KeyboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2.5" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
);
export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4v16l13-8z" />
  </Icon>
);

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 10l4.6-2.8a.6.6 0 0 1 .9.5v8.6a.6.6 0 0 1-.9.5L15 14" />
    <rect x="3" y="6.5" width="12" height="11" rx="2.5" />
  </Icon>
);

export const CameraOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 10l4.6-2.8a.6.6 0 0 1 .9.5v8.6a.6.6 0 0 1-.9.5L15 14" />
    <path d="M10.5 6.5H12.5A2.5 2.5 0 0 1 15 9v4.5M15 17a2.5 2.5 0 0 1-2.5.5h-7A2.5 2.5 0 0 1 3 15V9a2.5 2.5 0 0 1 2-2.45" />
    <path d="m3 3 18 18" />
  </Icon>
);

export const CaptionsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M10 10.2a2.2 2.2 0 1 0 0 3.6M16.5 10.2a2.2 2.2 0 1 0 0 3.6" />
  </Icon>
);

export const PhoneDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.6 13.8c4.8-4 12-4 16.8 0 .5.4.6 1.1.3 1.6l-1.2 1.9a1.2 1.2 0 0 1-1.5.5l-2.5-1a1.2 1.2 0 0 1-.7-1.1v-1.5a10.4 10.4 0 0 0-5.6 0v1.5c0 .5-.3.9-.7 1.1l-2.5 1a1.2 1.2 0 0 1-1.5-.5L3.3 15.4a1.2 1.2 0 0 1 .3-1.6Z" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon strokeWidth={2.4} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
