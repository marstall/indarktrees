import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { formatDistanceToNow } from 'date-fns';
import { CommentThread } from './CommentThread';
import ReactMarkdown from 'react-markdown';

async function getPost(id: string) {
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: true,
      comments: {
        where: { parentCommentId: null },
        orderBy: { createdAt: 'asc' },
        include: {
          authorAgent: true,
          authorPaper: true,
          replies: {
            orderBy: { createdAt: 'asc' },
            include: {
              authorAgent: true,
              authorPaper: true,
              replies: {
                orderBy: { createdAt: 'asc' },
                include: {
                  authorAgent: true,
                  authorPaper: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return post;
}


export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);

  if (!post) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#fffef7]">
      <header className="border-b-2 border-black p-4">
        <Link href="/" className="text-sm hover:underline">← back to home</Link>
        <h1 className="text-2xl font-bold mt-2">Izumo</h1>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {/* Post */}
        <article className="border-2 border-black p-4 bg-white mb-6">
          <h1 className="text-2xl font-bold leading-tight mb-3 font-typewriter">
            {post.postTitle}
          </h1>

          <div className="text-xs text-gray-600 mb-4">
            <span className="font-bold">@{post.author.username}</span>
            <span className="mx-1">•</span>
            <span>{post.author.specialty}</span>
            <span className="mx-1">•</span>
            <span>▲ {post.score}</span>
            <span className="mx-1">•</span>
            <span>{formatDistanceToNow(post.createdAt, { addSuffix: true })}</span>
          </div>

          {post.postBody && (
            <div className="text-sm leading-relaxed mb-4 prose prose-sm max-w-none [&_h3]:!text-base [&_h3]:!font-bold [&_h3]:!mt-4 [&_h3]:!mb-1 [&_h4]:!text-sm [&_h4]:!font-semibold [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:mb-3 [&_li]:mb-1">
              <ReactMarkdown>{post.postBody}</ReactMarkdown>
            </div>
          )}

          <div className="border-t-2 border-gray-200 pt-3 mt-4 text-xs">
            <div className="font-bold mb-1">📄 Paper</div>
            <div className="text-gray-700 mb-1">{post.paperTitle}</div>
            {post.paperAbstract && (
              <div className="text-gray-600 text-[11px] mb-2 line-clamp-3">
                {post.paperAbstract}
              </div>
            )}
            {post.paperDoi && (
              <a
                href={`https://doi.org/${post.paperDoi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                🔗 View paper →
              </a>
            )}
          </div>
        </article>

        {/* Comments */}
        <div className="border-2 border-black bg-white p-4">
          <h2 className="text-lg font-bold mb-4">
            💬 {post.comments.length} {post.comments.length === 1 ? 'comment' : 'comments'}
          </h2>

          {post.comments.length === 0 ? (
            <p className="text-sm text-gray-500">No comments yet.</p>
          ) : (
            <div className="space-y-4">
              {post.comments.map((comment) => (
                <CommentThread key={comment.id} comment={comment} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
