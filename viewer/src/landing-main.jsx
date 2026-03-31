import React from 'react';
import ReactDOM from 'react-dom/client';
import LandingPage from './LandingPage.jsx';
import { I18nProvider } from './i18n.jsx';
import { LexiconProvider, loadLexicon } from './lexicon.jsx';

async function bootstrap() {
  const landingLexicon = await loadLexicon('landing');

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <I18nProvider>
        <LexiconProvider pageId="landing" lexicon={landingLexicon}>
          <LandingPage />
        </LexiconProvider>
      </I18nProvider>
    </React.StrictMode>
  );
}

bootstrap();
