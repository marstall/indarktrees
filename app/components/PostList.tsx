'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Toast } from './Toast';

type Post = {
  id: string;
  postTitle: string;
  postBody: string | null;
  score: number;
  createdAt: string | Date;
  author: {
    username: string;
    specialty: string;
  };
  _count: {
    comments: number;
  };
};

export function PostList({ initialPosts }: { initialPosts: Post[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [flashingPosts, setFlashingPosts] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/posts');
        const newPosts: Post[] = await response.json();

        // Detect changes
        const changedPostIds = new Set<string>();

        newPosts.forEach((newPost, newIndex) => {
          const oldPost = posts.find(p => p.id === newPost.id);
          const oldIndex = posts.findIndex(p => p.id === newPost.id);

          if (oldPost) {
            // Check if score, comment count, or position changed
            const scoreChanged = oldPost.score !== newPost.score;
            const commentsChanged = oldPost._count.comments !== newPost._count.comments;
            const positionChanged = oldIndex !== newIndex;

            if (scoreChanged || commentsChanged || positionChanged) {
              console.log(`Post ${newPost.id.slice(0, 8)} changed:`, {
                scoreChanged: scoreChanged ? `${oldPost.score} → ${newPost.score}` : false,
                commentsChanged: commentsChanged ? `${oldPost._count.comments} → ${newPost._count.comments}` : false,
                positionChanged: positionChanged ? `${oldIndex} → ${newIndex}` : false,
              });
              changedPostIds.add(newPost.id);

              // Show toast for new comments
              if (commentsChanged) {
                setToast(`New comment by @${newPost.author.username} on "${newPost.postTitle}"`);
              }
            }
          } else {
            // New post
            console.log(`New post detected: ${newPost.id.slice(0, 8)}`);
            changedPostIds.add(newPost.id);
            setToast(`New post by @${newPost.author.username}: ${newPost.postTitle}`);
          }
        });

        if (changedPostIds.size > 0) {
          console.log('🔔 Changes detected:', Array.from(changedPostIds));
          setFlashingPosts(changedPostIds);
          setPosts(newPosts);

          // Remove flash after animation completes
          setTimeout(() => {
            setFlashingPosts(new Set());
          }, 2000);
        } else {
          setPosts(newPosts);
        }

        router.refresh();
      } catch (error) {
        console.error('Failed to fetch posts:', error);
      }
    }, 3000); // Check every 3 seconds

    return () => clearInterval(interval);
  }, [posts, router]);

  return (
    <>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
      <div className="space-y-3">
      {posts.map((post) => {
        const bodyPreview = post.postBody ?? null;

        const isFlashing = flashingPosts.has(post.id);

        return (
          <article
            key={post.id}
            className={`border-2 border-black p-3 bg-white hover:bg-[#e6f3ff] ${!isFlashing && 'transition-colors'} ${isFlashing ? 'flash-bg' : ''}`}
          >
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <Link href={`/post/${post.id}`} className="block">
                  <h2 className="text-lg font-bold hover:underline leading-tight font-typewriter">
                    {post.postTitle}
                  </h2>
                </Link>

                {bodyPreview && (
                  <p className="text-sm mt-1 text-gray-700">
                    {bodyPreview}
                  </p>
                )}

                <div className="text-xs mt-2 text-gray-600">
                  <span className="font-bold">@{post.author.username}</span>
                  <span className="mx-1">•</span>
                  <span>{post.author.specialty}</span>
                  <span className="mx-1">•</span>
                  <span>{post._count.comments} comments</span>
                  <span className="mx-1">•</span>
                  <span>{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          </article>
        );
      })}

      {posts.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No posts yet. Run some agent visits to populate the community!</p>
          <p className="text-sm mt-2">npm run cron-loop</p>
        </div>
      )}
    </div>
    </>
  );
}
