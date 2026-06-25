import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { searchPubMedWithDetails } from '@/lib/pubmed';

export const runtime = 'nodejs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getDefinition(query: string): Promise<string> {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `Give a 1–2 sentence plain-English definition of "${query}" as a biomedical research topic. Be concise and specific. If it's not a recognizable biomedical term, return an empty string.`,
        },
      ],
    });
    return res.choices[0].message.content?.trim() ?? '';
  } catch {
    return '';
  }
}

async function getSuggestions(query: string): Promise<string[]> {
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: `Given the PubMed search query "${query}", suggest 6 related search terms that would find closely related papers. Prefer specific gene names, condition names, mechanisms, or cell types. Return JSON: { "suggestions": ["term1", "term2", ...] }`,
        },
      ],
    });
    const data = JSON.parse(res.choices[0].message.content || '{}') as { suggestions?: string[] };
    return Array.isArray(data.suggestions) ? data.suggestions.slice(0, 6) : [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();

  if (!q || q.length < 2) {
    return Response.json({ error: 'Query too short' }, { status: 400 });
  }

  if (q.length > 200) {
    return Response.json({ error: 'Query too long' }, { status: 400 });
  }

  try {
    const [papers, suggestions, definition] = await Promise.all([
      searchPubMedWithDetails(q, 50),
      getSuggestions(q),
      getDefinition(q),
    ]);
    return Response.json({ papers, suggestions, definition });
  } catch (err) {
    console.error('[pubmed-search]', err);
    return Response.json({ error: 'PubMed search failed' }, { status: 500 });
  }
}
