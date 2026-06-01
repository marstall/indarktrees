import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const comments = await prisma.comment.findMany({
      take: 20,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        author: {
          select: {
            username: true,
          },
        },
        post: {
          select: {
            postTitle: true,
          },
        },
      },
    });

    return Response.json(comments);
  } catch (error) {
    console.error('Error fetching recent comments:', error);
    return Response.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}
