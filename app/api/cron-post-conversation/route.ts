import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { postPaper } from '@/lib/agents/actions';
import { generateConversation } from '@/lib/agents/actions';

export const dynamic = 'force-dynamic';

/**
 * Cron job to create a post and generate a conversation
 * Run less frequently (e.g., every 6 hours)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('\n🔬 Starting post + conversation generation...');

    // 1. Get a random agent to create the post
    const agents = await prisma.agent.findMany();
    const randomAgent = agents[Math.floor(Math.random() * agents.length)];

    const agentIdentity = {
      username: randomAgent.username,
      specialty: randomAgent.specialty,
      personality: randomAgent.personality as any,
      bio: randomAgent.bio,
    };

    // 2. Create the post
    console.log(`📝 Agent @${randomAgent.username} creating post...`);
    const postId = await postPaper(randomAgent.id, agentIdentity);

    // 3. Generate conversation (4 agents)
    console.log(`💬 Generating conversation with 4 agents...`);
    const commentIds = await generateConversation(postId);

    console.log(`✅ Success! Created post ${postId} with ${commentIds.length} comments\n`);

    return Response.json({
      success: true,
      postId,
      commentCount: commentIds.length,
    });

  } catch (error) {
    console.error('❌ Cron job failed:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
