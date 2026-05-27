import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { saveLocale, type Locale } from '@/core/config/i18n';

export interface UseLanguageReturn {
  locale: ComputedRef<Locale>;
  isRussian: ComputedRef<boolean>;
  isEnglish: ComputedRef<boolean>;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
}

export const useLanguage = (): UseLanguageReturn => {
  const { locale } = useI18n();

  const currentLocale = computed<Locale>(() => locale.value as Locale);

  const isRussian = computed(() => currentLocale.value === 'ru');
  const isEnglish = computed(() => currentLocale.value === 'en');

  const setLocale = (newLocale: Locale): void => {
    locale.value = newLocale;
    saveLocale(newLocale);
  };

  const toggleLocale = (): void => {
    const newLocale: Locale = currentLocale.value === 'ru' ? 'en' : 'ru';
    setLocale(newLocale);
  };

  return {
    locale: currentLocale,
    isRussian,
    isEnglish,
    setLocale,
    toggleLocale,
  };
};
