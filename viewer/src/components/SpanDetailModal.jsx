import React from 'react';
import { formatDuration, CATEGORY_COLORS } from '../utils/traceUtils';
import { useI18n } from '../i18n';
import { useLexiconSection } from '../lexicon';

export default function SpanDetailModal({ span, onClose }) {
  const { timeLocale } = useI18n();
  const copy = useLexiconSection('spanDetailModal');
  const labels = copy.labels || {};

  if (!span) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            marginBottom: '20px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '20px', flex: 1 }}>{span.name}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              marginLeft: '16px',
              color: '#666',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              background: CATEGORY_COLORS[span.category] || '#999',
              color: 'white',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            {span.category}
          </span>
          {span.subtype && (
            <span
              style={{
                display: 'inline-block',
                marginLeft: '8px',
                padding: '4px 12px',
                background: '#f0f0f0',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              {span.subtype}
            </span>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '16px',
            marginBottom: '20px',
          }}
        >
          <DetailField label={labels.recordId} value={span.record_id} />
          <DetailField label={labels.status} value={span.status} />
          <DetailField label={labels.duration} value={formatDuration(span.duration_ms)} />
          {span.costUsd && <DetailField label={labels.costUsd} value={`$${span.costUsd.toFixed(4)}`} />}
          <DetailField
            label={labels.startTime}
            value={new Date(span.start_at).toLocaleTimeString(timeLocale)}
          />
          <DetailField
            label={labels.endTime}
            value={new Date(span.end_at).toLocaleTimeString(timeLocale)}
          />
          {span.runId && <DetailField label={labels.runId} value={span.runId} />}
          {span.sessionKey && <DetailField label={labels.sessionKey} value={span.sessionKey} />}
          {span.seq && <DetailField label={labels.sequence} value={span.seq} />}
          {span.channel && <DetailField label={labels.channel} value={span.channel} />}
          {span.lane && <DetailField label={labels.lane} value={span.lane} />}
          {span.updateType && <DetailField label={labels.updateType} value={span.updateType} />}
          {span.agent_id && <DetailField label={labels.agentId} value={span.agent_id} />}
          {span.parent_span_id && <DetailField label={labels.parentSpan} value={span.parent_span_id} />}
          {span.model_name && <DetailField label={labels.model} value={span.model_name} />}
          {span.provider && <DetailField label={labels.provider} value={span.provider} />}
          {span.tool_name && <DetailField label={labels.tool} value={span.tool_name} />}
          {span.token_input && <DetailField label={labels.inputTokens} value={span.token_input.toLocaleString()} />}
          {span.token_output && <DetailField label={labels.outputTokens} value={span.token_output.toLocaleString()} />}
          {span.token_cache && <DetailField label={labels.cacheTokens} value={span.token_cache.toLocaleString()} />}
          {span.queueDepth !== undefined && <DetailField label={labels.queueDepth} value={span.queueDepth} />}
          {span.origin_agent_id && <DetailField label={labels.originAgent} value={span.origin_agent_id} />}
          {span.target_agent_id && <DetailField label={labels.targetAgent} value={span.target_agent_id} />}
          <DetailField label={labels.fidelity} value={span.fidelity} />
        </div>

        {span.attributes && Object.keys(span.attributes).length > 0 && (
          <div>
            <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>{labels.additionalAttributes}</h3>
            <pre
              style={{
                background: '#f8f9fa',
                padding: '12px',
                borderRadius: '4px',
                fontSize: '12px',
                overflow: 'auto',
              }}
            >
              {JSON.stringify(span.attributes, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <div
        style={{ fontSize: '11px', color: '#666', marginBottom: '4px', textTransform: 'uppercase' }}
      >
        {label}
      </div>
      <div style={{ fontSize: '14px', fontWeight: '500', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}
