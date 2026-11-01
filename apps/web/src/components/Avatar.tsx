import { useId } from 'react';
import { AVATAR_IDS, OUTFIT_IDS } from '@vq/shared';
import type { AvatarId, OutfitId } from '../api/types';
import { cx } from './ui';

interface Look {
  bg: string;
  skin: string;
  hair: string;
  shirt: string;
}

const LOOKS: Record<AvatarId, Look> = {
  explorer: { bg: '#fde68a', skin: '#f1c27d', hair: '#5b3a1e', shirt: '#65a30d' },
  scholar: { bg: '#c7d2fe', skin: '#e0ac69', hair: '#1f1f2e', shirt: '#4338ca' },
  captain: { bg: '#bae6fd', skin: '#f5d0b0', hair: '#3b2a1a', shirt: '#1e3a8a' },
  inventor: { bg: '#fecaca', skin: '#c68642', hair: '#2d1b0e', shirt: '#475569' },
  artist: { bg: '#fbcfe8', skin: '#ffdbac', hair: '#8b4513', shirt: '#db2777' },
  ranger: { bg: '#bbf7d0', skin: '#8d5524', hair: '#1b1b1b', shirt: '#166534' },
  pilot: { bg: '#e0e7ff', skin: '#f1c27d', hair: '#6b4423', shirt: '#78350f' },
  chef: { bg: '#fef3c7', skin: '#e0ac69', hair: '#2a1d16', shirt: '#f8fafc' },
};

export const AVATAR_EMOJI: Record<AvatarId, string> = {
  explorer: '🧭',
  scholar: '📚',
  captain: '⚓',
  inventor: '⚙️',
  artist: '🎨',
  ranger: '🌲',
  pilot: '✈️',
  chef: '🍳',
};

const INK = '#1a1d3a';

export function normalizeAvatar(a: { id?: string; outfit?: string } | null | undefined): { id: AvatarId; outfit: OutfitId } {
  const id = AVATAR_IDS.includes(a?.id as AvatarId) ? (a!.id as AvatarId) : 'explorer';
  const outfit = OUTFIT_IDS.includes(a?.outfit as OutfitId) ? (a!.outfit as OutfitId) : 'classic';
  return { id, outfit };
}

function Hat({ id, look }: { id: AvatarId; look: Look }) {
  switch (id) {
    case 'explorer':
      return (
        <g>
          <ellipse cx="48" cy="29" rx="27" ry="6" fill="#d6b77a" />
          <path d="M33 29c0-13 30-13 30 0z" fill="#c9a35f" />
          <rect x="33" y="24" width="30" height="4" fill="#7c5a2a" />
        </g>
      );
    case 'captain':
      return (
        <g>
          <path d="M30 28c2-12 34-12 36 0z" fill="#f8fafc" stroke="#cbd5e1" />
          <rect x="29" y="26" width="38" height="6" rx="3" fill="#1e293b" />
          <circle cx="48" cy="22" r="3.4" fill="#facc15" />
          <path d="M31 32c6 3 28 3 34 0" stroke="#0f172a" strokeWidth="2.5" fill="none" />
        </g>
      );
    case 'inventor':
      return (
        <g>
          <path d="M32 30l4-10 5 6 4-9 4 9 5-7 3 9 5-6 1 9z" fill={look.hair} />
          <rect x="30" y="27" width="36" height="4" rx="2" fill="#334155" />
          <circle cx="40" cy="29" r="5" fill="#67e8f9" stroke="#334155" strokeWidth="2.5" />
          <circle cx="56" cy="29" r="5" fill="#67e8f9" stroke="#334155" strokeWidth="2.5" />
        </g>
      );
    case 'artist':
      return (
        <g>
          <ellipse cx="45" cy="25" rx="18" ry="7" fill="#dc2626" transform="rotate(-10 45 25)" />
          <circle cx="44" cy="17" r="2.2" fill="#dc2626" />
        </g>
      );
    case 'ranger':
      return (
        <g>
          <path d="M31 30c1-13 33-13 34 0z" fill="#15803d" />
          <path d="M60 30h12a3 3 0 0 1-3 3H60z" fill="#14532d" />
          <path d="M44 21c3-5 8-5 9 0-3 2-6 2-9 0z" fill="#86efac" />
        </g>
      );
    case 'pilot':
      return (
        <g>
          <path d="M30 34c-1-17 37-17 36 0l-3 2c-1-12-29-12-30 0z" fill="#92400e" />
          <rect x="34" y="24" width="28" height="7" rx="3.5" fill="#57534e" />
          <circle cx="41" cy="27.5" r="4" fill="#fde68a" stroke="#57534e" strokeWidth="2" />
          <circle cx="55" cy="27.5" r="4" fill="#fde68a" stroke="#57534e" strokeWidth="2" />
        </g>
      );
    case 'chef':
      return (
        <g>
          <circle cx="38" cy="18" r="8" fill="#fff" stroke="#e2e8f0" />
          <circle cx="48" cy="14" r="9" fill="#fff" stroke="#e2e8f0" />
          <circle cx="58" cy="18" r="8" fill="#fff" stroke="#e2e8f0" />
          <rect x="34" y="18" width="28" height="12" rx="2" fill="#fff" stroke="#e2e8f0" />
        </g>
      );
    case 'scholar':
    default:
      return <path d="M31.5 38c-2-19 35-21 33 0-3-7-10-10-17-10-7 0-12 3-16 10z" fill={look.hair} />;
  }
}

function Outfit({ outfit, look }: { outfit: OutfitId; look: Look }) {
  const body = 'M14 100c2-22 16-31 34-31s32 9 34 31z';
  switch (outfit) {
    case 'scarf':
      return (
        <g>
          <path d={body} fill={look.shirt} />
          <path d="M34 68c6 6 22 6 28 0l2 6c-8 6-24 6-32 0z" fill="#ef4444" />
          <path d="M55 72l6 18-6 1-3-17z" fill="#ef4444" />
          <path d="M38 71l2 4M46 73v4M54 72l-1 4M57 79l3-1M58 85l3-1" stroke="#fff" strokeWidth="2" />
        </g>
      );
    case 'cape':
      return (
        <g>
          <path d="M22 100c0-20 8-30 26-32 18 2 26 12 26 32z" fill="#7c3aed" />
          <path d={body} fill={look.shirt} />
          <circle cx="38" cy="72" r="3" fill="#facc15" />
          <circle cx="58" cy="72" r="3" fill="#facc15" />
          <path d="M38 72q10 4 20 0" stroke="#facc15" strokeWidth="1.5" fill="none" />
        </g>
      );
    case 'graduate':
      return (
        <g>
          <path d={body} fill="#111827" />
          <path d="M38 69l10 31 10-31" fill={look.shirt} />
          <path d="M37 69l8 31h-5l-7-30zM59 69l-8 31h5l7-30z" fill="#f59e0b" />
        </g>
      );
    case 'champion':
      return (
        <g>
          <path d={body} fill={look.shirt} />
          <path d="M40 69l8 14 8-14" fill="none" stroke="#dc2626" strokeWidth="4" />
          <circle cx="48" cy="86" r="7" fill="#facc15" stroke="#b45309" strokeWidth="2" />
          <path d="M48 82l1.4 2.8 3 .4-2.2 2 .6 3-2.8-1.5-2.8 1.5.6-3-2.2-2 3-.4z" fill="#b45309" />
        </g>
      );
    case 'astronaut':
      return (
        <g>
          <path d={body} fill="#f1f5f9" stroke="#cbd5e1" />
          <rect x="40" y="78" width="16" height="11" rx="2" fill="#3b82f6" />
          <circle cx="44" cy="83.5" r="1.6" fill="#f87171" />
          <circle cx="50" cy="83.5" r="1.6" fill="#facc15" />
          <path d="M22 86h8M66 86h8" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
        </g>
      );
    case 'classic':
    default:
      return (
        <g>
          <path d={body} fill={look.shirt} />
          <path d="M40 69l8 9 8-9" fill={look.shirt === '#f8fafc' ? '#e2e8f0' : '#ffffff'} opacity="0.85" />
        </g>
      );
  }
}

/** Code-drawn player avatar: 8 characters × 6 unlockable outfits (no external images). */
export function Avatar({ avatar, outfit, name, size = 56, className }: { avatar?: string | null; outfit?: string | null; name: string; size?: number; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const a = normalizeAvatar({ id: avatar ?? undefined, outfit: outfit ?? undefined });
  const look = LOOKS[a.id];
  const longHair = a.id === 'artist' || a.id === 'ranger';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={name} className={cx('shrink-0 rounded-full', className)}>
      <defs>
        <clipPath id={`av-${uid}`}>
          <circle cx="48" cy="48" r="48" />
        </clipPath>
      </defs>
      <circle cx="48" cy="48" r="48" fill={look.bg} />
      <g clipPath={`url(#av-${uid})`}>
        {longHair && <path d="M28 46C25 22 71 22 68 46l3 26H25z" fill={look.hair} />}
        <Outfit outfit={a.outfit} look={look} />
        <rect x="42" y="56" width="12" height="14" rx="4" fill={look.skin} />
        <circle cx="31.5" cy="45" r="3.8" fill={look.skin} />
        <circle cx="64.5" cy="45" r="3.8" fill={look.skin} />
        <ellipse cx="48" cy="43" rx="16" ry="17.5" fill={look.skin} />
        {a.id !== 'scholar' && a.id !== 'inventor' && <path d="M32 40c-1-15 33-16 32 0-4-6-10-8-16-8s-12 2-16 8z" fill={look.hair} />}
        <circle cx="42" cy="45" r="2" fill={INK} />
        <circle cx="54" cy="45" r="2" fill={INK} />
        <circle cx="38.5" cy="50" r="2.4" fill="#f87171" opacity="0.35" />
        <circle cx="57.5" cy="50" r="2.4" fill="#f87171" opacity="0.35" />
        <path d="M43 52q5 4 10 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        {a.id === 'scholar' && (
          <g fill="none" stroke={INK} strokeWidth="1.7">
            <circle cx="42" cy="45" r="5" />
            <circle cx="54" cy="45" r="5" />
            <path d="M47 45h2" />
          </g>
        )}
        <Hat id={a.id} look={look} />
        {a.outfit === 'champion' && <path d="M66 14l4 5 4-7 4 7 4-5-2 11H68z" fill="#facc15" stroke="#b45309" strokeWidth="1.2" />}
        {a.outfit === 'astronaut' && (
          <g>
            <circle cx="48" cy="40" r="25" fill="#bfdbfe" opacity="0.25" stroke="#93c5fd" strokeWidth="3" />
            <path d="M33 28a18 18 0 0 1 10-7" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.8" />
          </g>
        )}
      </g>
    </svg>
  );
}
