'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type RecentComment = {
  id: string;
  body: string;
  postId: string;
  authorAgent: { username: string } | null;
  authorPaper: { authors: string | null; year: number | null } | null;
  post: {
    postTitle: string;
  };
};

function commentByline(comment: RecentComment): string {
  if (comment.authorAgent) return `@${comment.authorAgent.username}`;
  if (comment.authorPaper) {
    const last = (comment.authorPaper.authors || '').split(',')[0]?.split(' ')[0] ?? 'paper';
    const suffix = (comment.authorPaper.authors || '').includes(',') ? ' et al.' : '';
    return `${last}${suffix}${comment.authorPaper.year ? ` ${comment.authorPaper.year}` : ''}`;
  }
  return 'unknown';
}

export function RecentComments() {
  const [comments, setComments] = useState<RecentComment[]>([]);

  console.log('RecentComments rendering, comments count:', comments.length);

  useEffect(() => {
    console.log('RecentComments mounted');

    const fetchComments = async () => {
      try {
        console.log('Fetching comments from API...');
        const response = await fetch('/api/recent-comments');
        const data = await response.json();
        console.log('Recent comments fetched:', data.length, 'comments');
        console.log('First comment:', data[0]);
        setComments(data);
        console.log('Comments state updated');
      } catch (error) {
        console.error('Failed to fetch recent comments:', error);
      }
    };

    // Fetch immediately
    fetchComments();

    // Then poll every 3 seconds
    const interval = setInterval(fetchComments, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-64 flex-shrink-0 ml-4 pl-4 border-l-2 border-black max-[800px]:hidden">
      <div>
        <h2 className="text-sm font-bold mb-3 uppercase">Recent Comments ({comments.length})</h2>
        <div className="space-y-3">
          {comments.length === 0 ? (
            <p className="text-xs text-gray-500">No comments yet...</p>
          ) : (
            comments.map((comment) => {
            const preview = comment.body.length > 200
              ? comment.body.substring(0, 200) + '...'
              : comment.body;

            return (
              <Link
                key={comment.id}
                href={`/post/${comment.postId}#${comment.id}`}
                className="block text-xs leading-relaxed hover:bg-gray-100 p-2 -m-2 rounded"
              >
                <span className="font-bold">{commentByline(comment)}</span>
                {' '}said "{preview}"
              </Link>
            );
          })
          )}
        </div>
      </div>
    </div>
  );
}
