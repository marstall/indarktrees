/**
 * Backfill embeddings for all relevant papers that don't have one yet.
 *
 * Usage:
 *   npm run embed-papers          # embed all un-embedded relevant papers
 *   npm run embed-papers -- --all # re-embed everything (force)
 */

import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { embedText } from '../lib/papers/embeddings';

const FORCE = process.argv.includes('--all');
const BATCH_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const allPapers = await prisma.paper.findMany({
    where: { isRelevant: true },
    select: { id: true, title: true, abstract: true, embedding: true },
    orderBy: { createdAt: 'asc' },
  });

  // Filter in JS — avoids Prisma JsonNull vs SQL NULL ambiguity
  const papers = FORCE ? allPapers : allPapers.filter(p => p.embedding === null);

  console.log(`\n🔢 Embedding ${papers.length} papers${FORCE ? ' (forced re-embed)' : ''}...\n`);

  let done = 0;
  let errors = 0;

  for (const paper of papers) {
    const text = [paper.title, paper.abstract].filter(Boolean).join('\n\n');
    try {
      const embedding = await embedText(text);
      await prisma.paper.update({
        where: { id: paper.id },
        data: { embedding },
      });
      done++;
      if (done % 10 === 0) console.log(`  ✓ ${done}/${papers.length}`);
    } catch (err) {
      errors++;
      console.log(`  ✗ ${paper.title.substring(0, 60)}: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(BATCH_DELAY_MS);
  }

  console.log(`\nDone: ${done} embedded, ${errors} errors.\n`);
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
