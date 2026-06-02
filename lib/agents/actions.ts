/**
 * Agent action implementations
 */

import OpenAI from 'openai';
import { prisma } from '../prisma-cli';
import { AgentIdentity } from './identities';
import { searchPubMedWithDetails, generateSearchQuery, PubMedPaper } from '../pubmed';
import { getPostPrompt, getCommentPrompt, getVotePrompt, getCommentVotePrompt, getRelevanceCheckPrompt, getMrExplainerPrompt, getSpecialistsPrompt, getTheConnectorPrompt, getAcidTripperPrompt } from './prompts';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface PostResult {
  postTitle: string;
  postBody: string;
}

interface CommentResult {
  comment: string;
}

interface VoteResult {
  vote: number; // -1, 0, or 1
  reasoning: string;
}

/**
 * Generate a post draft without saving to database
 * Returns the paper and generated post content
 */
export async function generatePostDraft(identity: AgentIdentity): Promise<{
  paper: PubMedPaper;
  postTitle: string;
  postBody: string;
}> {
  // Generate search query based on specialty
  const query = generateSearchQuery(identity.specialty);
  
  // Search PubMed
  const papers = await searchPubMedWithDetails(query, 10);
  
  if (papers.length === 0) {
    throw new Error('No papers found');
  }
  
  // Select a random paper
  const paper = papers[Math.floor(Math.random() * papers.length)];
  
  // Check if this paper has already been posted
  const existingPost = await prisma.post.findFirst({
    where: {
      OR: [
        { paperDoi: paper.doi || undefined },
        { paperTitle: paper.title },
      ],
    },
  });
  
  if (existingPost) {
    throw new Error('Paper already posted');
  }
  
  // Generate post using LLM
  const prompt = getPostPrompt(identity, paper);
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that generates accessible, engaging posts about scientific papers for a community that includes both researchers and non-scientists.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });
  
  const result = JSON.parse(response.choices[0].message.content || '{}') as PostResult;
  
  return {
    paper,
    postTitle: result.postTitle,
    postBody: result.postBody,
  };
}

/**
 * Check if a post draft is relevant to Kabuki syndrome
 */
export async function checkPostRelevance(
  reviewerIdentity: AgentIdentity,
  postTitle: string,
  postBody: string
): Promise<{ isRelevant: boolean; reasoning: string }> {
  const prompt = getRelevanceCheckPrompt(reviewerIdentity, postTitle, postBody);
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are evaluating whether a post is relevant to Kabuki syndrome research.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3, // Lower temperature for more consistent evaluation
  });
  
  const result = JSON.parse(response.choices[0].message.content || '{}') as {
    isRelevant: boolean;
    reasoning: string;
  };
  
  return result;
}

/**
 * Agent action: Post a paper
 * 1. Search PubMed for papers matching agent's specialty
 * 2. Select a random paper from results
 * 3. Generate accessible post title and body using LLM
 * 4. Save to database
 */
export async function postPaper(agentId: string, identity: AgentIdentity): Promise<string> {
  console.log(`[@${identity.username}] Searching for papers to post...`);

  // Generate search query based on specialty
  const query = generateSearchQuery(identity.specialty);
  console.log(`[@${identity.username}] Query: "${query}"`);

  // Search PubMed
  const papers = await searchPubMedWithDetails(query, 10);

  if (papers.length === 0) {
    throw new Error('No papers found');
  }

  // Select a random paper
  const paper = papers[Math.floor(Math.random() * papers.length)];
  console.log(`[@${identity.username}] Selected: "${paper.title}"`);

  // Check if this paper has already been posted
  const existingPost = await prisma.post.findFirst({
    where: {
      OR: [
        { paperDoi: paper.doi || undefined },
        { paperTitle: paper.title },
      ],
    },
  });

  if (existingPost) {
    console.log(`[@${identity.username}] Paper already posted, skipping`);
    throw new Error('Paper already posted');
  }

  // Generate post using LLM
  console.log(`[@${identity.username}] Generating post...`);
  const prompt = getPostPrompt(identity, paper);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that generates accessible, engaging posts about scientific papers for a community that includes both researchers and non-scientists.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });

  const result = JSON.parse(response.choices[0].message.content || '{}') as PostResult;

  // Save post to database
  const post = await prisma.post.create({
    data: {
      paperDoi: paper.doi,
      paperTitle: paper.title,
      paperAbstract: paper.abstract,
      paperUrl: paper.url,
      postTitle: result.postTitle,
      postBody: result.postBody || null,
      authorAgentId: agentId,
      score: 0,
    },
  });

  // Log action
  await prisma.agentAction.create({
    data: {
      agentId,
      actionType: 'post',
      targetId: post.id,
    },
  });

  console.log(`[@${identity.username}] Posted: "${result.postTitle}"`);

  return post.id;
}

/**
 * Agent action: Comment on a post
 */
export async function commentOnPost(
  agentId: string,
  identity: AgentIdentity,
  postId: string
): Promise<string> {
  console.log(`[@${identity.username}] Reading post to comment on...`);

  // Get post details
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      comments: {
        where: { parentCommentId: null }, // Top-level comments only
        take: 5,
        orderBy: { score: 'desc' },
        include: {
          author: true,
        },
      },
    },
  });

  if (!post) {
    throw new Error('Post not found');
  }

  // Check if agent already commented on this post
  const existingComment = await prisma.comment.findFirst({
    where: {
      postId,
      authorAgentId: agentId,
      parentCommentId: null,
    },
  });

  if (existingComment) {
    console.log(`[@${identity.username}] Already commented on this post, skipping`);
    throw new Error('Already commented');
  }

  // Generate comment using LLM
  console.log(`[@${identity.username}] Generating comment...`);
  const prompt = getCommentPrompt(
    identity,
    post.postTitle,
    post.postBody,
    post.comments.map(c => ({
      author: c.author.username,
      body: c.body,
    }))
  );

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that generates accessible, engaging comments for a research community that includes both researchers and non-scientists.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });

  const result = JSON.parse(response.choices[0].message.content || '{}') as CommentResult;

  // Save comment to database
  const comment = await prisma.comment.create({
    data: {
      postId,
      authorAgentId: agentId,
      body: result.comment,
      score: 0,
      depth: 0,
      threadReplyCount: 0,
    },
  });

  // Log action
  await prisma.agentAction.create({
    data: {
      agentId,
      actionType: 'comment',
      targetId: comment.id,
    },
  });

  console.log(`[@${identity.username}] Commented: "${result.comment.substring(0, 50)}..."`);

  return comment.id;
}

/**
 * Agent action: Vote on a post
 */
export async function voteOnPost(
  agentId: string,
  identity: AgentIdentity,
  postId: string
): Promise<number> {
  // Get post details
  const post = await prisma.post.findUnique({
    where: { id: postId },
  });

  if (!post) {
    throw new Error('Post not found');
  }

  // Check if agent already voted
  const existingVote = await prisma.postVote.findUnique({
    where: {
      postId_agentId: {
        postId,
        agentId,
      },
    },
  });

  if (existingVote) {
    console.log(`[@${identity.username}] Already voted on this post`);
    return existingVote.vote;
  }

  // Generate vote using LLM
  const prompt = getVotePrompt(identity, post.postTitle, post.postBody, post.score);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are evaluating a post for quality and accessibility.',
      },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const result = JSON.parse(response.choices[0].message.content || '{}') as VoteResult;
  const vote = Math.max(-1, Math.min(1, result.vote)); // Clamp to -1, 0, 1

  if (vote === 0) {
    console.log(`[@${identity.username}] Skipped voting on post`);
    return 0;
  }

  // Save vote
  await prisma.postVote.create({
    data: {
      postId,
      agentId,
      vote,
    },
  });

  // Update post score
  await prisma.post.update({
    where: { id: postId },
    data: {
      score: {
        increment: vote,
      },
    },
  });

  // Log action
  await prisma.agentAction.create({
    data: {
      agentId,
      actionType: 'vote_post',
      targetId: postId,
    },
  });

  console.log(`[@${identity.username}] Voted ${vote > 0 ? '+1' : '-1'} on post: ${result.reasoning}`);

  return vote;
}

/**
 * Generate a structured 7-comment discussion on a post:
 * 1. MrExplainer (ELI5)
 * 2. NeuroscienceLady, GeneticsPerson, TheClinician, EnvironmentalEnhancementGuy (parallel specialists)
 * 3. TheConnector (reads all prior)
 * 4. AcidTripper (reads all prior, goes outside the box)
 */
export async function generateConversation(
  postId: string,
): Promise<string[]> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new Error('Post not found');

  // Build a lookup map by username
  const agents = await prisma.agent.findMany();
  const agentMap = new Map(agents.map(a => [a.username, a]));

  const commentIds: string[] = [];
  const priorComments: Array<{ username: string; comment: string }> = [];

  async function saveComment(username: string, body: string): Promise<void> {
    const agent = agentMap.get(username);
    if (!agent) {
      console.warn(`⚠️ Agent @${username} not found in DB, skipping`);
      return;
    }
    const comment = await prisma.comment.create({
      data: { postId, authorAgentId: agent.id, body, score: 0, depth: 0, threadReplyCount: 0 },
    });
    await prisma.agentAction.create({
      data: { agentId: agent.id, actionType: 'comment', targetId: comment.id },
    });
    commentIds.push(comment.id);
    console.log(`[@${username}] "${body.substring(0, 80)}..."`);
  }

  // Step 1: MrExplainer
  console.log('\n📖 Step 1: MrExplainer...');
  const explainerRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: getMrExplainerPrompt(post.postTitle, post.postBody, post.paperAbstract) }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const explainerResult = JSON.parse(explainerRes.choices[0].message.content || '{}') as { comment: string };
  await saveComment('MrExplainer', explainerResult.comment);
  priorComments.push({ username: 'MrExplainer', comment: explainerResult.comment });

  // Step 2: Four specialists (batched in one call)
  console.log('\n🔬 Step 2: NeuroscienceLady, GeneticsPerson, TheClinician, EnvironmentalEnhancementGuy...');
  const specialistsRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: getSpecialistsPrompt(post.postTitle, post.postBody, post.paperAbstract, explainerResult.comment) }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const specialistsResult = JSON.parse(specialistsRes.choices[0].message.content || '{}') as {
    comments: Array<{ username: string; comment: string }>;
  };
  for (const c of specialistsResult.comments) {
    await saveComment(c.username, c.comment);
    priorComments.push(c);
  }

  // Step 3: TheConnector
  console.log('\n🔗 Step 3: TheConnector...');
  const connectorRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: getTheConnectorPrompt(post.postTitle, post.postBody, post.paperAbstract, priorComments) }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const connectorResult = JSON.parse(connectorRes.choices[0].message.content || '{}') as { comment: string };
  await saveComment('TheConnector', connectorResult.comment);
  priorComments.push({ username: 'TheConnector', comment: connectorResult.comment });

  // Step 4: AcidTripper
  console.log('\n🌀 Step 4: AcidTripper...');
  const acidRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: getAcidTripperPrompt(post.postTitle, post.postBody, post.paperAbstract, priorComments) }],
    response_format: { type: 'json_object' },
    temperature: 0.9,
  });
  const acidResult = JSON.parse(acidRes.choices[0].message.content || '{}') as { comment: string };
  await saveComment('AcidTripper', acidResult.comment);

  return commentIds;
}
