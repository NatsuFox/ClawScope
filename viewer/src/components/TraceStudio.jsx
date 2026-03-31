import React, { useEffect, useMemo, useState } from 'react';
import SynchronizedTraceView from './SynchronizedTraceView';
import SummaryPanel from './SummaryPanel';
import FilterPanel from './FilterPanel';
import SpanDetailModal from './SpanDetailModal';
import MultiAgentTraceView, { hasMultiAgentSignals } from './MultiAgentTraceView';
import { calculateSummary } from '../utils/traceUtils';
import { DatabaseAdapter, convertToViewerFormat } from '../utils/databaseAdapter';
import { DEMO_TRACE_OPTIONS, DEMO_TRACE_PATH_PREFIX } from '../constants/demoTraces';
import { formatLexiconText, useLexiconSection } from '../lexicon';

function resolveViewerOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://127.0.0.1:3013';
}

const HARNESS_ORDER = ['openclaw', 'claude-code', 'codex'];

function formatHarnessLabel(harness, copy) {
  switch (harness) {
    case 'openclaw':
      return copy.harnessOpenClaw;
    case 'claude-code':
      return copy.harnessClaudeCode;
    case 'codex':
      return copy.harnessCodex;
    default:
      return harness || copy.unknownHarness;
  }
}

function formatTraceSemantics(semantics, copy) {
  switch (semantics) {
    case 'delegation-aware':
      return copy.delegated;
    case 'multi-actor':
      return copy.multiActor;
    case 'single-actor':
      return copy.singleActor;
    case 'multi-run':
      return copy.multiRun;
    case 'single-run':
      return copy.singleRun;
    case 'multi-session':
      return copy.multiSession;
    case 'session-scoped':
      return copy.sessionScoped;
    case 'span-only':
      return copy.spanOnly;
    default:
      return semantics || copy.unknown;
  }
}

function formatAgentIdentityMode(mode, copy) {
  switch (mode) {
    case 'explicit':
      return copy.explicitAgentIds;
    case 'run_id':
      return copy.runIdsOnly;
    case 'session_key':
      return copy.sessionIdsOnly;
    case 'none':
      return copy.noActorIdentity;
    default:
      return mode || copy.unknown;
  }
}

function getSampleTraceLabel(option, demoTraceLabels) {
  if (!option) {
    return '';
  }
  return demoTraceLabels?.[option.key] || option.value;
}

function getErrorDetail(error) {
  if (!error) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message || '';
  }
  return String(error);
}

function isGenericFetchFailure(detail) {
  return detail === 'Failed to fetch' || detail === 'NetworkError when attempting to fetch resource.';
}

function createStudioError(kind, error) {
  const detail = getErrorDetail(error).trim();
  return {
    kind,
    detail: isGenericFetchFailure(detail) ? '' : detail,
  };
}

function formatStudioError(error, copy) {
  if (!error) {
    return '';
  }
  const prefix = copy[error.kind] || '';
  if (!error.detail) {
    return prefix;
  }
  return prefix ? `${prefix}: ${error.detail}` : error.detail;
}

export default function TraceStudio({
  initialSourceMode = 'database',
  sourceModes = ['database', 'sample'],
  sampleTraces = DEMO_TRACE_OPTIONS,
  samplePathPrefix = DEMO_TRACE_PATH_PREFIX,
  allowFileUpload = true,
  modeNote = null,
  renderDatabaseHelp = null,
  enableMultiAgentView = false,
}) {
  const copy = useLexiconSection('traceStudio');
  const demoTraceLabels = useLexiconSection('demoTraces');

  const enabledSourceModes = sourceModes.filter((mode) => mode === 'database' || mode === 'sample');
  const resolvedInitialMode = enabledSourceModes.includes(initialSourceMode)
    ? initialSourceMode
    : enabledSourceModes[0] || 'sample';

  const dbAdapter = useMemo(() => new DatabaseAdapter(), []);
  const viewerOrigin = resolveViewerOrigin();
  const backendApiUrl = dbAdapter.baseUrl;

  const [traceData, setTraceData] = useState(null);
  const [filteredSpans, setFilteredSpans] = useState([]);
  const [focusedSpan, setFocusedSpan] = useState(null);
  const [detailSpan, setDetailSpan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedSample, setSelectedSample] = useState(sampleTraces[0]?.value || '');
  const [sourceMode, setSourceMode] = useState(resolvedInitialMode);
  const [availableTraces, setAvailableTraces] = useState([]);
  const [selectedTraceId, setSelectedTraceId] = useState(null);
  const [activeView, setActiveView] = useState('synchronized');

  const groupedAvailableTraces = useMemo(() => {
    const grouped = new Map();
    for (const trace of availableTraces) {
      const harness = trace.source_harness || 'unknown';
      if (!grouped.has(harness)) {
        grouped.set(harness, []);
      }
      grouped.get(harness).push(trace);
    }

    return Array.from(grouped.entries())
      .sort(([left], [right]) => {
        const leftIndex = HARNESS_ORDER.indexOf(left);
        const rightIndex = HARNESS_ORDER.indexOf(right);
        if (leftIndex !== -1 || rightIndex !== -1) {
          const boundedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
          const boundedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
          return boundedLeft - boundedRight;
        }
        return left.localeCompare(right);
      })
      .map(([harness, traces]) => ({
        harness,
        traces,
      }));
  }, [availableTraces]);

  const multiAgentAvailable = enableMultiAgentView && hasMultiAgentSignals(traceData?.spans || []);

  useEffect(() => {
    if (sourceMode === 'sample') {
      loadSampleTrace();
      return;
    }

    if (sourceMode === 'database') {
      loadDatabaseTraces();
    }
  }, [sourceMode]);

  useEffect(() => {
    if (!filteredSpans.length) {
      setFocusedSpan(null);
      return;
    }
    if (focusedSpan && filteredSpans.some((span) => span.record_id === focusedSpan.record_id)) {
      return;
    }
    setFocusedSpan(filteredSpans[0]);
  }, [filteredSpans, focusedSpan]);

  useEffect(() => {
    if (!multiAgentAvailable && activeView === 'multiAgent') {
      setActiveView('synchronized');
    }
  }, [activeView, multiAgentAvailable]);

  const loadDatabaseTraces = async () => {
    setLoading(true);
    setError(null);
    try {
      const traces = (await dbAdapter.listTraces()).sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      );

      setAvailableTraces(traces);

      if (traces.length === 0) {
        setTraceData(null);
        setFilteredSpans([]);
        setFocusedSpan(null);
        setSelectedTraceId(null);
        setLoading(false);
        return;
      }

      const nextTraceId =
        selectedTraceId && traces.some((trace) => trace.trace_id === selectedTraceId)
          ? selectedTraceId
          : traces[0].trace_id;

      await loadDatabaseTrace(nextTraceId);
    } catch (err) {
      setError(createStudioError('loadDatabaseTracesError', err));
      setLoading(false);
    }
  };

  const loadDatabaseTrace = async (traceId) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await dbAdapter.loadTrace(traceId);
      const data = {
        ...convertToViewerFormat(loaded.spans),
        ...loaded.metadata,
        trace_summary: loaded.summary,
      };
      setTraceData(data);
      setFilteredSpans(data.spans || []);
      setFocusedSpan(data.spans?.[0] || null);
      setDetailSpan(null);
      setSelectedTraceId(traceId);
    } catch (err) {
      setError(createStudioError('loadTraceError', err));
    } finally {
      setLoading(false);
    }
  };

  const loadSampleTrace = async (filename = selectedSample) => {
    if (!filename) {
      setTraceData(null);
      setFilteredSpans([]);
      setFocusedSpan(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${samplePathPrefix}/${filename}`);
      if (!response.ok) throw new Error(response.statusText || `HTTP ${response.status}`);
      const data = await response.json();
      setTraceData(data);
      setFilteredSpans(data.spans || []);
      setFocusedSpan(data.spans?.[0] || null);
      setDetailSpan(null);
    } catch (err) {
      setError(createStudioError('loadSampleTraceError', err));
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setTraceData(data);
      setFilteredSpans(data.spans || []);
      setFocusedSpan(data.spans?.[0] || null);
      setDetailSpan(null);
    } catch (err) {
      setError(createStudioError('parseTraceFileError', err));
    } finally {
      setLoading(false);
    }
  };

  const summary = traceData ? calculateSummary(filteredSpans) : null;
  const traceTitle = traceData?.trace_name || traceData?.trace_id || copy.emptyTitle;
  const studioMetrics = summary
    ? [
        { value: filteredSpans.length.toString(), label: copy.visibleSpans },
        { value: availableTraces.length.toString(), label: copy.storedTraces },
        {
          value:
            sourceMode === 'sample'
              ? copy.bundledDemo
              : formatHarnessLabel(traceData?.source_harness, copy) || copy.databaseTrace,
          label: copy.traceSource,
        },
      ]
    : [
        {
          value: sourceMode === 'database' ? copy.backendFirst : copy.demoFirst,
          label: copy.currentOperatingStance,
        },
        { value: copy.waterfall, label: copy.primarySurface },
        {
          value: sourceMode === 'database' ? copy.serverBacked : copy.frontendAsset,
          label: copy.primaryDeliveryPath,
        },
      ];

  const databaseHelpSection =
    sourceMode === 'database' && renderDatabaseHelp
      ? renderDatabaseHelp({ backendApiUrl, viewerOrigin, setSourceMode })
      : null;
  const modeNoteSection = modeNote
    ? modeNote({ sourceMode, backendApiUrl, viewerOrigin })
    : null;

  const renderStudioState = () => {
    if (loading) {
      return (
        <div className="studio-state-card">
          <span className="studio-state-label">{copy.loading}</span>
          <h3>{copy.loadingTitle}</h3>
          <p>{copy.loadingBody}</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="studio-state-card is-error">
          <span className="studio-state-label">{copy.viewerIssue}</span>
          <h3>{copy.needsFreshSource}</h3>
          <p>{formatStudioError(error, copy)}</p>
          <div className="studio-state-actions">
            <button
              type="button"
              className="studio-action-button is-primary"
              onClick={() =>
                sourceMode === 'sample' ? loadSampleTrace(selectedSample) : loadDatabaseTraces()
              }
            >
              {copy.retryCurrentSource}
            </button>
            {enabledSourceModes.length > 1 && (
              <button
                type="button"
                className="studio-action-button"
                onClick={() => setSourceMode(sourceMode === 'sample' ? 'database' : 'sample')}
              >
                {formatLexiconText(copy.switchTo, {
                  mode:
                    sourceMode === 'sample' ? copy.databaseToggleLabel : copy.sampleToggleLabel,
                })}
              </button>
            )}
          </div>
          {databaseHelpSection}
        </div>
      );
    }

    if (!traceData) {
      return (
        <div className="studio-state-card">
          <span className="studio-state-label">{copy.emptyLabel}</span>
          <h3>{copy.emptyTitle}</h3>
          <p>{copy.emptyBody}</p>
          {databaseHelpSection}
        </div>
      );
    }

    return (
      <>
        <div className="trace-info">
          <div className="trace-info-copy">
            <span className="trace-info-label">{copy.loadedTrace}</span>
            <h2>{traceTitle}</h2>
            <div className="trace-pill-row">
              {traceData.source_harness && (
                <span className="trace-pill">
                  {copy.currentSource}: {formatHarnessLabel(traceData.source_harness, copy)}
                </span>
              )}
              {traceData.trace_semantics && (
                <span className="trace-pill">
                  {copy.semantics}: {formatTraceSemantics(traceData.trace_semantics, copy)}
                </span>
              )}
              {traceData.agent_identity_mode && (
                <span className="trace-pill">
                  {copy.actorIdentity}: {formatAgentIdentityMode(traceData.agent_identity_mode, copy)}
                </span>
              )}
              <span className={`trace-pill ${multiAgentAvailable ? 'is-positive' : ''}`}>
                {copy.multiAgent}: {multiAgentAvailable ? copy.available : copy.unavailable}
              </span>
            </div>
            {traceData.cwd && <div className="trace-subtitle">{traceData.cwd}</div>}
          </div>

          <div className="studio-trace-metrics">
            {studioMetrics.map((metric) => (
              <article key={metric.label}>
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="studio-support-grid">
          <SummaryPanel summary={summary} onSpanClick={setFocusedSpan} />
          <FilterPanel spans={traceData.spans || []} onFilterChange={setFilteredSpans} />
        </div>

        <div className="waterfall-container">
          <div className="waterfall-header">
            <div>
              <h3>
                {activeView === 'multiAgent' ? copy.multiAgentHeading : copy.synchronizedHeading}
              </h3>
              <p>
                {activeView === 'multiAgent' ? copy.multiAgentBody : copy.synchronizedBody}
              </p>
            </div>
            {multiAgentAvailable && (
              <div className="studio-view-switch">
                <span>{copy.viewLabel}</span>
                <div className="studio-view-switch-buttons">
                  <button
                    type="button"
                    className={activeView === 'synchronized' ? 'is-active' : ''}
                    onClick={() => setActiveView('synchronized')}
                  >
                    {copy.synchronizedView}
                  </button>
                  <button
                    type="button"
                    className={activeView === 'multiAgent' ? 'is-active' : ''}
                    onClick={() => setActiveView('multiAgent')}
                  >
                    {copy.multiAgentView}
                  </button>
                </div>
              </div>
            )}
          </div>

          {activeView === 'multiAgent' ? (
            <MultiAgentTraceView
              spans={filteredSpans}
              traceData={traceData}
              focusedSpan={focusedSpan}
              onSpanFocus={setFocusedSpan}
              onOpenDetails={setDetailSpan}
            />
          ) : (
            <SynchronizedTraceView
              spans={filteredSpans}
              focusedSpan={focusedSpan}
              onSpanFocus={setFocusedSpan}
              onOpenDetails={setDetailSpan}
            />
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <div className="studio-toolbar">
        {enabledSourceModes.length > 1 && (
          <div className="studio-toggle">
            {enabledSourceModes.includes('sample') && (
              <button
                type="button"
                className={sourceMode === 'sample' ? 'is-active' : ''}
                onClick={() => setSourceMode('sample')}
              >
                {copy.sampleToggleLabel}
              </button>
            )}
            {enabledSourceModes.includes('database') && (
              <button
                type="button"
                className={sourceMode === 'database' ? 'is-active' : ''}
                onClick={() => setSourceMode('database')}
              >
                {copy.databaseToggleLabel}
              </button>
            )}
          </div>
        )}

        <div className="studio-controls">
          {sourceMode === 'sample' ? (
            <label className="studio-select-wrapper">
              <span>{copy.chooseDemoTrace}</span>
              <select
                className="studio-select"
                value={selectedSample}
                onChange={(event) => {
                  setSelectedSample(event.target.value);
                  loadSampleTrace(event.target.value);
                }}
              >
                {sampleTraces.map((trace) => (
                  <option key={trace.value} value={trace.value}>
                    {getSampleTraceLabel(trace, demoTraceLabels)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="studio-select-wrapper">
              <span>{copy.chooseStoredTrace}</span>
              <select
                className="studio-select"
                value={selectedTraceId || ''}
                onChange={(event) => loadDatabaseTrace(event.target.value)}
                disabled={loading || availableTraces.length === 0}
              >
                {availableTraces.length === 0 ? (
                  <option value="">{copy.noStoredTraces}</option>
                ) : (
                  groupedAvailableTraces.map((group) => (
                    <optgroup
                      key={group.harness}
                      label={formatHarnessLabel(group.harness, copy)}
                    >
                      {group.traces.map((trace) => (
                        <option key={trace.trace_id} value={trace.trace_id}>
                          {trace.trace_name || trace.trace_id}
                        </option>
                      ))}
                    </optgroup>
                  ))
                )}
              </select>
            </label>
          )}

          {allowFileUpload && (
            <label className="studio-action-button">
              <span>{copy.uploadTrace}</span>
              <input type="file" accept=".json" hidden onChange={handleFileUpload} />
            </label>
          )}
        </div>
      </div>

      <div className="studio-content">
        {modeNoteSection}
        {renderStudioState()}
      </div>

      <SpanDetailModal span={detailSpan} onClose={() => setDetailSpan(null)} />
    </>
  );
}
