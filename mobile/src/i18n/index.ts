import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en';
import ml from './ml';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ml', label: 'മലയാളം' },
] as const;
export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const KEY = 'wi.language';

function deviceLanguage(): LanguageCode {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === 'ml' ? 'ml' : 'en';
  } catch {
    return 'en';
  }
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ml: { translation: ml } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export async function loadSavedLanguage() {
  const saved = await AsyncStorage.getItem(KEY);
  if (saved && saved !== i18n.language) await i18n.changeLanguage(saved);
}

export async function setLanguage(code: LanguageCode) {
  await AsyncStorage.setItem(KEY, code);
  await i18n.changeLanguage(code);
}

export default i18n;
