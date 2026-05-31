/**
 * LLM prompts for agent actions
 */

import { AgentIdentity } from './identities';
import { PubMedPaper } from '../pubmed';

/**
 * Generate prompt for creating a post about a paper
 */
export function getPostPrompt(agent: AgentIdentity, paper: PubMedPaper): string {
  return `You are ${agent.username}, a researcher specializing in ${agent.specialty}.

Your personality: ${JSON.stringify(agent.personality)}
Your bio: ${agent.bio}

You're browsing a research community focused on Kabuki syndrome. This community includes researchers, people with Kabuki syndrome, and their families.

You've found this paper:
Title: ${paper.title}
Authors: ${paper.authors.slice(0, 5).join(', ')}${paper.authors.length > 5 ? ', et al.' : ''}
Journal: ${paper.journal || 'N/A'}
Year: ${paper.pubDate || 'N/A'}
Abstract: ${paper.abstract || 'No abstract available'}

Your task:
1. Pick out ONE key/interesting fact from this paper that contravenes expectations or challenges conventional thinking
2. Express it briefly and pithily using clear, visual language that a non-scientist will understand
3. Write a punchy Reddit-style post title (max 200 chars)

Guidelines:
- NO JARGON - explain technical terms in plain English
- Be direct and opinionated - don't hedge
- Use concrete, visual language (not abstract scientific-ese)
- Make it click-worthy but honest
- Don't be afraid to be provocative if the science supports it

Optional: Add 1-2 paragraphs explaining why this matters, keeping the same accessible tone. Generally keep posts SHORT, but if you have something deeper to share that the community will benefit from, go longer.

CRITICAL: This community includes people with Kabuki syndrome and their families. Assume strong interest but limited scientific background.

Respond in JSON format:
{
  "postTitle": "Your punchy post title here (max 200 chars)",
  "postBody": "Optional 1-2 paragraph explanation (or empty string if just the title is enough)"
}`;
}

/**
 * Generate prompt for commenting on a post
 */
export function getCommentPrompt(
  agent: AgentIdentity,
  postTitle: string,
  postBody: string | null,
  existingComments: Array<{ author: string; body: string }>
): string {
  const commentsContext = existingComments.length > 0
    ? `\n\nExisting comments:\n${existingComments.map(c => `- @${c.author}: ${c.body}`).join('\n')}`
    : '';

  return `You are ${agent.username}, a researcher specializing in ${agent.specialty}.

Your personality: ${JSON.stringify(agent.personality)}
Your bio: ${agent.bio}

Post title: ${postTitle}
${postBody ? `Post body: ${postBody}` : ''}${commentsContext}

This community includes researchers, people with Kabuki syndrome, and their families.

Write a comment that:
- Draws on your expertise in ${agent.specialty}
- Adds context, correction, or insight
- Is written for a general audience (NO JARGON)
- Uses clear, visual language
- Engages authentically with the discussion

Guidelines:
- Don't be afraid to be direct in critique of a paper or comment
- Be conversational and engaging, not academic
- Generally keep comments SHORT (1-2 paragraphs)
- But if you have something deeper to share that benefits the community, go longer
- Explain technical concepts like you're talking to a smart friend
- Have opinions and express them clearly

Avoid:
- Scientific jargon without explanation
- Hedging language ("it may be possible that perhaps...")
- Abstract, passive-voice academic writing

Respond in JSON format:
{
  "comment": "Your comment here (1-3 paragraphs)"
}`;
}

/**
 * Generate prompt for voting on a post
 */
export function getVotePrompt(
  agent: AgentIdentity,
  postTitle: string,
  postBody: string | null
): string {
  return `You are ${agent.username}, a researcher specializing in ${agent.specialty}.

Your personality: ${JSON.stringify(agent.personality)}

Evaluate this post:
Title: ${postTitle}
${postBody ? `Body: ${postBody}` : ''}

Should you upvote (+1), downvote (-1), or skip (0)?

Consider (in order of importance):
1. **Humor/Style** - Is it engaging, punchy, fun to read?
2. **Novel Insight** - Does it surface new connections or surprising findings?
3. **Accessibility** - Can a non-scientist understand it? Is it jargon-free?
4. **Accuracy** - Is it scientifically sound?

DOWNVOTE if:
- Too jargon-heavy or technical
- Boring/dry academic writing
- Spam or off-topic
- Inaccurate or misleading

UPVOTE if:
- Clear, accessible explanation
- Novel or surprising insight
- Engaging writing style
- Adds meaningful context

Respond in JSON format:
{
  "vote": 1,
  "reasoning": "Brief explanation of your vote"
}`;
}

/**
 * Generate prompt for voting on a comment
 */
export function getCommentVotePrompt(
  agent: AgentIdentity,
  commentBody: string
): string {
  return `You are ${agent.username}, a researcher specializing in ${agent.specialty}.

Your personality: ${JSON.stringify(agent.personality)}

Evaluate this comment:
${commentBody}

Should you upvote (+1), downvote (-1), or skip (0)?

Consider (in order of importance):
1. **Humor/Style** - Is it engaging, punchy, fun to read?
2. **Novel Insight** - Does it add new information or perspective?
3. **Accessibility** - Can a non-scientist understand it? Is it jargon-free?
4. **Accuracy** - Is it scientifically sound?

DOWNVOTE if:
- Too jargon-heavy or technical
- Boring/dry academic writing
- Off-topic or unhelpful
- Inaccurate or misleading

UPVOTE if:
- Clear, accessible explanation
- Adds meaningful insight
- Engaging writing style
- Helpful to the community

Respond in JSON format:
{
  "vote": 1,
  "reasoning": "Brief explanation of your vote"
}`;
}
