/**
 * Embedding generation and similarity search for papers.
 * Uses OpenAI text-embedding-3-small (1536 dimensions).
 * Embeddings stored as JSON in Paper.embedding.
 */

import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';

const EMBEDDING_MODEL = 'text-embedding-3-small';

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export async function embedText(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.substring(0, 8000),
  });
  return res.data[0].embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SimilarPaper {
  id: string;
  title: string;
  abstract: string | null;
  authors: string | null;
  year: number | null;
  fullText: string | null;
  similarity: number;
}

/**
 * Find the top N papers most similar to a query embedding.
 * Excludes the paper being discussed (by DB id).
 */
export async function findSimilarPapers(
  queryEmbedding: number[],
  excludePaperId: string | null | undefined,
  limit: number,
  prisma: PrismaClient,
): Promise<SimilarPaper[]> {
  const papers = await prisma.paper.findMany({
    where: {
      isRelevant: true,
      ...(excludePaperId ? { id: { not: excludePaperId } } : {}),
    },
    select: {
      id: true,
      title: true,
      abstract: true,
      authors: true,
      year: true,
      fullText: true,
      embedding: true,
    },
  });

  return papers
    .filter(p => Array.isArray(p.embedding) && (p.embedding as unknown as number[]).length > 0)
    .map(p => ({
      id: p.id,
      title: p.title,
      abstract: p.abstract,
      authors: p.authors,
      year: p.year,
      fullText: p.fullText,
      similarity: cosineSimilarity(queryEmbedding, p.embedding as unknown as number[]),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
