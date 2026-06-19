/**
 * Batch post + conversation generator.
 * Usage: npm run generate-posts <n>
 * Example: npm run generate-posts 3
 */

import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { generatePostDraft, checkPostRelevance, generatePaperConversation } from '../lib/agents/actions';

async function generateOnePost(index: number, total: number): Promise<{ postId: string; postTitle: string; commentCount: number } | null> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`POST ${index} of ${total}`);
  console.log('='.repeat(80));

  const agents = await prisma.agent.findMany();
  let attemptsCount = 0;
  let postDraft: { paper: any; paperId: string; postTitle: string; postBody: string } | null = null;
  let postAuthor: typeof agents[0] | null = null;

  while (true) {
    attemptsCount++;

    const candidate = agents[Math.floor(Math.random() * agents.length)];
    const authorIdentity = {
      username: candidate.username,
      specialty: candidate.specialty,
      personality: candidate.personality as any,
      bio: candidate.bio,
    };

    console.log(`\n📝 Attempt ${attemptsCount}: @${candidate.username} generating draft...`);

    try {
      const draft = await generatePostDraft(authorIdentity);
      console.log(`   Title: "${draft.postTitle}"`);

      const reviewer = agents.filter(a => a.id !== candidate.id)[Math.floor(Math.random() * (agents.length - 1))];
      const reviewerIdentity = {
        username: reviewer.username,
        specialty: reviewer.specialty,
        personality: reviewer.personality as any,
        bio: reviewer.bio,
      };

      console.log(`   🔍 @${reviewer.username} reviewing...`);
      const check = await checkPostRelevance(reviewerIdentity, draft.postTitle, draft.postBody);
      console.log(`   ${check.isRelevant ? '✅' : '❌'} ${check.reasoning}`);

      if (check.isRelevant) {
        postDraft = draft;
        postAuthor = candidate;
        console.log(`\n✅ Relevant post found after ${attemptsCount} attempt(s)!`);
        break;
      } else {
        // Mark this paper as irrelevant so it isn't tried again
        await prisma.paper.update({
          where: { id: draft.paperId },
          data: { isRelevant: false, relevanceReason: `Post rejected: ${check.reasoning}` },
        });
        console.log(`   ↓ Marked paper as irrelevant in DB`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`   ⚠️  Error on attempt ${attemptsCount}: ${msg}`);
      // If we've exhausted all unposted papers, bail out
      if (msg.includes('No unposted relevant papers')) {
        console.log('\n❌ No more unposted relevant papers — run ingest-papers to add more.');
        return null;
      }
    }
  }

  if (!postDraft || !postAuthor) return null;

  // Save post
  console.log(`\n💾 Saving post...`);
  const post = await prisma.post.create({
    data: {
      postTitle: postDraft.postTitle,
      postBody: postDraft.postBody,
      authorAgentId: postAuthor.id,
      paperTitle: postDraft.paper.title,
      paperDoi: postDraft.paper.doi,
      paperAbstract: postDraft.paper.abstract,
      score: 0,
    },
  });
  await prisma.agentAction.create({
    data: { agentId: postAuthor.id, actionType: 'post', targetId: post.id },
  });
  console.log(`   Post ID: ${post.id}`);

  // Generate conversation
  console.log(`\n💬 Generating comments from all panelists...`);
  const commentIds = await generatePaperConversation(post.id);
  console.log(`\n✅ Done — ${commentIds.length} comments saved.`);

  return { postId: post.id, postTitle: post.postTitle, commentCount: commentIds.length };
}

async function main() {
  const n = parseInt(process.argv[2] ?? '1', 10);
  if (isNaN(n) || n < 1) {
    console.error('Usage: npm run generate-posts <n>  (e.g. npm run generate-posts 3)');
    process.exit(1);
  }

  console.log(`\n🚀 Generating ${n} post(s) with full panelist discussion...\n`);

  const results: Array<{ postId: string; postTitle: string; commentCount: number }> = [];
  const failures: number[] = [];

  for (let i = 1; i <= n; i++) {
    const result = await generateOnePost(i, n);
    if (result) {
      results.push(result);
    } else {
      failures.push(i);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Created: ${results.length} post(s)`);
  if (failures.length > 0) {
    console.log(`❌ Failed:  ${failures.length} post(s) (indices: ${failures.join(', ')})`);
  }
  results.forEach((r, i) => {
    console.log(`\n  ${i + 1}. "${r.postTitle}"`);
    console.log(`     ID: ${r.postId} | Comments: ${r.commentCount}`);
  });
  console.log('');
}

main()
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
