import React, { useState } from 'react';
import { CATEGORY_COLORS, getSpanActorId } from '../utils/traceUtils';
import { formatLexiconText, useLexiconSection } from '../lexicon';

export default function FilterPanel({ spans, onFilterChange }) {
  const copy = useLexiconSection('filterPanel');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState(new Set());
  const [selectedActors, setSelectedActors] = useState(new Set());
  const [showAllActors, setShowAllActors] = useState(false);

  const categories = [...new Set(spans.map((span) => span.category))];
  const actors = [...new Set(spans.map((span) => getSpanActorId(span)).filter(Boolean))];
  const visibleActors = actors.slice(0, 10);
  const hiddenActors = actors.slice(10);
  const hiddenSelectedCount = hiddenActors.filter((actor) => selectedActors.has(actor)).length;

  const applyFilters = (search, categoriesToApply, actorsToApply) => {
    let filtered = spans;

    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(
        (span) =>
          span.name.toLowerCase().includes(lowerSearch) ||
          span.category.toLowerCase().includes(lowerSearch) ||
          getSpanActorId(span).toLowerCase().includes(lowerSearch)
      );
    }

    if (categoriesToApply.size > 0) {
      filtered = filtered.filter((span) => categoriesToApply.has(span.category));
    }

    if (actorsToApply.size > 0) {
      filtered = filtered.filter((span) => actorsToApply.has(getSpanActorId(span)));
    }

    onFilterChange(filtered);
  };

  const handleCategoryToggle = (category) => {
    const nextSelected = new Set(selectedCategories);
    if (nextSelected.has(category)) {
      nextSelected.delete(category);
    } else {
      nextSelected.add(category);
    }
    setSelectedCategories(nextSelected);
    applyFilters(searchTerm, nextSelected, selectedActors);
  };

  const handleActorToggle = (actor) => {
    const nextSelected = new Set(selectedActors);
    if (nextSelected.has(actor)) {
      nextSelected.delete(actor);
    } else {
      nextSelected.add(actor);
    }
    setSelectedActors(nextSelected);
    applyFilters(searchTerm, selectedCategories, nextSelected);
  };

  const handleSearchChange = (term) => {
    setSearchTerm(term);
    applyFilters(term, selectedCategories, selectedActors);
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategories(new Set());
    setSelectedActors(new Set());
    onFilterChange(spans);
  };

  return (
    <section className="studio-side-card filter-panel">
      <div className="studio-panel-head is-row">
        <div>
          <span className="studio-panel-kicker">{copy.title}</span>
          <p>{copy.subtitle}</p>
        </div>
        <button type="button" className="panel-ghost-button" onClick={clearFilters}>
          {copy.clearAll}
        </button>
      </div>

      <label className="filter-field">
        <span>{copy.search}</span>
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder={copy.searchPlaceholder}
        />
      </label>

      <div className="filter-group">
        <span className="filter-group-label">{copy.categories}</span>
        <div className="filter-chip-row">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`filter-chip ${selectedCategories.has(category) ? 'is-active' : ''}`}
              style={{
                '--chip-accent': CATEGORY_COLORS[category],
              }}
              onClick={() => handleCategoryToggle(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-group-label">{copy.actors}</span>
        <div className="filter-chip-row">
          {visibleActors.map((actor) => (
            <button
              key={actor}
              type="button"
              className={`filter-chip filter-chip-neutral ${
                selectedActors.has(actor) ? 'is-active' : ''
              }`}
              onClick={() => handleActorToggle(actor)}
            >
              {actor}
            </button>
          ))}
          {showAllActors &&
            hiddenActors.map((actor) => (
              <button
                key={actor}
                type="button"
                className={`filter-chip filter-chip-neutral ${
                  selectedActors.has(actor) ? 'is-active' : ''
                }`}
                onClick={() => handleActorToggle(actor)}
              >
                {actor}
              </button>
            ))}
        </div>

        {hiddenActors.length > 0 && (
          <div className="filter-footnote">
            <button
              type="button"
              className="panel-ghost-button"
              onClick={() => setShowAllActors((current) => !current)}
            >
              {showAllActors
                ? formatLexiconText(copy.hideMore, { count: hiddenActors.length })
                : formatLexiconText(copy.showMore, { count: hiddenActors.length })}
            </button>
            <span>
              {hiddenSelectedCount > 0
                ? formatLexiconText(copy.hiddenSelected, { count: hiddenSelectedCount })
                : copy.collapsedHint}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
