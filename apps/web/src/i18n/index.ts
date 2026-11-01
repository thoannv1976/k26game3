import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import type { I18nText } from '@vq/shared';
import { getStored, setStored } from '../lib/storage';
import { en } from './en';
import { vi } from './vi';

export type Locale = 'vi' | 'en';
const KEY = 'ed.locale';


export function storedLocale(): Locale {
  const s = getStored(KEY);
  return s === 'en' || s === 'vi' ? s : 'vi';
}

void i18n.use(initReactI18next).init({
  resources: { vi: { translation: vi }, en: { translation: en } },
  lng: storedLocale(),
  fallbackLng: 'vi',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export function setLocale(l: Locale) {
  setStored(KEY, l);
  if (i18n.language !== l) void i18n.changeLanguage(l);
}

export function currentLocale(): Locale {
  return i18n.language === 'en' ? 'en' : 'vi';
}

/** Picks the current-language text of an {en, vi} object. */
export function useLocalized() {
  const { i18n: inst } = useTranslation();
  const lang: Locale = inst.language === 'en' ? 'en' : 'vi';
  return { lang, L: (text: I18nText | null | undefined) => (text ? text[lang] || text.en : '') };
}

export default i18n;
