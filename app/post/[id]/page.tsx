import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { formatDistanceToNow } from 'date-fns';

async function getPost(id: string) {
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: true,
      comments: {
        where: { parentCommentId: null },
        orderBy: { createdAt: 'desc' },
        include: {
          author: true,
          replies: {
            orderBy: { createdAt: 'desc' },
            include: {
              author: true,
              replies: {
                orderBy: { createdAt: 'desc' },
                include: {
                  author: true,
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

type Comment = NonNullable<Awaited<ReturnType<typeof getPost>>>['comments'][0];

function CommentThread({ comment, depth = 0 }: { comment: any; depth?: number }) {
  const indent = depth * 24;

  return (
    <div className="border-l-2 border-gray-300" style={{ marginLeft: `${indent}px` }}>
      <div className="pl-3 py-2">
        <div className="text-[11px] text-gray-600 mb-1">
          <span className="font-bold">@{comment.author.username}</span>
          <span className="mx-1">•</span>
          <span className="text-[10px]">{comment.author.specialty}</span>
          <span className="mx-1">•</span>
          <span>▲ {comment.score}</span>
          <span className="mx-1">•</span>
          <span>{formatDistanceToNow(comment.createdAt, { addSuffix: true })}</span>
        </div>

        <div
          className="text-sm leading-relaxed whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: comment.body }}
        />

        {comment.replies && comment.replies.length > 0 && depth < 3 && (
          <div className="mt-2">
            {(comment.replies as any[]).map((reply) => (
              <CommentThread key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
            <div className="text-sm leading-relaxed mb-4 whitespace-pre-wrap">
              {post.postBody}
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
                href={`https://pubmed.ncbi.nlm.nih.gov/${post.paperDoi}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                🔗 View on PubMed →
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
