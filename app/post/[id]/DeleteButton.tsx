'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteButtonProps {
  postId: string;
  postTitle: string;
}

export function DeleteButton({ postId, postTitle }: DeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error || `Delete failed (HTTP ${res.status})`;
        setError(message);
        setDeleting(false);
        setConfirming(false);
        return;
      }

      router.push(`/?deleted=${encodeURIComponent(postTitle)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error. Please try again.';
      setError(message);
      setDeleting(false);
      setConfirming(false);
    }
  }

  if (error) {
    return (
      <div className="mt-6 border-2 border-red-400 bg-red-50 p-4 rounded-md">
        <p className="text-xs font-semibold text-red-700 mb-2">Failed to delete post:</p>
        <p className="text-xs text-red-600 mb-3">{error}</p>
        <button
          onClick={() => { setError(null); setConfirming(false); }}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          dismiss
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="mt-6 flex items-center gap-3">
        <span className="text-xs text-gray-600">Are you sure you want to delete this post?</span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs rounded-md transition-colors px-3 py-1.5 font-medium text-white"
          style={{ backgroundColor: '#dc2626', borderRadius: '6px', padding: '6px', fontSize: 13, fontFamily: 'ui-serif' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#b91c1c')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#dc2626')}
        >
          {deleting ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="text-[11px] text-gray-400 hover:text-gray-700"
        >
          cancel
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setConfirming(true)}
        className="text-xs rounded-md transition-colors px-3 py-1.5 font-medium text-white"
        style={{ backgroundColor: '#ef4444', borderRadius: '6px', padding: '6px', fontSize: 13, fontFamily: 'ui-serif' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#dc2626')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ef4444')}
      >
        Delete Post
      </button>
    </div>
  );
}
