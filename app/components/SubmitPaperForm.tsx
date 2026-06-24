'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Phase = 'idle' | 'loading' | 'done' | 'error';

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

export function SubmitPaperForm() {
  const [url, setUrl] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progressMessages, setProgressMessages] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [postId, setPostId] = useState('');
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const validationError = validateUrl(url);
    if (validationError) {
      setErrorMessage(validationError);
      setPhase('error');
      return;
    }

    setPhase('loading');
    setProgressMessages([]);
    setErrorMessage('');
    setPostId('');

    try {
      const res = await fetch('/api/submit-paper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), honeypot }),
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

  function handleReset() {
    setPhase('idle');
    setUrl('');
    setProgressMessages([]);
    setErrorMessage('');
    setPostId('');
  }

  if (phase === 'done') {
    return (
      <div className="border-2 border-black bg-white p-4 mb-6">
        <p className="text-sm font-bold text-green-700 mb-2">✓ Paper submitted — discussion generated!</p>
        <div className="flex items-center gap-4">
          <Link
            href={`/post/${postId}`}
            className="text-sm font-medium underline hover:text-gray-600"
          >
            View the new post →
          </Link>
          <button
            onClick={handleReset}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-black bg-white p-4 mb-6">
      <form onSubmit={handleSubmit}>
        {/* Honeypot — invisible to real users, bots will fill this in */}
        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={e => setHoneypot(e.target.value)}
          style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0 }}
          aria-hidden="true"
        />

        <label
          htmlFor="paper-url"
          className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide"
        >
          Enter URL to a bio-related scientific paper
        </label>
        <div className="text-xs mb-3">we'll download the paper and recruit a panel of related papers to comment on it</div>
        <div className="flex gap-2">
          <input
            id="paper-url"
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
            disabled={phase === 'loading'}
            className="flex-1 text-sm border border-gray-300 px-3 py-2 focus:outline-none focus:border-gray-600 bg-white disabled:bg-gray-50 disabled:text-gray-400 font-mono"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={phase === 'loading' || !url.trim()}
            className="text-sm bg-black text-white px-4 py-2 hover:bg-gray-800 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {phase === 'loading' ? 'Processing…' : 'Submit'}
          </button>
        </div>
      </form>

      {phase === 'loading' && progressMessages.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
          {progressMessages.map((msg, i) => {
            const isCurrent = i === progressMessages.length - 1;
            return (
              <div
                key={i}
                className={`text-xs flex items-center gap-2 ${isCurrent ? 'text-gray-800' : 'text-gray-400'}`}
              >
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
      )}

      {phase === 'loading' && progressMessages.length === 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          Starting…
        </div>
      )}

      {phase === 'error' && (
        <div className="mt-3">
          <p className="text-xs text-red-600">{errorMessage}</p>
          <button
            onClick={handleReset}
            className="text-xs text-gray-400 hover:text-gray-600 underline mt-1"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
