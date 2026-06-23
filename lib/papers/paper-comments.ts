/**
 * Paper-as-commenter system using Claude.
 *
 * Flow:
 *   1. auditionPaper()  — cheap Haiku call, decides yes/no + angle
 *   2. generatePaperComment() — Sonnet call, writes the actual comment
 *
 * Papers speak in first person from their own findings.
 * Byline: "Chen et al. 2023" (first author last name + year)
 */

import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_FAST = 'claude-haiku-4-5';
const CLAUDE_QUALITY = 'claude-sonnet-4-5';

let _claude: Anthropic | null = null;
function getClaude() {
  if (!_claude) _claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _claude;

}

export interface PaperCandidate {
  id: string;
  title: string;
  abstract: string | null;
  authors: string | null;
  year: number | null;
  fullText: string | null;
}

/**
 * Format a paper's byline: "Chen et al. 2023"
 * PubMed author format is "LastName Initials" e.g. "Smith JA, Jones B"
 */
export function formatByline(paper: { authors: string | null; year: number | null }): string {
  const authorList = (paper.authors || '')
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);

  if (authorList.length === 0) return paper.year ? String(paper.year) : 'Unknown';

  const firstAuthorLastName = authorList[0].split(' ')[0];
  const suffix = authorList.length > 1 ? ' et al.' : '';
  const year = paper.year ? ` ${paper.year}` : '';

  return `${firstAuthorLastName}${suffix}${year}`;
}

function isCreditBalanceError(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes('credit balance');
}

function parseClaudeJSON(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Ask a paper whether it has something non-obvious to contribute.
 * Returns willComment + the angle if yes.
 */
export async function auditionPaper(
  postTitle: string,
  postAbstract: string | null,
  candidate: PaperCandidate,
): Promise<{ willComment: boolean; angle: string | null }> {
  const byline = formatByline(candidate);
  const candidateContext = (candidate.abstract || candidate.title).substring(0, 1500);

  try {
    const res = await getClaude().messages.create({
      model: CLAUDE_FAST,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `You are the research paper "${candidate.title}" (${byline}).

This is a discussion forum for Kabuki syndrome — a rare disorder caused by KMT2D or KDM6A mutations, causing intellectual disability, executive function deficits, memory problems, and neurodevelopmental differences. All papers here are Kabuki-related. Posts may come from adjacent neuroscience fields but are always selected for Kabuki relevance.

A post has just been shared:
Title: "${postTitle}"
${postAbstract ? `Abstract: ${postAbstract}` : ''}

Your findings:
${candidateContext}

What specific insight from YOUR findings would you contribute to this discussion? Write one sentence describing exactly what you would add — either a direct scientific connection, or a Kabuki-angle bridge (e.g. "our findings on KMT2D loss in hippocampal circuits speak directly to the memory consolidation mechanisms this paper describes").

If you genuinely have zero relevant findings — nothing about the mechanisms, circuits, cell types, genes, or conditions discussed — respond with null.

Respond ONLY in JSON: { "angle": "your one-sentence contribution, or null" }`,
      }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '{}';
    console.log(`    [raw] ${byline}: ${text.substring(0, 200)}`);
    const parsed = parseClaudeJSON(text);
    const angle = typeof parsed.angle === 'string' && parsed.angle.toLowerCase() !== 'null' ? parsed.angle : null;
    return {
      willComment: angle !== null,
      angle,
    };
  } catch (err) {
    console.log(`    [err] ${byline}: ${err}`);
    if (isCreditBalanceError(err)) {
      throw new Error(`Anthropic API credit balance exhausted — please top up your account. (${err instanceof Error ? err.message : err})`);
    }
    return { willComment: false, angle: null };
  }
}

/**
 * Generate a comment in the voice of a paper given a confirmed angle.
 */
export async function generatePaperComment(
  postTitle: string,
  postAbstract: string | null,
  paper: PaperCandidate,
  angle: string,
  existingCommentBodies: string[],
): Promise<string | null> {
  const byline = formatByline(paper);
  const paperContext = (paper.fullText || paper.abstract || '').substring(0, 3000);

  const priorContext = existingCommentBodies.length > 0
    ? `\n\nThread so far:\n${existingCommentBodies.map((c, i) => `[Comment ${i + 1}]\n${c.substring(0, 800)}`).join('\n\n---\n\n')}`
    : '';

  const threadInstructions = existingCommentBodies.length > 0
    ? `- The thread above already exists — READ IT before writing. Do not repeat observations already made.
- If a prior comment says something you agree with or your data supports, acknowledge it briefly and build further.
- If a prior comment makes a claim your data challenges or complicates, engage with it directly.
- Add something the thread doesn't yet have — a different mechanism, a different model organism, a different patient population, a different timepoint.`
    : `- No other comments yet — set a strong, specific tone for the discussion.`;

  try {
    const res = await getClaude().messages.create({
      model: CLAUDE_QUALITY,
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `You are writing a comment as the scientific paper "${paper.title}" (${byline}).

Your paper's content:
${paperContext}

The post being discussed:
"${postTitle}"
${postAbstract ? `Abstract: ${postAbstract}` : ''}${priorContext}

Your specific angle: ${angle}

Write a comment from the perspective of your paper's findings. Speak in first person as this paper — your data is your authority, your methods are your experience.

Your job is NOT to summarize your own paper. Your job is to use what you found as a lens to illuminate, extend, or complicate what the posted paper is saying. The reader already has the posted paper in front of them — help them understand it more deeply, see something they might have missed, or think about it differently. Your findings are your tool, not your subject.

Guidelines:
- 2–3 paragraphs, no markdown headers, flowing prose only
- Reference your own findings only insofar as they bear on the posted paper ("What we found in our mouse model suggests that...", "Our data on KDM6A patients complicates this picture because...")
- Do not spend more than one sentence establishing what your paper is about — get to the insight quickly
- Engage with the posted paper — extend, confirm, or push back based on your evidence
- Explain technical terms immediately if you must use them
- Do NOT say "as a paper" or break the voice in any way
${threadInstructions}

Respond ONLY in JSON: { "comment": "your full comment text" }`,
      }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '{}';
    const parsed = parseClaudeJSON(text);
    return typeof parsed.comment === 'string' && parsed.comment.length > 0
      ? parsed.comment
      : null;
  } catch (err) {
    if (isCreditBalanceError(err)) {
      throw new Error(`Anthropic API credit balance exhausted — please top up your account. (${err instanceof Error ? err.message : err})`);
    }
    return null;
  }
}

/**
 * Stream a paper's reply to a human question.
 * Returns a raw Anthropic MessageStream; the caller reads it chunk by chunk.
 */
export function streamPaperReply(
  paper: PaperCandidate,
  question: string,
  originalCommentBody: string,
  postTitle: string,
  postAbstract: string | null,
) {
  const byline = formatByline(paper);
  const paperContext = (paper.fullText || paper.abstract || '').substring(0, 2000);

  return getClaude().messages.stream({
    model: CLAUDE_QUALITY,
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are the research paper "${paper.title}" (${byline}).

Your paper's content:
${paperContext}

Post being discussed: "${postTitle}"
${postAbstract ? `Abstract: ${postAbstract}` : ''}

Your earlier comment in this discussion:
${originalCommentBody || '(You have not yet commented.)'}

A reader has now asked you:
${question}

Reply directly and thoughtfully in the voice of your paper — 2–3 paragraphs, no markdown headers, flowing prose. Reference your specific findings where they bear on the question. You are a scientific paper speaking from your data, not a generic assistant.`,
    }],
  });
}

/**
 * Have a paper cast a +1 / -1 / 0 vote on a comment.
 */
export async function getPaperVote(
  paper: PaperCandidate,
  commentBody: string,
  postTitle: string,
): Promise<number> {
  try {
    const res = await getClaude().messages.create({
      model: CLAUDE_FAST,
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `You are the research paper "${paper.title}" (${formatByline(paper)}).

A comment was posted in a discussion about: "${postTitle}"

Comment:
${commentBody.substring(0, 600)}

Based on your paper's findings, does this comment add genuine scientific insight to the discussion? Vote +1 if it makes a useful, accurate contribution. Vote -1 if it is misleading, redundant, or low quality. Vote 0 if you have no strong opinion.

Respond ONLY in JSON: { "vote": 1 | 0 | -1 }`,
      }],
    });

    const text = res.content[0].type === 'text' ? res.content[0].text : '{}';
    const parsed = parseClaudeJSON(text);
    const v = Number(parsed.vote);
    return v === 1 ? 1 : v === -1 ? -1 : 0;
  } catch (err) {
    if (isCreditBalanceError(err)) {
      throw new Error(`Anthropic API credit balance exhausted — please top up your account. (${err instanceof Error ? err.message : err})`);
    }
    return 0;
  }
}
