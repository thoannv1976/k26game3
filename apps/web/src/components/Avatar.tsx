import { useId } from 'react';
import { AVATARS } from '@vq/shared';
import { cx } from './ui';

type AvatarKey = (typeof AVATARS)[number];
type RoleKind = 'student' | 'officer' | 'it' | 'manager' | 'clerk' | 'expert' | 'journalist';

const ROLE_STYLE: Record<RoleKind, { bg: string; clothing: string; accent: string }> = {
  student: { bg: '#8fb3d9', clothing: '#3f6e9e', accent: '#f2c14e' },
  officer: { bg: '#cfd8e3', clothing: '#1f3550', accent: '#e8cf92' },
  it: { bg: '#9fd3b8', clothing: '#2f6f57', accent: '#1b2230' },
  manager: { bg: '#c8b2dc', clothing: '#3b3552', accent: '#c0392b' },
  clerk: { bg: '#f1c48f', clothing: '#8a5a36', accent: '#fffdf7' },
  expert: { bg: '#f0a99c', clothing: '#f4f1ea', accent: '#5b7fa6' },
  journalist: { bg: '#e6d08e', clothing: '#6b4b3a', accent: '#c0392b' },
};
const SKIN = ['#f3cfac', '#e2b088', '#c98f62', '#9a6544'];
const HAIR = ['#2a1d16', '#4a3020', '#6b4423', '#1b1b1f', '#8b5a2b'];

function parse(key: string): { role: RoleKind; female: boolean; index: number } {
  const idx = Math.max(0, AVATARS.indexOf(key as AvatarKey));
  const [role, g] = key.split('_') as [string, string | undefined];
  const known = (Object.keys(ROLE_STYLE) as RoleKind[]).includes(role as RoleKind) ? (role as RoleKind) : 'student';
  return { role: known, female: g === 'f', index: idx };
}

/** Flat, code-drawn portrait for a character avatar key (see AVATARS). Distinct per role and gender. */
export function Avatar({ avatar, name, size = 56, className }: { avatar: string; name: string; size?: number; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const { role, female, index } = parse(avatar);
  const st = ROLE_STYLE[role];
  const skin = SKIN[(index * 3 + 1) % SKIN.length]!;
  const hair = HAIR[(index * 2) % HAIR.length]!;
  const ink = '#1b2230';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={name} className={cx('shrink-0 rounded-full', className)}>
      <defs>
        <clipPath id={`av-${uid}`}>
          <circle cx="48" cy="48" r="48" />
        </clipPath>
      </defs>
      <circle cx="48" cy="48" r="48" fill={st.bg} />
      <g clipPath={`url(#av-${uid})`}>
        {/* long hair behind the head */}
        {female && <path d="M27 46C24 20 72 20 69 46l3 30H24z" fill={hair} />}
        {/* body */}
        <path d="M12 100c2-24 17-33 36-33s34 9 36 33z" fill={st.clothing} />
        <rect x="42" y="55" width="12" height="15" rx="4" fill={skin} />
        {role === 'student' && (
          <>
            <path d="M36 68c3 6 21 6 24 0" fill="none" stroke="#e9eef5" strokeWidth="4" strokeLinecap="round" />
            <path d="M28 72l-4 28M68 72l4 28" stroke={st.accent} strokeWidth="5" strokeLinecap="round" />
          </>
        )}
        {role === 'officer' && (
          <>
            <path d="M40 68l8 10 8-10" fill="#e9eef5" />
            <path d="M62 80l5-2 5 2v5l-5 3-5-3z" fill={st.accent} />
          </>
        )}
        {role === 'it' && <path d="M40 68h16l-8 9z" fill="#e9eef5" />}
        {role === 'manager' && (
          <>
            <path d="M38 67l10 12 10-12" fill="#f4f1ea" />
            {female ? <circle cx="48" cy="77" r="2.5" fill={st.accent} /> : <path d="M48 70l-3 6 3 16 3-16z" fill={st.accent} />}
            <path d="M38 67l10 22M58 67L48 89" stroke="#2a253a" strokeWidth="2" />
          </>
        )}
        {role === 'clerk' && (
          <>
            <path d="M34 70l14 8 14-8v30H34z" fill="#5e3c22" />
            <rect x="52" y="80" width="12" height="7" rx="1.5" fill={st.accent} />
            <path d="M54 83.5h8" stroke={ink} strokeWidth="1.2" />
          </>
        )}
        {role === 'expert' && (
          <>
            <path d="M40 67l8 14 8-14" fill="#9fb4cc" />
            <path d="M40 67L34 100M56 67l6 33" stroke="#d8d3c8" strokeWidth="2" />
            <rect x="58" y="82" width="7" height="2" fill={st.accent} />
          </>
        )}
        {role === 'journalist' && (
          <>
            <path d="M40 67l8 6 8-6" fill="#f4f1ea" />
            <path d="M42 68l6 16 6-16" fill="none" stroke={st.accent} strokeWidth="2" />
            <rect x="43" y="84" width="10" height="8" rx="1.5" fill="#fffdf7" stroke={st.accent} strokeWidth="1.5" />
          </>
        )}
        {/* head */}
        <circle cx="31.5" cy="44" r="3.8" fill={skin} />
        <circle cx="64.5" cy="44" r="3.8" fill={skin} />
        <ellipse cx="48" cy="42" rx="16" ry="18" fill={skin} />
        {/* hair on top */}
        {female ? (
          <path d="M31 43c-2-22 36-24 34 0-5-10-15-13-22-9-4 2-8 5-12 9z" fill={hair} />
        ) : (
          <path d="M31.5 40c-2-19 35-21 33 0-3-7-10-10-17-10-7 0-12 3-16 10z" fill={hair} />
        )}
        {/* face */}
        <circle cx="42" cy="44" r="1.9" fill={ink} />
        <circle cx="54" cy="44" r="1.9" fill={ink} />
        <path d="M43.5 51.5q4.5 3.5 9 0" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
        {(role === 'expert' || (role === 'it' && !female) || role === 'journalist') && (
          <g fill="none" stroke={ink} strokeWidth="1.6">
            <circle cx="42" cy="44" r="5" />
            <circle cx="54" cy="44" r="5" />
            <path d="M47 44h2" />
          </g>
        )}
        {role === 'officer' && (
          <>
            <path d="M28 33c4-11 36-11 40 0z" fill={st.clothing} />
            <rect x="27" y="31" width="42" height="5" rx="2.5" fill="#152639" />
            <circle cx="48" cy="28" r="3" fill={st.accent} />
          </>
        )}
        {role === 'it' && (
          <g fill="none" stroke={ink} strokeWidth="2.6">
            <path d="M30 44c0-22 36-22 36 0" />
            <rect x="27" y="40" width="6" height="10" rx="2.5" fill={ink} />
            <rect x="63" y="40" width="6" height="10" rx="2.5" fill={ink} />
            <path d="M30 50c2 7 8 9 13 8" strokeWidth="1.8" />
          </g>
        )}
        {role === 'journalist' && <path d="M62 30l10-6 1.5 2.5-10 6z" fill={st.accent} />}
      </g>
    </svg>
  );
}
