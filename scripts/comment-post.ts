/**
 * Run the paper conversation pipeline on a single existing post.
 *
 * Usage:
 *   npm run comment-post <postId>
 */

import 'dotenv/config';
import { generatePaperConversation } from '../lib/agents/actions';
import { prisma } from '../lib/prisma';

async function main() {
  const postId = process.argv[2];
  if (!postId) {
    console.error('Usage: npm run comment-post <postId>');
    process.exit(1);
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, postTitle: true },
  });

  if (!post) {
    console.error(`Post not found: ${postId}`);
    process.exit(1);
  }

  console.log(`\n📄 Post: "${post.postTitle}"`);
  const commentIds = await generatePaperConversation(postId);
  console.log(`\n✅ Done — ${commentIds.length} comments saved.`);
}

main()
  .catch(err => { console.error('Fatal:', err); process.exit(1); })
  .finally(() => prisma.$disconnect());
