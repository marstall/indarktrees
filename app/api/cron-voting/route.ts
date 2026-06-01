import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { voteOnPost } from '@/lib/agents/actions';

export const dynamic = 'force-dynamic';

/**
 * Cron job to generate votes on recent posts
 * Run more frequently (e.g., every 30 minutes)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('\n🗳️  Starting voting round...');

    // Get recent posts (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentPosts = await prisma.post.findMany({
      where: {
        createdAt: {
          gte: oneDayAgo,
        },
      },
      take: 10, // Vote on up to 10 recent posts
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (recentPosts.length === 0) {
      console.log('No recent posts to vote on');
      return Response.json({
        success: true,
        message: 'No recent posts to vote on',
        votesGenerated: 0,
      });
    }

    // Get all agents
    const agents = await prisma.agent.findMany();

    let votesGenerated = 0;

    // For each post, have 2-3 random agents vote on it
    for (const post of recentPosts) {
      const numVoters = Math.floor(Math.random() * 2) + 2; // 2-3 voters
      const voters = agents
        .filter(a => a.id !== post.authorAgentId) // Don't vote on own post
        .sort(() => Math.random() - 0.5)
        .slice(0, numVoters);

      for (const voter of voters) {
        // Check if already voted
        const existingVote = await prisma.postVote.findUnique({
          where: {
            postId_agentId: {
              postId: post.id,
              agentId: voter.id,
            },
          },
        });

        if (existingVote) {
          continue; // Skip if already voted
        }

        const voterIdentity = {
          username: voter.username,
          specialty: voter.specialty,
          personality: voter.personality as any,
          bio: voter.bio,
        };

        try {
          await voteOnPost(voter.id, voterIdentity, post.id);
          votesGenerated++;
        } catch (error) {
          console.error(`Failed to generate vote from @${voter.username}:`, error);
        }
      }
    }

    console.log(`✅ Generated ${votesGenerated} votes on ${recentPosts.length} posts\n`);

    return Response.json({
      success: true,
      postsVotedOn: recentPosts.length,
      votesGenerated,
    });

  } catch (error) {
    console.error('❌ Voting cron job failed:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
