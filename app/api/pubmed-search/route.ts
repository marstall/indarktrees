import { NextRequest } from 'next/server';
import { searchPubMedWithDetails } from '@/lib/pubmed';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return Response.json({ error: 'Query too short' }, { status: 400 });
  }

  if (q.length > 200) {
    return Response.json({ error: 'Query too long' }, { status: 400 });
  }

  try {
    const papers = await searchPubMedWithDetails(q, 12);
    return Response.json(papers);
  } catch (err) {
    console.error('[pubmed-search]', err);
    return Response.json({ error: 'PubMed search failed' }, { status: 500 });
  }
}
