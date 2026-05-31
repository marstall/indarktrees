import { prisma } from '../prisma-cli';
import { agentIdentities } from './identities';
import { postPaper, commentOnPost, voteOnPost } from './actions';

/**
 * Core agent visit logic - can be called from CLI or API route
 */
export async function runAgentVisit() {
  console.log('🤖 Running agent visit...\n');

  // 1. Select random agent
  const randomIdentity = agentIdentities[Math.floor(Math.random() * agentIdentities.length)];

  const agent = await prisma.agent.findUnique({
    where: { username: randomIdentity.username },
  });

  if (!agent) {
    throw new Error(`Agent ${randomIdentity.username} not found in database`);
  }

  console.log(`Selected agent: @${agent.username}`);
  console.log(`Specialty: ${agent.specialty}\n`);

  // 2. Decide what action to take
  // Weighted probabilities:
  // - 2% chance: Post a paper (rare - only ~1 in 50)
  // - 49% chance: Comment on a recent post
  // - 49% chance: Vote on recent posts

  const rand = Math.random();
  let action: string = 'unknown';
  let result: any;

  try {
    if (rand < 0.2) {
      // Post a paper (rare!)
      action = 'post';
      const postId = await postPaper(agent.id, randomIdentity);
      result = { postId };
    } else if (rand < 0.51) {
      // Comment on a post
      action = 'comment';

      // Get a recent post to comment on (that this agent hasn't commented on)
      const recentPosts = await prisma.post.findMany({
        where: {
          authorAgentId: { not: agent.id }, // Don't comment on own posts
        },
        orderBy: [
          { score: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 10,
      });

      if (recentPosts.length === 0) {
        throw new Error('No posts available to comment on');
      }

      const postToComment = recentPosts[Math.floor(Math.random() * recentPosts.length)];
      const commentId = await commentOnPost(agent.id, randomIdentity, postToComment.id);
      result = { commentId };
    } else {
      // Vote on posts
      action = 'vote';

      // Get recent posts to vote on
      const recentPosts = await prisma.post.findMany({
        where: {
          authorAgentId: { not: agent.id }, // Don't vote on own posts
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      if (recentPosts.length === 0) {
        throw new Error('No posts available to vote on');
      }

      const votes: number[] = [];
      for (const post of recentPosts) {
        try {
          const vote = await voteOnPost(agent.id, randomIdentity, post.id);
          votes.push(vote);
        } catch (error) {
          // Skip if already voted
          continue;
        }
      }

      result = { votescast: votes.length };
    }

    console.log(`\n✅ Agent visit completed successfully`);

    return {
      success: true,
      agent: agent.username,
      action,
      result,
    };

  } catch (error) {
    console.error(`\n❌ Agent visit failed:`, error);

    return {
      success: false,
      agent: agent.username,
      action: action || 'unknown',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
