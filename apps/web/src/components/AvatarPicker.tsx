import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AVATAR_IDS, OUTFIT_IDS } from '@vq/shared';
import { api } from '../api/client';
import { qk } from '../api/queries';
import type { AvatarId, MeUser, OutfitId, UserDoc } from '../api/types';
import { useSetMeUser } from '../auth/AuthProvider';
import { errorMessage } from '../i18n/errors';
import { outfitUnlockLevel, outfitUnlocked } from '../lib/game';
import { AVATAR_EMOJI, Avatar, normalizeAvatar } from './Avatar';
import { Alert, Button, Field, Input, Modal, cx } from './ui';
import { useToast } from './Toast';

/** Character creation / wardrobe: 8 characters, 6 outfits unlocked by player level (game rewards only). */
export function AvatarPicker({ open, onClose, user, level }: { open: boolean; onClose: () => void; user: UserDoc; level: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const setMeUser = useSetMeUser();
  const initial = normalizeAvatar(user.avatar);
  const [id, setId] = useState<AvatarId>(initial.id);
  const [outfit, setOutfit] = useState<OutfitId>(initial.outfit);
  const [name, setName] = useState(user.displayName);

  useEffect(() => {
    if (!open) return;
    const a = normalizeAvatar(user.avatar);
    setId(a.id);
    setOutfit(a.outfit);
    setName(user.displayName);
  }, [open, user]);

  const save = useMutation({
    mutationFn: () => api.patch<{ user: MeUser }>('/api/me', { avatar: { id, outfit }, ...(name.trim() && name.trim() !== user.displayName ? { displayName: name.trim() } : {}) }),
    onSuccess: (r) => {
      setMeUser(r.user);
      void qc.invalidateQueries({ queryKey: qk.world });
      toast.success(t('avatar.saved'));
      onClose();
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={user.avatar ? t('avatar.titleEdit') : t('avatar.titleCreate')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} data-testid="avatar-save" disabled={!name.trim()}>
            {t('avatar.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="flex flex-col items-center gap-2 sm:w-44">
          <div className="float">
            <Avatar avatar={id} outfit={outfit} name={name} size={132} />
          </div>
          <p className="text-center text-sm font-semibold">{t(`avatar.names.${id}`)}</p>
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <Field label={t('avatar.displayName')}>{(fid) => <Input id={fid} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />}</Field>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t('avatar.character')}</legend>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('avatar.character')}>
              {AVATAR_IDS.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={a === id}
                  aria-label={t(`avatar.names.${a}`)}
                  onClick={() => setId(a)}
                  className={cx('flex flex-col items-center gap-1 rounded-2xl border-2 p-1.5 transition', a === id ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface-2')}
                >
                  <Avatar avatar={a} outfit={outfit} name="" size={52} />
                  <span className="text-[11px] font-semibold">
                    <span aria-hidden="true">{AVATAR_EMOJI[a]}</span> {t(`avatar.names.${a}`)}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t('avatar.outfit')}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label={t('avatar.outfit')}>
              {OUTFIT_IDS.map((o) => {
                const unlocked = outfitUnlocked(o, level);
                return (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={o === outfit}
                    aria-disabled={!unlocked}
                    aria-label={unlocked ? t(`avatar.outfits.${o}`) : `${t(`avatar.outfits.${o}`)} – ${t('avatar.unlockAt', { level: outfitUnlockLevel(o) })}`}
                    onClick={() => unlocked && setOutfit(o)}
                    className={cx(
                      'relative flex flex-col items-center gap-1 rounded-2xl border-2 p-1.5 text-[11px] font-semibold',
                      o === outfit ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface-2',
                      !unlocked && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <Avatar avatar={id} outfit={o} name="" size={44} className={cx(!unlocked && 'grayscale')} />
                    {t(`avatar.outfits.${o}`)}
                    {!unlocked && (
                      <span className="text-[10px] text-muted">
                        🔒 {t('avatar.levelShort', { level: outfitUnlockLevel(o) })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">{t('avatar.outfitHint')}</p>
          </fieldset>
          {save.isError && <Alert tone="danger">{errorMessage(t, save.error)}</Alert>}
        </div>
      </div>
    </Modal>
  );
}
