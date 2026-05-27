import { createI18n } from 'vue-i18n';
import ru from '@/shared/locales/ru';
import en from '@/shared/locales/en';

export type Locale = 'ru' | 'en';

export type MessageSchema = typeof ru;

const STORAGE_KEY = 'app-locale';
const DEFAULT_LOCALE: Locale = 'ru';

const getSavedLocale = (): Locale => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'en' || saved === 'ru' ? saved : DEFAULT_LOCALE;
};

export const i18n = createI18n<[MessageSchema], Locale>({
  legacy: false,
  locale: getSavedLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    ru,
    en,
  },
});

export const saveLocale = (locale: Locale): void => {
  localStorage.setItem(STORAGE_KEY, locale);
};
