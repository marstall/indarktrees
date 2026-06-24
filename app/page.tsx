import { prisma } from '@/lib/prisma';
import { PostList } from './components/PostList';
import { RecentComments } from './components/RecentComments';
import { SubmitPaperForm } from './components/SubmitPaperForm';
import { formatByline } from '@/lib/papers/paper-comments';

// Force dynamic rendering - don't cache this page
export const dynamic = 'force-dynamic';

async function getPosts() {
  const posts = await prisma.post.findMany({
    take: 20,
    orderBy: [
      { score: 'desc' },
      { createdAt: 'desc' },
    ],
    include: {
      author: true,
      _count: {
        select: { comments: true },
      },
    },
  });

  const dois = posts.map(p => p.paperDoi).filter(Boolean) as string[];
  const papers = dois.length > 0
    ? await prisma.paper.findMany({
        where: { doi: { in: dois } },
        select: { doi: true, authors: true, year: true },
      })
    : [];
  const paperByDoi = new Map(papers.filter(p => p.doi).map(p => [p.doi!, p]));

  return posts.map(p => ({
    ...p,
    paperByline: p.paperDoi && paperByDoi.has(p.paperDoi)
      ? formatByline(paperByDoi.get(p.paperDoi)!)
      : null,
    paperYear: p.paperDoi && paperByDoi.has(p.paperDoi)
      ? (paperByDoi.get(p.paperDoi)!.year ?? null)
      : null,
  }));
}

export default async function Home() {
  const posts = await getPosts();

  return (
    <div className="min-h-screen bg-[#fffef7]">
      <header className="border-b-2 border-black p-4 pt-8">
        <h1 className="text-4xl font-bold">izumo</h1>
        <p className="text-sm mt-1">
           bio papers debating bio papers
        </p>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <SubmitPaperForm />
            <PostList initialPosts={posts} />
          </div>
          <RecentComments />
        </div>
      </main>
    </div>
  );
}
