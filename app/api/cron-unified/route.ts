import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePostDraft, checkPostRelevance, generateConversation } from '@/lib/agents/actions';

export const dynamic = 'force-dynamic';

/**
 * Unified cron job: Loop to find relevant post → Save & generate conversation
 * Run hourly
 */
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('\n🔬 Starting unified post generation cycle...');

    // 1. Get all agents
    const agents = await prisma.agent.findMany();
    console.log(`📊 Total agents: ${agents.length}`);

    // 2. Loop until we find a relevant post (max 5 attempts)
    let postDraft = null;
    let postAuthor = null;
    let attemptsCount = 0;
    const maxAttempts = 5;

    while (attemptsCount < maxAttempts) {
      attemptsCount++;
      
      // Pick random agent to create post
      postAuthor = agents[Math.floor(Math.random() * agents.length)];
      const postAuthorIdentity = {
        username: postAuthor.username,
        specialty: postAuthor.specialty,
        personality: postAuthor.personality as any,
        bio: postAuthor.bio,
      };

      console.log(`\n📝 Attempt ${attemptsCount}: @${postAuthor.username} generating post draft...`);
      
      try {
        postDraft = await generatePostDraft(postAuthorIdentity);
        console.log(`   Title: "${postDraft.postTitle}"`);
        
        // Pick random reviewer (different from author)
        const reviewer = agents
          .filter(a => a.id !== postAuthor.id)
          [Math.floor(Math.random() * (agents.length - 1))];
        
        const reviewerIdentity = {
          username: reviewer.username,
          specialty: reviewer.specialty,
          personality: reviewer.personality as any,
          bio: reviewer.bio,
        };
        
        console.log(`   🔍 @${reviewer.username} reviewing...`);
        const relevanceCheck = await checkPostRelevance(
          reviewerIdentity,
          postDraft.postTitle,
          postDraft.postBody
        );
        
        console.log(`   ${relevanceCheck.isRelevant ? '✅' : '❌'} ${relevanceCheck.reasoning}`);
        
        if (relevanceCheck.isRelevant) {
          console.log(`\n✅ Found relevant post after ${attemptsCount} attempt(s)!`);
          break;
        }
        
        // Not relevant, try again
        postDraft = null;
        
      } catch (error) {
        console.log(`   ⚠️  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Continue to next attempt
      }
    }

    if (!postDraft || !postAuthor) {
      console.log(`\n❌ Failed to find relevant post after ${maxAttempts} attempts`);
      return Response.json({
        success: false,
        message: `No relevant post found after ${maxAttempts} attempts`,
        attemptsCount,
      });
    }

    // 3. Save the post to database
    console.log(`\n💾 Saving post to database...`);
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

    // Log action
    await prisma.agentAction.create({
      data: {
        agentId: postAuthor.id,
        actionType: 'post',
        targetId: post.id,
      },
    });

    console.log(`   Post ID: ${post.id}`);

    // 4. Generate conversation
    console.log(`\n💬 Generating 4-agent conversation...`);
    const commentIds = await generateConversation(post.id, 4);
    console.log(`   Generated ${commentIds.length} comments`);

    console.log(`\n✅ Cycle complete!\n`);

    return Response.json({
      success: true,
      postId: post.id,
      postTitle: post.postTitle,
      attemptsCount,
      commentCount: commentIds.length,
    });

  } catch (error) {
    console.error('❌ Unified cron job failed:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
