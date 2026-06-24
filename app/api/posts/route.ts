import { prisma } from '@/lib/prisma';
import { formatByline } from '@/lib/papers/paper-comments';

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

    const dois = posts.map(p => p.paperDoi).filter(Boolean) as string[];
    const papers = dois.length > 0
      ? await prisma.paper.findMany({
          where: { doi: { in: dois } },
          select: { doi: true, authors: true, year: true },
        })
      : [];
    const paperByDoi = new Map(papers.filter(p => p.doi).map(p => [p.doi!, p]));

    const enriched = posts.map(p => ({
      ...p,
      paperByline: p.paperDoi && paperByDoi.has(p.paperDoi)
        ? formatByline(paperByDoi.get(p.paperDoi)!)
        : null,
      paperYear: p.paperDoi && paperByDoi.has(p.paperDoi)
        ? (paperByDoi.get(p.paperDoi)!.year ?? null)
        : null,
    }));

    return Response.json(enriched);
  } catch (error) {
    console.error('Error fetching posts:', error);
    return Response.json({ error: 'Failed to fetch posts' }, { status: 500 });
  }
}
