import React from 'react';
import TraceStudio from './components/TraceStudio';
import LocaleToggle from './components/LocaleToggle';
import { useLexiconSection } from './lexicon';
import './styles/App.css';

function renderDemoModeNote(copy) {
  return (
    <div className="studio-mode-note">
      <div>
        <span className="studio-mode-badge">{copy.demoBadge}</span>
        <strong>{copy.demoModeTitle}</strong>
        <p>{copy.demoModeBody}</p>
      </div>
      <div className="studio-mode-links">
        <a className="studio-mode-link" href="./index.html">
          {copy.demoModeLink}
        </a>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const copy = useLexiconSection('page');

  return (
    <div className="app clawscope-app">
      <div className="page-shell">
        <header className="site-header glass-panel section-animate">
          <a className="brand" href="#top" aria-label={copy.brandHomeAria}>
            <span className="brand-mark">C</span>
            <span className="brand-lockup">
              <strong>{copy.brandName}</strong>
              <small>{copy.brandTagline}</small>
            </span>
          </a>

          <nav className="site-nav" aria-label={copy.navAria}>
            <a href="#priorities">{copy.navPriorities}</a>
            <a href="#features">{copy.navFeatures}</a>
            <a href="#demo-studio">{copy.navDemo}</a>
            <a href="./index.html" className="nav-cta">
              {copy.navDebugger}
            </a>
            <LocaleToggle className="landing-locale-toggle" />
          </nav>
        </header>

        <main className="landing-main">
          <section className="hero" id="top">
            <div className="hero-copy glass-panel section-animate">
              <p className="eyebrow">{copy.heroEyebrow}</p>
              <h1>{copy.heroTitle}</h1>
              <p className="hero-lead">{copy.heroLead}</p>

              <div className="hero-actions">
                <a className="button primary" href="#demo-studio">
                  {copy.heroPrimaryAction}
                </a>
                <a className="button secondary" href="./index.html">
                  {copy.heroSecondaryAction}
                </a>
              </div>

              <div className="hero-metrics hero-metrics-compact">
                {copy.heroStats?.map((metric) => (
                  <article key={metric.label} className="interactive-card">
                    <strong>{metric.value}</strong>
                    <span>{metric.label}</span>
                  </article>
                ))}
              </div>

              <div className="hero-highlight-list">
                {copy.heroHighlights?.map((highlight) => (
                  <div key={highlight} className="hero-highlight-item">
                    <span className="hero-highlight-dot" />
                    <p>{highlight}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="hero-visual glass-panel section-animate delay-1">
              <div className="hero-side-panel">
                <p className="eyebrow">{copy.sideEyebrow}</p>
                <h2>{copy.sideTitle}</h2>
                <div className="priority-mini-grid">
                  {copy.priorities?.map((priority) => (
                    <article key={priority.title} className="priority-mini-card interactive-card">
                      <strong>{priority.title}</strong>
                      <p>{priority.body}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="hero-side-panel">
                <p className="eyebrow">{copy.workflowEyebrow}</p>
                <div className="workflow-preview-grid">
                  {copy.workflowSteps?.map((step) => (
                    <article key={step.label} className="workflow-preview-card interactive-card">
                      <span>{step.label}</span>
                      <strong>{step.title}</strong>
                      <p>{step.body}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="priority-shell glass-panel section-animate" id="priorities">
            <div className="section-copy compact-copy">
              <p className="eyebrow">{copy.sideEyebrow}</p>
              <h2>{copy.sideTitle}</h2>
            </div>

            <div className="priority-grid">
              {copy.priorities?.map((priority) => (
                <article key={priority.title} className="priority-card interactive-card">
                  <strong>{priority.title}</strong>
                  <p>{priority.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="feature-shell glass-panel section-animate" id="features">
            <div className="feature-layout">
              <div className="feature-column">
                <div className="section-copy compact-copy">
                  <p className="eyebrow">{copy.featureEyebrow}</p>
                  <h2>{copy.featureTitle}</h2>
                  <p className="section-lead">{copy.featureLead}</p>
                </div>

                <div className="feature-card-grid">
                  {copy.features?.map((feature) => (
                    <article key={feature.title} className="feature-card interactive-card">
                      <strong>{feature.title}</strong>
                      <p>{feature.body}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="feature-column">
                <div className="section-copy compact-copy">
                  <p className="eyebrow">{copy.workflowEyebrow}</p>
                  <h2>{copy.workflowTitle}</h2>
                </div>

                <div className="workflow-stack">
                  {copy.workflowSteps?.map((step) => (
                    <article key={step.label} className="workflow-card interactive-card">
                      <span>{step.label}</span>
                      <div>
                        <strong>{step.title}</strong>
                        <p>{step.body}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="status-shell glass-panel section-animate">
            <div className="section-copy compact-copy">
              <p className="eyebrow">{copy.statusEyebrow}</p>
              <h2>{copy.statusTitle}</h2>
              <p className="section-lead">{copy.statusLead}</p>
            </div>

            <div className="phase-strip">
              {copy.deliveryPhases?.map((phase) => (
                <article
                  key={phase.label}
                  className={`phase-card interactive-card ${
                    phase.state === 'complete' ? 'is-complete' : 'is-pending'
                  }`}
                >
                  <span>{phase.label}</span>
                  <strong>{phase.title}</strong>
                  <small>{phase.state === 'complete' ? copy.phaseComplete : copy.phasePending}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="studio-shell glass-panel section-animate" id="demo-studio">
            <div className="section-copy studio-heading compact-copy">
              <p className="eyebrow">{copy.studioEyebrow}</p>
              <h2>{copy.studioTitle}</h2>
              <p className="section-lead">{copy.studioLead}</p>
            </div>

            <TraceStudio
              initialSourceMode="sample"
              sourceModes={['sample']}
              allowFileUpload={false}
              modeNote={() => renderDemoModeNote(copy)}
              enableMultiAgentView
            />
          </section>
        </main>
      </div>
    </div>
  );
}
