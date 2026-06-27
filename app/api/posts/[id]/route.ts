import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const post = await prisma.post.findUnique({ where: { id } });

    if (!post) {
      return Response.json({ error: 'Post not found' }, { status: 404 });
    }

    await prisma.post.delete({ where: { id } });

    return Response.json({ success: true });
  } catch (error) {
    console.error('[delete-post] error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return Response.json({ error: message }, { status: 500 });
  }
}
