import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
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

    return Response.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    return Response.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}
