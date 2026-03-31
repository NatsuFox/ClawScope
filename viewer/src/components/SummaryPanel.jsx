import React from 'react';
import { formatDuration, formatCost, getSpanCost } from '../utils/traceUtils';
import { useLexiconSection } from '../lexicon';

export default function SummaryPanel({ summary, onSpanClick }) {
  const copy = useLexiconSection('summaryPanel');

  if (!summary) return null;

  return (
    <section className="studio-side-card summary-panel">
      <div className="studio-panel-head">
        <div>
          <span className="studio-panel-kicker">{copy.title}</span>
          <p>{copy.subtitle}</p>
        </div>
      </div>

      <div className="summary-metric-grid">
        <article className="summary-metric-card">
          <span>{copy.totalDuration}</span>
          <strong>{formatDuration(summary.totalDuration)}</strong>
        </article>
        <article className="summary-metric-card">
          <span>{copy.totalCost}</span>
          <strong>{formatCost(summary.totalCost)}</strong>
        </article>
        <article className="summary-metric-card">
          <span>{copy.totalSpans}</span>
          <strong>{summary.spanCount}</strong>
        </article>
      </div>

      <div className="summary-list-grid">
        <div className="summary-list-card">
          <h3>{copy.slowest}</h3>
          <div className="summary-list">
            {summary.slowestSpans.map((span, index) => (
              <button
                key={span.record_id}
                type="button"
                className="summary-list-row"
                onClick={() => onSpanClick && onSpanClick(span)}
              >
                <span className="summary-list-name">
                  {index + 1}. {span.name}
                </span>
                <strong>{formatDuration(span.duration_ms)}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="summary-list-card">
          <h3>{copy.costliest}</h3>
          <div className="summary-list">
            {summary.costliestSpans.map((span, index) => (
              <button
                key={span.record_id}
                type="button"
                className="summary-list-row"
                onClick={() => onSpanClick && onSpanClick(span)}
              >
                <span className="summary-list-name">
                  {index + 1}. {span.name}
                </span>
                <strong>{formatCost(getSpanCost(span))}</strong>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="summary-category-card">
        <h3>{copy.byCategory}</h3>
        <div className="summary-category-chips">
          {Object.entries(summary.categoryCounts).map(([category, count]) => (
            <span key={category} className="summary-category-chip">
              <strong>{category}</strong>
              <span>{count}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
