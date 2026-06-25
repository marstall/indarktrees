'use client';

import { useState, FormEvent, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Phase = 'idle' | 'loading' | 'done' | 'error';
type Tab = 'url' | 'search';

type SearchResult = {
  pmid: string;
  title: string;
  authors: string[];
  journal?: string;
  pubDate?: string;
  abstract?: string;
  url: string;
};

function validateUrl(value: string): string | null {
  if (!value.trim()) return 'Please enter a URL.';
  if (value.length > 2000) return 'URL is too long.';
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'URL must start with http:// or https://';
    }
  } catch {
    return "That doesn't look like a valid URL.";
  }
  return null;
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return '';
  if (authors.length === 1) return authors[0];
  return `${authors[0]} et al.`;
}

export function SubmitPaperForm() {
  const [activeTab, setActiveTab] = useState<Tab>('search');
  const [url, setUrl] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [postId, setPostId] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [definition, setDefinition] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const router = useRouter();

  async function runSubmission(targetUrl: string) {
    setPhase('loading');
    setProgressMessages([]);
    setErrorMessage('');
    setPostId('');

    try {
      const res = await fetch('/api/submit-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, honeypot }),
      });

      if (!res.ok || !res.body) {
        let message = 'Something went wrong. Please try again.';
        try {
          const text = await res.text();
          const json = JSON.parse(text);
          message = json.error || message;
        } catch { /* use default */ }
        setErrorMessage(message);
        setPhase('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              type: string;
              message?: string;
              postId?: string;
            };
            if (event.type === 'progress' && event.message) {
              setProgressMessages(prev => [...prev, event.message!]);
            } else if (event.type === 'done' && event.postId) {
              setPostId(event.postId);
              setPhase('done');
              router.refresh();
            } else if (event.type === 'error' && event.message) {
              setErrorMessage(event.message);
              setPhase('error');
            }
          } catch { /* ignore malformed lines */ }
        }
      }
    } catch {
      setErrorMessage('Network error. Please check your connection and try again.');
      setPhase('error');
    }
  }

  async function handleUrlSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validateUrl(url);
    if (validationError) {
      setErrorMessage(validationError);
      setPhase('error');
      return;
    }
    await runSubmission(url.trim());
  }

  async function handleSearch(query?: string) {
    const q = (query ?? searchQuery).trim();
    if (!q || isSearching) return;
    if (query) setSearchQuery(query);
    setIsSearching(true);
    setSearchError('');
    setSearchResults([]);
    setSuggestions([]);
    setDefinition('');
    setHasSearched(true);

    try {
      const res = await fetch(`/api/pubmed-search?q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setSearchError(json.error || 'Search failed. Please try again.');
        return;
      }
      const data = await res.json() as { papers: SearchResult[]; suggestions: string[]; definition: string };
      setSearchResults(data.papers ?? []);
      setSuggestions(data.suggestions ?? []);
      setDefinition(data.definition ?? '');
      if ((data.papers ?? []).length === 0) setSearchError('No results found. Try different keywords.');
    } catch {
      setSearchError('Search failed. Please check your connection.');
    } finally {
      setIsSearching(false);
    }
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }

  function handleReset() {
    setPhase('idle');
    setUrl('');
    setProgressMessages([]);
    setErrorMessage('');
    setPostId('');
  }

  if (phase === 'loading' || phase === 'done') {
    return (
      <div className="border-2 border-black bg-white p-4 mb-6">
        {phase === 'done' ? (
          <>
            <p className="text-sm font-bold text-green-700 mb-2">✓ Paper submitted — discussion generated!</p>
            <div className="flex items-center gap-4">
              <Link href={`/post/${postId}`} className="text-sm font-medium underline hover:text-gray-600">
                View the new post →
              </Link>
              <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600 underline">
                Submit another
              </button>
            </div>
          </>
        ) : (
          <>
            {progressMessages.length > 0 ? (
              <div className="space-y-1.5">
                {progressMessages.map((msg, i) => {
                  const isCurrent = i === progressMessages.length - 1;
                  return (
                    <div key={i} className={`text-xs flex items-center gap-2 ${isCurrent ? 'text-gray-800' : 'text-gray-400'}`}>
                      {isCurrent ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                      ) : (
                        <span className="text-green-500 flex-shrink-0">✓</span>
                      )}
                      <span className={isCurrent ? 'font-medium' : ''}>{msg}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                Starting…
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="border-2 border-black bg-white mb-6">
      {/* Honeypot */}
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={honeypot}
        onChange={e => setHoneypot(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0 }}
        aria-hidden="true"
      />

      {/* Tabs */}
      <div className="flex border-b-2 border-black">
        <button
          onClick={() => { setActiveTab('search'); setPhase('idle'); setErrorMessage(''); }}
          className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
            activeTab === 'search'
              ? 'bg-black text-white'
              : 'bg-white text-gray-500 hover:text-gray-800'
          }`}
        >
          Enter Keywords
        </button>
        <button
          onClick={() => { setActiveTab('url'); setPhase('idle'); setErrorMessage(''); }}
          className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
            activeTab === 'url'
              ? 'bg-black text-white'
              : 'bg-white text-gray-500 hover:text-gray-800'
          }`}
        >
          Enter URL
        </button>
      </div>

      <div className="p-4">
        {activeTab === 'url' && (
          <form onSubmit={handleUrlSubmit}>
            <label htmlFor="paper-url" className="block text-xs text-gray-500 mb-2">
              URL to a bio-related scientific paper
            </label>
            <div className="flex gap-2">
              <input
                id="paper-url"
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
                className="flex-1 text-sm border border-gray-300 px-3 py-2 focus:outline-none focus:border-gray-600 bg-white font-mono"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="text-sm bg-black text-white px-4 py-2 hover:bg-gray-800 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                Submit
              </button>
            </div>
            {phase === 'error' && (
              <div className="mt-2">
                <p className="text-xs text-red-600">{errorMessage}</p>
                <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600 underline mt-1">
                  Try again
                </button>
              </div>
            )}
          </form>
        )}

        {activeTab === 'search' && (
          <div>
            <label className="block text-xs text-gray-500 mb-2">
              Search by keyword, condition, gene, or author
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="e.g. CRISPR off-target effects, hippocampal plasticity, VEGF..."
                disabled={isSearching}
                className="flex-1 text-sm border border-gray-300 px-3 py-2 focus:outline-none focus:border-gray-600 bg-white disabled:bg-gray-50 disabled:text-gray-400"
                autoComplete="off"
              />
              <button
                onClick={() => handleSearch()}
                disabled={isSearching || !searchQuery.trim()}
                className="text-sm bg-black text-white px-4 py-2 hover:bg-gray-800 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {isSearching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {searchError && (
              <p className="mt-2 text-xs text-red-600">{searchError}</p>
            )}

            {definition && (
              <p className="mt-3 text-xs text-gray-600 italic border-l-2 border-gray-200 pl-2">{definition}</p>
            )}

            {phase === 'error' && (
              <div className="mt-2">
                <p className="text-xs text-red-600">{errorMessage}</p>
                <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600 underline mt-1">
                  Try again
                </button>
              </div>
            )}

            {suggestions.length > 0 && (
              <p className="mt-2 text-xs text-gray-400">
                related:{' '}
                {suggestions.map((s, i) => (
                  <span key={s}>
                    <button
                      onClick={() => handleSearch(s)}
                      className="underline hover:text-gray-700 transition-colors"
                    >
                      {s}
                    </button>
                    {i < suggestions.length - 1 && ', '}
                  </span>
                ))}
              </p>
            )}

            {searchResults.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-400 mb-2">
                  {searchResults.length} results · most recent first
                </p>
                <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                  {searchResults.map(result => (
                    <div
                      key={result.pmid}
                      className="border border-gray-200 p-3 hover:border-gray-400 hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-sm font-medium leading-snug mb-1">{result.title}</p>
                      <p className="text-xs text-gray-500 mb-2">
                        {formatAuthors(result.authors)}
                        {result.journal && <> · {result.journal}</>}
                        {result.pubDate && <> · {result.pubDate}</>}
                        <> · </>
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-gray-700"
                          onClick={e => e.stopPropagation()}
                        >
                          PubMed ↗
                        </a>
                      </p>
                      {result.abstract && (
                        <p className="text-xs text-gray-600 mb-2 line-clamp-2">{result.abstract}</p>
                      )}
                      <button
                        onClick={() => runSubmission(result.url)}
                        className="text-xs bg-black text-white px-3 py-1 hover:bg-gray-800 transition-colors"
                      >
                        Submit this paper →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasSearched && !isSearching && searchResults.length === 0 && !searchError && (
              <p className="mt-3 text-xs text-gray-500">No results found.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
