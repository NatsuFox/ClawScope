import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'clawscope.locale';
const SUPPORTED_LOCALES = new Set(['en', 'zh']);

function resolveInitialLocale() {
  if (typeof window === 'undefined') {
    return 'en';
  }

  const savedLocale = window.localStorage.getItem(STORAGE_KEY);
  if (SUPPORTED_LOCALES.has(savedLocale)) {
    return savedLocale;
  }

  const browserLocale = String(window.navigator.language || '').toLowerCase();
  if (browserLocale.startsWith('zh')) {
    return 'zh';
  }

  return 'en';
}

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(resolveInitialLocale);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      timeLocale: locale === 'zh' ? 'zh-CN' : 'en-US',
    }),
    [locale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
