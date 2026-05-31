import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const since = searchParams.get('since');

  if (!since) {
    return Response.json({ newContent: [] });
  }

  const sinceDate = new Date(since);

  try {
    // Check for new posts
    const newPosts = await prisma.post.findMany({
      where: {
        createdAt: {
          gt: sinceDate,
        },
      },
      include: {
        author: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    // Check for new comments
    const newComments = await prisma.comment.findMany({
      where: {
        createdAt: {
          gt: sinceDate,
        },
      },
      include: {
        author: true,
        post: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 5,
    });

    // Combine and format
    const newContent = [
      ...newPosts.map(post => ({
        type: 'post' as const,
        id: post.id,
        title: post.postTitle,
        author: post.author.username,
        createdAt: post.createdAt,
      })),
      ...newComments.map(comment => ({
        type: 'comment' as const,
        id: comment.id,
        title: comment.post.postTitle,
        author: comment.author.username,
        createdAt: comment.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return Response.json({ newContent });
  } catch (error) {
    console.error('Error fetching new content:', error);
    return Response.json({ newContent: [] });
  }
}
