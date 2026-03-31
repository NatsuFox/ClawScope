import React, { useEffect, useId, useState } from 'react';
import TraceStudio from './components/TraceStudio';
import LocaleToggle from './components/LocaleToggle';
import { formatLexiconText, useLexiconSection } from './lexicon';
import './styles/Debugger.css';

const DEBUGGER_THEME_STORAGE_KEY = 'clawscope.debugger.theme';

function resolveInitialTheme() {
  if (typeof window === 'undefined') {
    return 'dark';
  }
  const savedTheme = window.localStorage.getItem(DEBUGGER_THEME_STORAGE_KEY);
  return savedTheme === 'light' ? 'light' : 'dark';
}

function renderBackendDebuggerHelp({ backendApiUrl, viewerOrigin, setSourceMode, copy }) {
  return (
    <div className="studio-help-panel" id="studio-startup">
      <div className="studio-help-header">
        <span className="studio-mode-badge">{copy.helpBadge}</span>
        <strong>{copy.helpTitle}</strong>
      </div>
      <p className="studio-help-copy">{formatLexiconText(copy.helpCopy, { backendApiUrl })}</p>
      <div className="studio-command-grid">
        <article className="studio-command-card">
          <span>{copy.terminalOne}</span>
          <strong>{copy.startTraceServer}</strong>
          <pre className="studio-command-block">
            <code>{copy.traceServerCommand}</code>
          </pre>
        </article>
        <article className="studio-command-card">
          <span>{copy.terminalTwo}</span>
          <strong>{copy.startDebuggerUi}</strong>
          <pre className="studio-command-block">
            <code>{copy.viewerCommand}</code>
          </pre>
        </article>
        <article className="studio-command-card">
          <span>{copy.browser}</span>
          <strong>{copy.openDebugger}</strong>
          <pre className="studio-command-block">
            <code>{`${viewerOrigin}
${copy.keepDatabaseSelected}`}</code>
          </pre>
          <button
            type="button"
            className="studio-inline-action"
            onClick={() => setSourceMode('sample')}
          >
            {copy.fallbackDemos}
          </button>
        </article>
      </div>
    </div>
  );
}

function renderModeNote({ sourceMode, backendApiUrl, viewerOrigin, copy }) {
  return (
    <div className="studio-mode-note">
      <div>
        <span className="studio-mode-badge">
          {sourceMode === 'database' ? copy.backendModeBadge : copy.demoModeBadge}
        </span>
        <strong>{sourceMode === 'database' ? copy.backendModeTitle : copy.demoModeTitle}</strong>
        <p>{formatLexiconText(copy.modeBody, { viewerOrigin, backendApiUrl })}</p>
      </div>
      <div className="studio-mode-links">
        <a className="studio-mode-link" href="./landing.html">
          {copy.openLanding}
        </a>
        <div className="studio-inline-note">{copy.integratedMultiAgent}</div>
      </div>
    </div>
  );
}

export default function App() {
  const copy = useLexiconSection('page');
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [theme, setTheme] = useState(resolveInitialTheme);
  const controlsPanelId = useId();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(DEBUGGER_THEME_STORAGE_KEY, theme);
  }, [theme]);

  return (
    <div className={`debugger-page theme-${theme}`}>
      <div className="debugger-floating-controls">
        {controlsExpanded && (
          <div
            id={controlsPanelId}
            className="debugger-floating-panel"
            role="group"
            aria-label={copy.controlsPanelAria}
          >
            <a href="./landing.html" onClick={() => setControlsExpanded(false)}>
              {copy.navLanding}
            </a>
            <LocaleToggle />
            <div className="debugger-theme-toggle" role="group" aria-label={copy.themeControlsAria}>
              <button
                type="button"
                className={theme === 'dark' ? 'is-active' : ''}
                aria-pressed={theme === 'dark'}
                onClick={() => setTheme('dark')}
              >
                {copy.themeDark}
              </button>
              <button
                type="button"
                className={theme === 'light' ? 'is-active' : ''}
                aria-pressed={theme === 'light'}
                onClick={() => setTheme('light')}
              >
                {copy.themeLight}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="debugger-floating-toggle"
          aria-label={controlsExpanded ? copy.controlsCollapseAria : copy.controlsExpandAria}
          aria-controls={controlsPanelId}
          aria-expanded={controlsExpanded}
          onClick={() => setControlsExpanded((current) => !current)}
        >
          <span className="debugger-floating-toggle-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      <div className="debugger-shell">
        <section className="debugger-panel" id="studio">
          <TraceStudio
            initialSourceMode="database"
            sourceModes={['database', 'sample']}
            modeNote={(props) => renderModeNote({ ...props, copy })}
            renderDatabaseHelp={(props) => renderBackendDebuggerHelp({ ...props, copy })}
            enableMultiAgentView
          />
        </section>
      </div>
    </div>
  );
}
