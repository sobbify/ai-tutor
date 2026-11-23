import { memo } from 'react';
import type { Character, Mood } from '@/types/tutor';
import { lookFor, shade, type Look, type SceneKind } from './portraitLook';

/**
 * Illustrated stand-in for the parent's video until the avatar provider is wired in: an original,
 * flat-style portrait in a scene that fits the moment. Each character gets a stable look (from
 * their name), blinks and breathes while idle, talks while their line plays, and their face follows
 * the line's mood (calm, worried, upset). All motion stops under prefers-reduced-motion.
 */
interface PortraitProps {
  character: Character;
  scene: SceneKind;
  mood: Mood;
  speaking: boolean;
  /** Short tile (feedback / chat open): frame the face, not the shoulders. */
  tight?: boolean;
  /** False: the scene only (the 3D parent is drawn on top of it). */
  person?: boolean;
}

export const Portrait = memo(function Portrait({ character, scene, mood, speaking, tight = false, person = true }: PortraitProps) {
  const look = lookFor(character);
  return (
    <svg viewBox={tight ? '0 24 360 170' : '0 0 360 250'} preserveAspectRatio="xMidYMid slice" className="dim-in-dark size-full" aria-hidden="true" focusable="false">
      <Scene kind={scene} />
      {person && (
        <g className={speaking ? 'pt-sway' : 'pt-breathe'}>
          <Person look={look} mood={mood} speaking={speaking} />
        </g>
      )}
    </svg>
  );
});

/** Small round face for chat bubbles. */
export const Face = memo(function Face({ character, className }: { character: Character; className?: string }) {
  const look = lookFor(character);
  return (
    <svg viewBox="124 36 112 112" className={className} aria-hidden="true" focusable="false">
      <rect x="124" y="36" width="112" height="112" fill={look.kind === 'coach' ? '#dcecff' : '#d5edff'} />
      <Person look={look} mood="calm" speaking={false} still />
    </svg>
  );
});

function Scene({ kind }: { kind: SceneKind }) {
  switch (kind) {
    case 'gate':
      return (
        <g>
          <rect width="360" height="250" fill="#cfe9ff" />
          <circle cx="300" cy="44" r="22" fill="#ffe08a" />
          <rect y="98" width="360" height="110" fill="#f5d6a2" />
          <rect y="92" width="360" height="12" fill="#e9b872" />
          {[20, 72, 258, 310].map((x) => (
            <rect key={x} x={x} y="122" width="32" height="34" rx="5" fill="#9fd0f5" stroke="#fff" strokeWidth="3" />
          ))}
          <path d="M112 206 V150 Q112 128 134 128 H226 Q248 128 248 150 V206 Z" fill="#e9c58c" />
          <rect y="206" width="360" height="44" fill="#a9db9a" />
          <circle cx="18" cy="96" r="30" fill="#7cc576" />
          <circle cx="48" cy="84" r="24" fill="#8fd286" />
          <circle cx="346" cy="92" r="28" fill="#7cc576" />
        </g>
      );
    case 'room':
      return (
        <g>
          <rect width="360" height="250" fill="#f4ecdd" />
          <rect x="24" y="34" width="96" height="70" rx="6" fill="#d9b48a" />
          <rect x="32" y="42" width="34" height="24" rx="2" fill="#ffd36e" />
          <rect x="72" y="44" width="40" height="18" rx="2" fill="#8ed1c6" />
          <rect x="36" y="72" width="28" height="24" rx="2" fill="#f29ab0" />
          <rect x="70" y="68" width="42" height="28" rx="2" fill="#a9c8ff" />
          <rect x="250" y="30" width="86" height="80" rx="6" fill="#bfe3ff" stroke="#fff" strokeWidth="5" />
          <rect x="290" y="30" width="5" height="80" fill="#fff" />
          <rect y="200" width="360" height="50" fill="#e3d3ba" />
          <rect x="300" y="150" width="24" height="52" rx="4" fill="#c98b5a" />
          <circle cx="312" cy="140" r="20" fill="#6bbf73" />
          <circle cx="298" cy="128" r="12" fill="#7fcd84" />
        </g>
      );
    case 'office':
      return (
        <g>
          <rect width="360" height="250" fill="#e7eef7" />
          {[44, 92].map((y) => (
            <g key={y}>
              <rect x="20" y={y + 34} width="104" height="6" fill="#b58a62" />
              {[26, 38, 50, 62, 80, 94, 106].map((x, i) => (
                <rect key={x} x={x} y={y + 4 + (i % 3) * 3} width="10" height={30 - (i % 3) * 3} rx="2" fill={['#ef7d6d', '#5aa3e8', '#f2c14e', '#62c29a'][i % 4]} />
              ))}
            </g>
          ))}
          <rect x="252" y="36" width="84" height="60" rx="6" fill="#fff" />
          <path d="M262 82 L282 62 L298 76 L310 66 L326 82 Z" fill="#9fd0a0" />
          <circle cx="318" cy="52" r="7" fill="#ffd36e" />
          <rect y="204" width="360" height="46" fill="#cfd9e4" />
        </g>
      );
    case 'phone':
      return (
        <g>
          <rect width="360" height="250" fill="#f6e5d8" />
          <rect x="246" y="28" width="90" height="82" rx="8" fill="#ffd9a8" stroke="#fff" strokeWidth="5" />
          <circle cx="292" cy="62" r="16" fill="#fff4d6" />
          <rect x="34" y="40" width="6" height="120" fill="#b9977a" />
          <path d="M14 40 h46 l-10 -26 h-26 z" fill="#ffcf73" />
          <rect y="198" width="360" height="52" fill="#e6c9b3" />
        </g>
      );
    case 'festive':
      return (
        <g>
          <rect width="360" height="250" fill="#fff0d4" />
          <path d="M0 26 Q90 58 180 26 T360 26" fill="none" stroke="#c98b5a" strokeWidth="2" />
          {Array.from({ length: 12 }, (_, i) => {
            const x = 12 + i * 30;
            const y = 26 + Math.sin((i / 12) * Math.PI * 2) * 12 + 8;
            return <path key={x} d={`M${x - 9} ${y - 6} h18 l-9 18 z`} fill={['#ef6f6c', '#f7b733', '#4fb6a7', '#8a5cd6'][i % 4]} />;
          })}
          {[40, 100, 260, 320].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy="198" rx="14" ry="6" fill="#c9733a" />
              <path d={`M${x} 172 q7 12 0 20 q-7 -8 0 -20`} fill="#ffb627" className="pt-flicker" />
            </g>
          ))}
          <rect y="204" width="360" height="46" fill="#f4d7a8" />
        </g>
      );
    default:
      return (
        <g>
          <rect width="360" height="250" fill="#dcecff" />
          <circle cx="56" cy="60" r="46" fill="#c6e0ff" />
          <circle cx="314" cy="196" r="60" fill="#c6e0ff" />
          <circle cx="300" cy="50" r="18" fill="#ebffff" />
          <path d="M70 168 l5 -12 l5 12 l12 5 l-12 5 l-5 12 l-5 -12 l-12 -5 z" fill="#fff" />
          <path d="M288 104 l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 z" fill="#fff" />
        </g>
      );
  }
}

function Person({ look, mood, speaking, still = false }: { look: Look; mood: Mood; speaking: boolean; still?: boolean }) {
  const { skin, hair, outfit } = look;
  const skinShade = shade(skin, -0.12);
  const outfitShade = shade(outfit, -0.22);
  const woman = look.kind !== 'man';
  // Eyebrow tilt: worried lifts the inner ends, upset pulls them down.
  const tilt = mood === 'worried' ? -5 : mood === 'upset' ? 6 : 0;
  const mouth =
    mood === 'upset' ? 'M168 131 Q180 124 192 131' : mood === 'worried' ? 'M169 129 Q180 127 191 129' : 'M166 124 Q180 136 194 124';
  return (
    <g>
      {/* hair behind the head */}
      {woman && look.style !== 1 && (
        <path d="M137 100 Q133 66 152 56 Q180 42 208 56 Q227 66 223 100 L229 168 Q231 186 212 188 L148 188 Q129 186 131 168 Z" fill={hair} />
      )}
      {/* body */}
      <path d="M84 250 Q88 186 140 174 L220 174 Q272 186 276 250 Z" fill={outfit} />
      {look.kind === 'man' ? (
        <>
          <path d="M160 174 L180 204 L200 174 Z" fill="#fff" />
          <path d="M160 174 L172 196 L156 190 Z M200 174 L188 196 L204 190 Z" fill={shade('#ffffff', -0.08)} />
        </>
      ) : look.kind === 'coach' ? (
        <>
          <path d="M156 174 Q180 200 204 174 Z" fill="#ebffff" />
          <path d="M150 176 L170 250 M210 176 L190 250" stroke={outfitShade} strokeWidth="6" />
        </>
      ) : (
        <>
          <path d="M162 174 L180 196 L198 174 Z" fill={skinShade} />
          <path d="M212 176 Q250 190 268 250 L242 250 Q230 210 196 184 Z" fill={outfitShade} opacity="0.9" />
        </>
      )}
      {/* neck */}
      <path d="M168 134 L168 176 Q180 182 192 176 L192 134 Z" fill={skinShade} />
      {/* ears */}
      <ellipse cx="139" cy="102" rx="7" ry="10" fill={skinShade} />
      <ellipse cx="221" cy="102" rx="7" ry="10" fill={skinShade} />
      {woman && look.kind !== 'coach' && (
        <>
          <circle cx="139" cy="116" r="3.2" fill="#f2c14e" />
          <circle cx="221" cy="116" r="3.2" fill="#f2c14e" />
        </>
      )}
      {/* head */}
      <ellipse cx="180" cy="100" rx="41" ry="48" fill={skin} />
      <path d="M152 136 Q180 156 208 136 Q196 150 180 150 Q164 150 152 136 Z" fill={skinShade} opacity="0.35" />
      {/* hair on top */}
      {look.kind === 'man' ? (
        <path
          d={look.style === 0 ? 'M139 96 Q136 52 180 50 Q224 52 221 96 Q216 72 198 68 Q176 76 150 70 Q141 80 139 96 Z' : 'M139 94 Q138 50 184 50 Q224 54 221 92 Q208 66 168 66 Q148 70 139 94 Z'}
          fill={hair}
        />
      ) : (
        <>
          <path
            d={
              look.style === 2
                ? 'M139 102 Q137 50 186 50 Q224 54 221 102 Q214 68 172 64 Q150 72 139 102 Z' // side parting
                : 'M139 102 Q136 50 180 50 Q224 50 221 102 Q216 70 184 64 L180 60 L176 64 Q144 70 139 102 Z' // centre parting
            }
            fill={hair}
          />
          {look.style === 1 && <circle cx="180" cy="46" r="16" fill={hair} />}
        </>
      )}
      {look.kind === 'coach' && (
        <>
          <path d="M136 100 Q136 44 180 44 Q224 44 224 100" fill="none" stroke="#2c3e50" strokeWidth="5" />
          <rect x="130" y="90" width="12" height="24" rx="6" fill="#2c3e50" />
          <rect x="218" y="90" width="12" height="24" rx="6" fill="#2c3e50" />
          <path d="M136 112 Q140 134 162 134" fill="none" stroke="#2c3e50" strokeWidth="3" />
          <circle cx="164" cy="134" r="4" fill="#2c3e50" />
        </>
      )}
      {/* brows */}
      <g stroke={shade(hair, 0.1)} strokeWidth="3.5" strokeLinecap="round" fill="none">
        <path d={`M155 ${82 + tilt} Q163 ${78} 171 ${82 - tilt}`} />
        <path d={`M189 ${82 - tilt} Q197 ${78} 205 ${82 + tilt}`} />
      </g>
      {/* eyes */}
      <g className={still ? undefined : 'pt-blink'}>
        <ellipse cx="163" cy="98" rx="5" ry={mood === 'calm' ? 5.5 : 6} fill="#2a1d17" />
        <ellipse cx="197" cy="98" rx="5" ry={mood === 'calm' ? 5.5 : 6} fill="#2a1d17" />
        <circle cx="165" cy="96" r="1.6" fill="#fff" />
        <circle cx="199" cy="96" r="1.6" fill="#fff" />
      </g>
      {look.glasses && (
        <g fill="none" stroke="#3a3a3a" strokeWidth="2.5">
          <rect x="150" y="87" width="26" height="21" rx="8" />
          <rect x="184" y="87" width="26" height="21" rx="8" />
          <path d="M176 96 h8" />
        </g>
      )}
      {/* nose, cheeks, bindi */}
      <path d="M180 102 Q176 113 182 115" fill="none" stroke={skinShade} strokeWidth="3" strokeLinecap="round" />
      <circle cx="152" cy="114" r="7" fill="#f28b8b" opacity={mood === 'upset' ? 0.45 : 0.25} />
      <circle cx="208" cy="114" r="7" fill="#f28b8b" opacity={mood === 'upset' ? 0.45 : 0.25} />
      {look.bindi && look.kind === 'woman' && <circle cx="180" cy="75" r="2.6" fill="#c8283a" />}
      {look.moustache && <path d="M166 120 Q180 114 194 120 Q180 124 166 120 Z" fill={hair} />}
      {/* mouth */}
      {speaking ? (
        <ellipse cx="180" cy="128" rx="9" ry="6" fill="#7a2e2e" className="pt-talk" />
      ) : (
        <path d={mouth} fill="none" stroke="#9a3b3b" strokeWidth="3.5" strokeLinecap="round" />
      )}
    </g>
  );
}
