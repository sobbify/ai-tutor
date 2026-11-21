import type { Character, Moment } from '@/types/tutor';

/** Looks and scenes for the illustrated avatars (Portrait.tsx). */
export type SceneKind = 'gate' | 'room' | 'office' | 'phone' | 'festive' | 'coach';

/** Where the conversation happens, from the moment's icon. */
export function sceneFor(moment: Pick<Moment, 'icon' | 'kind'>): SceneKind {
  if (moment.kind === 'baseline') return 'coach';
  switch (moment.icon) {
    case 'chat':
    case 'handshake':
      return 'room';
    case 'school':
      return 'office';
    case 'phone':
      return 'phone';
    case 'star':
      return 'festive';
    default:
      return 'gate';
  }
}

const SKIN = ['#f3cba8', '#e2ad84', '#cc9067', '#a9714d'] as const;
const HAIR = ['#1d1714', '#2b1f19', '#3b2a20'] as const;
const OUTFIT = ['#e0607e', '#3f86d6', '#ef9f33', '#2fa585', '#8a5cd6', '#d9544a'] as const;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface Look {
  kind: 'woman' | 'man' | 'coach';
  skin: string;
  hair: string;
  outfit: string;
  style: number; // hair style variant
  glasses: boolean;
  bindi: boolean;
  moustache: boolean;
}

export function lookFor(character: Character): Look {
  const name = `${character.name} ${character.role}`.toLowerCase();
  const h = hash(character.name);
  const kind = /\belsa\b|coach/.test(name) ? 'coach' : /father|dad|\bmr\b|uncle|grandfather|\bsir\b/.test(name) ? 'man' : 'woman';
  return {
    kind,
    skin: kind === 'coach' ? SKIN[1] : (SKIN[h % SKIN.length] ?? SKIN[0]),
    hair: HAIR[(h >>> 3) % HAIR.length] ?? HAIR[0],
    outfit: kind === 'coach' ? '#3f86d6' : (OUTFIT[(h >>> 5) % OUTFIT.length] ?? OUTFIT[0]),
    style: (h >>> 8) % 3,
    glasses: kind === 'man' ? (h >>> 11) % 2 === 0 : (h >>> 11) % 4 === 0,
    bindi: kind !== 'man' && (h >>> 13) % 3 !== 0,
    moustache: kind === 'man' && (h >>> 15) % 2 === 0,
  };
}

export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c : 255 - c) * amount)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

