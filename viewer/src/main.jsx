import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { I18nProvider } from './i18n.jsx'
import { LexiconProvider, loadLexicon } from './lexicon.jsx'

async function bootstrap() {
  const debuggerLexicon = await loadLexicon('debugger')

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <I18nProvider>
        <LexiconProvider pageId="debugger" lexicon={debuggerLexicon}>
          <App />
        </LexiconProvider>
      </I18nProvider>
    </React.StrictMode>,
  )
}

bootstrap()
