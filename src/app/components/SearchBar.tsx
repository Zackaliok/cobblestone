import { useDocStore } from '../store/DocStore';

export function SearchBar() {
  const query = useDocStore((state) => state.searchQuery);
  const setQuery = useDocStore((state) => state.setSearchQuery);
  const scope = useDocStore((state) => state.searchScope);
  const setScope = useDocStore((state) => state.setSearchScope);

  return (
    <div className="search-bar">
      <div className="search-bar__field">
        <span className="search-bar__icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher…"
          aria-label="Recherche full-text"
        />
        {query && (
          <button
            type="button"
            className="search-bar__clear"
            onClick={() => setQuery('')}
            aria-label="Effacer la recherche"
          >
            ×
          </button>
        )}
      </div>

      <div className="segmented segmented--small">
        <button
          type="button"
          className={scope === 'workspace' ? 'is-active' : ''}
          onClick={() => setScope('workspace')}
        >
          Ce workspace
        </button>
        <button
          type="button"
          className={scope === 'global' ? 'is-active' : ''}
          onClick={() => setScope('global')}
        >
          Tout
        </button>
      </div>
    </div>
  );
}
