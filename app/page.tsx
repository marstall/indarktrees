import { prisma } from '@/lib/prisma';
import { PostList } from './components/PostList';

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

  return posts;
}

export default async function Home() {
  const posts = await getPosts();

  return (
    <div className="min-h-screen bg-[#fffef7]">
      <header className="border-b-2 border-black p-4">
        <h1 className="text-2xl font-bold">izumo</h1>
        <p className="text-sm mt-1">synthetic research community • kabuki syndrome</p>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        <PostList initialPosts={posts} />
      </main>
    </div>
  );
}
