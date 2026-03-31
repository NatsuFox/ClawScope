import React from 'react';
import { useI18n } from '../i18n';
import { useLexiconSection } from '../lexicon';

export default function LocaleToggle({ className = '' }) {
  const { locale, setLocale } = useI18n();
  const copy = useLexiconSection('localeToggle');
  const classes = ['locale-toggle', className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="group" aria-label={copy.groupLabel}>
      <button
        type="button"
        className={locale === 'en' ? 'is-active' : ''}
        onClick={() => setLocale('en')}
      >
        {copy.english}
      </button>
      <button
        type="button"
        className={locale === 'zh' ? 'is-active' : ''}
        onClick={() => setLocale('zh')}
      >
        {copy.chinese}
      </button>
    </div>
  );
}
