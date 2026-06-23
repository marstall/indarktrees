/**
 * Ingest a single article by URL, create a post, and generate paper comments.
 *
 * Fetches the article via Jina Reader (no API key needed), extracts structured
 * fields with GPT, saves the paper to the DB, generates a post, then runs the
 * full paper-conversation pipeline.
 *
 * Usage:
 *   npm run ingest-url <url>
 *   npm run ingest-url https://www.nature.com/articles/s41467-024-12345-6
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { prisma } from '../lib/prisma';
import { embedText } from '../lib/papers/embeddings';
import { generatePaperConversation } from '../lib/agents/actions';
import { getPostPrompt } from '../lib/agents/prompts';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── 1. Fetch clean article text via Jina Reader ──────────────────────────────

async function fetchViaJina(url: string): Promise<string> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  console.log(`  Fetching via Jina Reader...`);
  const res = await fetch(jinaUrl, {
    headers: { Accept: 'text/plain' },
  });
  if (!res.ok) throw new Error(`Jina fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (text.length < 200) throw new Error('Jina returned too little content — page may be paywalled');
  return text;
}

// ── 2. Extract structured fields from raw text ───────────────────────────────

interface ArticleFields {
  title: string;
  abstract: string;
  authors: string[];      // ["Last F", ...]
  journal: string | null;
  year: number | null;
  doi: string | null;
  pmid: string | null;
}

async function extractFields(rawText: string, sourceUrl: string): Promise<ArticleFields> {
  console.log(`  Extracting structured fields with GPT...`);
  const truncated = rawText.substring(0, 8000); // stay within context budget

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: 'You extract structured metadata from scientific article text. Return ONLY valid JSON.',
      },
      {
        role: 'user',
        content: `Extract metadata from this article. Return JSON with these exact keys:
- title: string (full article title)
- abstract: string (full abstract text, or first 3 paragraphs of introduction if no abstract section)
- authors: string[] (array of author names as "LastName Initial", e.g. ["Smith J", "Jones A"])
- journal: string or null (journal/preprint server name)
- year: number or null (publication year as integer)
- doi: string or null (DOI without "https://doi.org/" prefix, e.g. "10.1038/s41467-024-12345-6")
- pmid: string or null (PubMed ID if present)

Article source URL: ${sourceUrl}

Article text:
${truncated}`,
      },
    ],
  });

  const raw = res.choices[0].message.content || '{}';
  const parsed = JSON.parse(raw);

  if (!parsed.title) throw new Error('Could not extract article title');
  if (!parsed.abstract) throw new Error('Could not extract abstract');

  return {
    title: parsed.title,
    abstract: parsed.abstract,
    authors: Array.isArray(parsed.authors) ? parsed.authors : [],
    journal: parsed.journal ?? null,
    year: typeof parsed.year === 'number' ? parsed.year : null,
    doi: parsed.doi ?? null,
    pmid: parsed.pmid ?? null,
  };
}

// ── 3. Upsert paper in DB ────────────────────────────────────────────────────

async function upsertPaper(fields: ArticleFields, url: string, fullText: string): Promise<string> {
  // Check if already in DB
  const existing = await prisma.paper.findFirst({
    where: {
      OR: [
        ...(fields.doi ? [{ doi: fields.doi }] : []),
        ...(fields.pmid ? [{ pmid: fields.pmid }] : []),
        { title: fields.title },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    console.log(`  Paper already in DB (id: ${existing.id}) — updating metadata + fullText`);
    await prisma.paper.update({
      where: { id: existing.id },
      data: {
        isRelevant: true,
        fullText: fullText.substring(0, 50000),
        fullTextSource: 'jina',
        ...(fields.authors.length > 0 ? { authors: fields.authors.join(', ') } : {}),
        ...(fields.year ? { year: fields.year } : {}),
        ...(fields.doi ? { doi: fields.doi } : {}),
        ...(fields.abstract ? { abstract: fields.abstract } : {}),
        ...(fields.journal ? { journal: fields.journal } : {}),
      },
    });
    return existing.id;
  }

  const created = await prisma.paper.create({
    data: {
      pmid: fields.pmid,
      doi: fields.doi,
      title: fields.title,
      abstract: fields.abstract,
      authors: fields.authors.join(', ') || null,
      journal: fields.journal,
      year: fields.year,
      url,
      fullText: fullText.substring(0, 50000),
      fullTextSource: 'jina',
      isRelevant: true,
      relevanceReason: 'Manually ingested via ingest-url',
      searchTopics: 'manual',
    },
  });
  console.log(`  Created paper in DB (id: ${created.id})`);
  return created.id;
}

// ── 4. Generate post title + body ────────────────────────────────────────────

async function generatePost(
  fields: ArticleFields,
  url: string,
): Promise<{ postTitle: string; postBody: string }> {
  const agent = await prisma.agent.findFirst({ where: { username: 'MrExplainer' } });
  if (!agent) throw new Error('MrExplainer agent not found');

  const identity = {
    username: agent.username,
    specialty: agent.specialty,
    personality: agent.personality as any,
    bio: agent.bio,
  };

  const paper = {
    pmid: fields.pmid ?? '',
    doi: fields.doi ?? undefined,
    title: fields.title,
    abstract: fields.abstract ?? undefined,
    authors: fields.authors,
    journal: fields.journal ?? undefined,
    pubDate: fields.year ? String(fields.year) : undefined,
    url,
  };

  const prompt = getPostPrompt(identity, paper);
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    temperature: 0.8,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that generates accessible, engaging posts about scientific papers.',
      },
      { role: 'user', content: prompt },
    ],
  });

  const result = JSON.parse(res.choices[0].message.content || '{}');
  if (!result.postTitle || !result.postBody) throw new Error('GPT failed to generate post content');
  return { postTitle: result.postTitle, postBody: result.postBody };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const url = args.find(a => a.startsWith('http'));
  const regen = args.includes('--regen');
  const minCommentsArg = args.find(a => a.startsWith('--min-comments='));
  const minComments = minCommentsArg ? parseInt(minCommentsArg.split('=')[1], 10) : 5;

  if (!url) {
    console.error('Usage: npm run ingest-url -- <url> [--regen] [--min-comments=N]');
    process.exit(1);
  }

  console.log(`\n🔗 URL: ${url}`);
  if (regen) console.log('♻️  Regen mode: will delete and regenerate existing post + comments');
  console.log();

  // Step 1: Fetch
  console.log('📥 Step 1: Fetching article...');
  const rawText = await fetchViaJina(url);
  console.log(`  Got ${rawText.length.toLocaleString()} chars`);

  // Step 2: Extract fields
  console.log('\n🔬 Step 2: Extracting metadata...');
  const fields = await extractFields(rawText, url);
  console.log(`  Title:    ${fields.title}`);
  console.log(`  Authors:  ${fields.authors.slice(0, 3).join(', ')}${fields.authors.length > 3 ? ' et al.' : ''}`);
  console.log(`  Journal:  ${fields.journal ?? 'unknown'}`);
  console.log(`  Year:     ${fields.year ?? 'unknown'}`);
  console.log(`  DOI:      ${fields.doi ?? 'none'}`);

  // Step 3: Save to DB
  console.log('\n💾 Step 3: Saving paper to DB...');
  const paperId = await upsertPaper(fields, url, rawText);

  // Step 4: Embed
  console.log('\n🔢 Step 4: Embedding paper...');
  const embedInput = [fields.title, fields.abstract].filter(Boolean).join('\n\n');
  const embedding = await embedText(embedInput);
  await prisma.paper.update({
    where: { id: paperId },
    data: { embedding: embedding as any },
  });
  console.log(`  Embedded (${embedding.length} dimensions)`);

  // Step 5: Generate post title/body
  console.log('\n✍️  Step 5: Generating post...');
  const { postTitle, postBody } = await generatePost(fields, url);
  console.log(`  Title: "${postTitle}"`);

  // Check if post already exists
  const existingPost = await prisma.post.findFirst({
    where: {
      OR: [
        ...(fields.doi ? [{ paperDoi: fields.doi }] : []),
        { paperTitle: fields.title },
      ],
    },
  });

  let postId: string;

  if (existingPost && !regen) {
    console.log(`\n⚠️  Post already exists (id: ${existingPost.id}). Use --regen to regenerate.`);
    return;
  }

  if (existingPost && regen) {
    console.log(`\n🗑️  Deleting post ${existingPost.id} (+ cascaded comments)...`);
    await prisma.post.delete({ where: { id: existingPost.id } });
    console.log(`   Deleted.`);
  }

  {
    // Step 6: Create post
    const postAuthor = await prisma.agent.findFirst();
    if (!postAuthor) throw new Error('No agents in DB');
    const post = await prisma.post.create({
      data: {
        postTitle,
        postBody,
        authorAgentId: postAuthor.id,
        paperTitle: fields.title,
        paperDoi: fields.doi ?? null,
        paperAbstract: fields.abstract,
        score: 0,
      },
    });
    console.log(`  Post created: ${post.id}`);
    postId = post.id;
  }

  // Step 7: Run paper conversation
  console.log(`\n💬 Step 6: Running paper conversation pipeline (min ${minComments} comments)...`);
  const commentIds = await generatePaperConversation(postId, minComments);

  console.log(`\n✅ Done!`);
  console.log(`   Post ID:  ${postId}`);
  console.log(`   Comments: ${commentIds.length}`);
  console.log(`   URL:      /post/${postId}`);
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
