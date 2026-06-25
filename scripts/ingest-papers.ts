/**
 * Paper ingestion pipeline.
 *
 * Search mode (recommended for bulk ingestion):
 *   npm run ingest-papers -- --search "hippocampal plasticity" --months 24
 *   npm run ingest-papers -- --search "KMT2D" --months 12 --always-relevant
 *   npm run ingest-papers -- --search "CRISPR off-target" --months 24 --limit 500 --dry-run
 *
 * Topic mode (multi-query across defined topics):
 *   npm run ingest-papers                   # all topics, 15 per query
 *   npm run ingest-papers -- --topic "creb" # single topic
 *   npm run ingest-papers -- --limit 30     # 30 results per query
 *
 * Shared flags:
 *   --dry-run          print results without saving to DB
 *   --always-relevant  skip LLM relevance check, save everything found
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { prisma } from '../lib/prisma';
import { searchPubMedWithDetails } from '../lib/pubmed';
import { SEARCH_TOPICS, SearchTopic } from '../lib/papers/topics';
import { extractFullText } from '../lib/papers/extract';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------- CLI args ----------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 200;

const topicIdx = args.indexOf('--topic');
const TOPIC_FILTER = topicIdx !== -1 ? args[topicIdx + 1]?.toLowerCase() ?? null : null;

const searchIdx = args.indexOf('--search');
const SEARCH_TERM = searchIdx !== -1 ? args[searchIdx + 1] ?? null : null;

const monthsIdx = args.indexOf('--months');
const MONTHS = monthsIdx !== -1 ? parseInt(args[monthsIdx + 1], 10) : 24;

const ALWAYS_RELEVANT = args.includes('--always-relevant');

function monthsAgoDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Relevance check ----------
async function checkPaperRelevance(
  title: string,
  abstract: string | null,
): Promise<{ isRelevant: boolean; reasoning: string }> {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You assess whether a research paper belongs in a biological sciences knowledge base.

RELEVANT papers include:
- Original research in biology, biomedicine, neuroscience, genetics, or related life sciences
- Studies on genes, proteins, cells, organisms, or biological mechanisms
- Disease biology, developmental biology, physiology, or systems biology
- Clinical studies with mechanistic or translational insight
- Reviews or meta-analyses with substantive biological content

NOT relevant:
- Purely computational or engineering papers with no biological findings
- Purely clinical case reports with no mechanistic insight
- Papers only incidentally mentioning biology

Respond ONLY in JSON: { "isRelevant": boolean, "reasoning": "one sentence" }`,
      },
      {
        role: 'user',
        content: `Title: ${title}\n\n${abstract ? `Abstract: ${abstract}` : '(no abstract)'}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  try {
    return JSON.parse(res.choices[0].message.content || '{}');
  } catch {
    return { isRelevant: false, reasoning: 'Parse error' };
  }
}

// ---------- Process one paper ----------
async function processPaper(
  pmid: string,
  doi: string | undefined,
  title: string,
  abstract: string | undefined,
  authors: string[],
  journal: string | undefined,
  pubDate: string | undefined,
  url: string,
  topicName: string,
  stats: Stats,
  alwaysRelevant = false,
): Promise<void> {
  stats.seen++;

  // Check if already in DB by pmid or doi
  const existing = await prisma.paper.findFirst({
    where: {
      OR: [
        ...(pmid ? [{ pmid }] : []),
        ...(doi ? [{ doi }] : []),
      ],
    },
    select: { id: true, searchTopics: true, isRelevant: true },
  });

  if (existing) {
    stats.skipped++;
    if (!DRY_RUN) {
      const updates: Record<string, unknown> = {};
      if (existing.searchTopics && !existing.searchTopics.includes(topicName)) {
        updates.searchTopics = `${existing.searchTopics}, ${topicName}`;
      }
      if (alwaysRelevant && !existing.isRelevant) {
        updates.isRelevant = true;
        updates.relevanceReason = `Auto-relevant: topic "${topicName}"`;
        console.log(`  ↑ Promoting to relevant: ${title.substring(0, 70)}`);
      }
      if (Object.keys(updates).length > 0) {
        await prisma.paper.update({ where: { id: existing.id }, data: updates });
      }
    }
    return;
  }

  // Relevance check — skipped for alwaysRelevant topics
  let relevance: { isRelevant: boolean; reasoning: string };
  if (alwaysRelevant) {
    relevance = { isRelevant: true, reasoning: `Auto-relevant: topic "${topicName}"` };
    console.log(`  ✅ [${topicName}] ${title.substring(0, 80)}`);
    console.log(`     → ${relevance.reasoning}`);
  } else {
    relevance = await checkPaperRelevance(title, abstract ?? null);
    const marker = relevance.isRelevant ? '✅' : '❌';
    console.log(`  ${marker} [${topicName}] ${title.substring(0, 80)}`);
    console.log(`     → ${relevance.reasoning}`);
  }

  if (DRY_RUN) return;

  if (!relevance.isRelevant) {
    // Save as irrelevant to prevent re-checking
    await prisma.paper.create({
      data: {
        pmid: pmid || null,
        doi: doi || null,
        title,
        abstract: abstract ?? null,
        authors: authors.join(', ') || null,
        journal: journal ?? null,
        year: pubDate ? parseInt(pubDate, 10) : null,
        url,
        fullText: null,
        fullTextSource: 'abstract_only',
        isRelevant: false,
        relevanceReason: relevance.reasoning,
        searchTopics: topicName,
      },
    });
    stats.irrelevant++;
    return;
  }

  // Attempt full text extraction
  console.log(`     🔍 Extracting full text...`);
  const extract = await extractFullText(pmid, doi);
  if (extract.text) {
    console.log(`     📄 Got full text via ${extract.source} (${extract.text.length.toLocaleString()} chars)`);
    stats.fullText++;
  } else {
    console.log(`     📝 Abstract only`);
    stats.abstractOnly++;
  }

  await prisma.paper.create({
    data: {
      pmid: pmid || null,
      doi: doi || null,
      title,
      abstract: abstract ?? null,
      authors: authors.join(', ') || null,
      journal: journal ?? null,
      year: pubDate ? parseInt(pubDate, 10) : null,
      url,
      fullText: extract.text,
      fullTextSource: extract.source,
      isRelevant: true,
      relevanceReason: relevance.reasoning,
      searchTopics: topicName,
    },
  });
  stats.relevant++;
}

// ---------- Process one topic ----------
async function processTopic(topic: SearchTopic, stats: Stats, alwaysRelevant = false): Promise<void> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 Topic: "${topic.name}"  (${topic.queries.length} queries × up to ${LIMIT} results each)`);
  console.log('='.repeat(70));

  const seenInTopic = new Set<string>(); // deduplicate within topic across queries

  for (const query of topic.queries) {
    console.log(`\n  Query: "${query}"`);
    let papers;
    try {
      papers = await searchPubMedWithDetails(query, LIMIT);
    } catch (err) {
      console.log(`  ⚠️  Search failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    console.log(`  Found ${papers.length} papers`);

    for (const paper of papers) {
      const key = paper.pmid || paper.doi || paper.title;
      if (seenInTopic.has(key)) continue;
      seenInTopic.add(key);

      try {
        await processPaper(
          paper.pmid,
          paper.doi,
          paper.title,
          paper.abstract,
          paper.authors,
          paper.journal,
          paper.pubDate,
          paper.url,
          topic.name,
          stats,
          alwaysRelevant,
        );
      } catch (err) {
        console.log(`  ⚠️  Error processing "${paper.title.substring(0, 60)}": ${err instanceof Error ? err.message : err}`);
        stats.errors++;
      }
    }
  }
}

// ---------- Stats ----------
interface Stats {
  seen: number;
  skipped: number;
  relevant: number;
  irrelevant: number;
  fullText: number;
  abstractOnly: number;
  errors: number;
}

// ---------- Main ----------
async function main() {
  const stats: Stats = {
    seen: 0, skipped: 0, relevant: 0, irrelevant: 0,
    fullText: 0, abstractOnly: 0, errors: 0,
  };

  // ---- Search mode ----
  if (SEARCH_TERM) {
    const mindate = monthsAgoDate(MONTHS);
    console.log(`\n🧬 Paper Ingestion — Search Mode`);
    console.log(`   Query:   "${SEARCH_TERM}"`);
    console.log(`   Since:   ${mindate} (${MONTHS} months)`);
    console.log(`   Limit:   ${LIMIT}`);
    console.log(`   Check:   ${ALWAYS_RELEVANT ? 'skipped (--always-relevant)' : 'LLM relevance check'}`);
    if (DRY_RUN) console.log(`   Mode:    DRY RUN`);
    console.log('');

    const papers = await searchPubMedWithDetails(SEARCH_TERM, LIMIT, mindate);
    console.log(`Found ${papers.length} papers since ${mindate}\n`);

    const seen = new Set<string>();
    for (const paper of papers) {
      const key = paper.pmid || paper.doi || paper.title;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await processPaper(
          paper.pmid, paper.doi, paper.title, paper.abstract,
          paper.authors, paper.journal, paper.pubDate, paper.url,
          SEARCH_TERM, stats, ALWAYS_RELEVANT,
        );
      } catch (err) {
        console.log(`  ⚠️  Error: ${err instanceof Error ? err.message : err}`);
        stats.errors++;
      }
    }

  // ---- Topic mode ----
  } else {
    const topics = TOPIC_FILTER
      ? SEARCH_TOPICS.filter(t => t.name.toLowerCase().includes(TOPIC_FILTER))
      : SEARCH_TOPICS;

    if (topics.length === 0) {
      console.error(`No topics matching "${TOPIC_FILTER}"`);
      process.exit(1);
    }

    console.log(`\n🧬 Paper Ingestion — Topic Mode`);
    console.log(`   Topics:  ${topics.map(t => `"${t.name}"`).join(', ')}`);
    console.log(`   Limit:   ${LIMIT} per query`);
    if (DRY_RUN) console.log(`   Mode:    DRY RUN`);
    console.log('');

    for (const topic of topics) {
      await processTopic(topic, stats, topic.alwaysRelevant ?? false);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Papers seen:       ${stats.seen}`);
  console.log(`  Already in DB:     ${stats.skipped}`);
  console.log(`  Relevant + saved:  ${stats.relevant}  (${stats.fullText} with full text, ${stats.abstractOnly} abstract only)`);
  console.log(`  Irrelevant:        ${stats.irrelevant}`);
  console.log(`  Errors:            ${stats.errors}`);
  if (DRY_RUN) console.log(`\n  ⚠️  DRY RUN — nothing was written to the database.`);
  console.log('');
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
