import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useI18n } from './i18n';

const LexiconContext = createContext(null);

export async function loadLexicon(pageId) {
  const response = await fetch(`/${pageId}/lexicon.json`);
  if (!response.ok) {
    throw new Error(`Failed to load lexicon for ${pageId}: ${response.statusText}`);
  }
  return response.json();
}

export function formatLexiconText(template, params = {}) {
  if (typeof template !== 'string') {
    return '';
  }
  return template.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? '');
}

export function LexiconProvider({ pageId, lexicon, children }) {
  const { locale } = useI18n();

  const activeLexicon = useMemo(
    () => lexicon?.[locale] ?? lexicon?.en ?? {},
    [lexicon, locale]
  );

  useEffect(() => {
    const title = activeLexicon?.document?.title;
    if (typeof document !== 'undefined' && title) {
      document.title = title;
    }
  }, [activeLexicon]);

  const value = useMemo(
    () => ({
      pageId,
      locale,
      lexicon: activeLexicon,
    }),
    [activeLexicon, locale, pageId]
  );

  return <LexiconContext.Provider value={value}>{children}</LexiconContext.Provider>;
}

export function useLexicon() {
  const context = useContext(LexiconContext);
  if (!context) {
    throw new Error('useLexicon must be used within a LexiconProvider');
  }
  return context;
}

export function useLexiconSection(sectionName) {
  const { lexicon } = useLexicon();
  return lexicon?.[sectionName] ?? {};
}
