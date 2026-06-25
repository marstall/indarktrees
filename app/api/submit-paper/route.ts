import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { searchPubMedWithDetails } from '@/lib/pubmed';
import { embedText, findSimilarPapers } from '@/lib/papers/embeddings';
import { auditionPaper, generatePaperComment, getPaperVote, formatByline } from '@/lib/papers/paper-comments';
import { getPostPrompt, getMrExplainerPrompt } from '@/lib/agents/prompts';

export const runtime = 'nodejs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runPaperConversation(
  postId: string,
  postTitle: string,
  postBody: string | null,
  paperAbstract: string | null,
  paperDoi: string | null,
  minComments = 5,
): Promise<void> {
  // Step 1: MrExplainer
  const mrExplainerAgent = await prisma.agent.findFirst({ where: { username: 'MrExplainer' } });
  if (!mrExplainerAgent) throw new Error('MrExplainer agent not found');

  const explainerRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: getMrExplainerPrompt(postTitle, postBody, paperAbstract) }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const explainerResult = JSON.parse(explainerRes.choices[0].message.content || '{}') as { comment: string };
  const explainerComment = await prisma.comment.create({
    data: { postId, authorAgentId: mrExplainerAgent.id, body: explainerResult.comment, score: 0, depth: 0, threadReplyCount: 0 },
  });
  await prisma.agentAction.create({ data: { agentId: mrExplainerAgent.id, actionType: 'comment', targetId: explainerComment.id } });

  const commentBodies: string[] = [explainerResult.comment];

  // Step 2: Embed post paper for similarity search
  const postEmbedInput = [postTitle, paperAbstract].filter(Boolean).join('\n\n');
  const postEmbedding = await embedText(postEmbedInput);
  const postPaperRecord = paperDoi
    ? await prisma.paper.findFirst({ where: { doi: paperDoi }, select: { id: true } })
    : null;

  // Step 3: Find + audition candidate papers
  const candidates = (await findSimilarPapers(postEmbedding, postPaperRecord?.id, 200, prisma as any))
    .sort(() => Math.random() - 0.5);

  const winners: Array<{ candidate: typeof candidates[0]; angle: string }> = [];
  for (const candidate of candidates) {
    if (winners.length >= minComments) break;
    const result = await auditionPaper(postTitle, paperAbstract, candidate);
    if (result.willComment && result.angle) {
      winners.push({ candidate, angle: result.angle });
      console.log(`  ✅ ${formatByline(candidate)} — ${result.angle}`);
    }
  }

  // Step 4: Generate paper comments
  for (const { candidate, angle } of winners) {
    const body = await generatePaperComment(postTitle, paperAbstract, candidate, angle, commentBodies);
    if (!body) continue;
    await prisma.comment.create({
      data: { postId, authorPaperId: candidate.id, body, score: 0, depth: 0, threadReplyCount: 0 },
    });
    commentBodies.push(body);
  }

  // Step 5: Paper voting
  const allComments = await prisma.comment.findMany({ where: { postId }, select: { id: true, body: true } });
  const commenterIds = new Set(winners.map(w => w.candidate.id));
  const voterPool = await prisma.paper.findMany({
    where: { isRelevant: true, id: { notIn: Array.from(commenterIds) } },
    select: { id: true, title: true, authors: true, year: true, abstract: true, fullText: true },
    take: 50,
  });
  const voters = voterPool.sort(() => Math.random() - 0.5).slice(0, 5);

  for (const voter of voters) {
    for (const comment of allComments) {
      const vote = await getPaperVote(
        { id: voter.id, title: voter.title, abstract: voter.abstract, authors: voter.authors, year: voter.year, fullText: voter.fullText },
        comment.body,
        postTitle,
      );
      if (vote !== 0) {
        await prisma.comment.update({ where: { id: comment.id }, data: { score: { increment: vote } } });
      }
    }
  }
}

export async function POST(req: NextRequest) {
  let body: { url?: string; honeypot?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (body.honeypot) {
    return new Response('Bad request', { status: 400 });
  }

  const url = body.url?.trim() ?? '';

  if (!url) {
    return Response.json({ error: 'URL is required' }, { status: 400 });
  }
  if (url.length > 2000) {
    return Response.json({ error: 'URL is too long (max 2000 characters)' }, { status: 400 });
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return Response.json({ error: 'URL must use http or https' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  const existingByUrl = await prisma.post.findFirst({
    where: { paperUrl: url },
    select: { id: true },
  });
  if (existingByUrl) {
    return Response.json({ error: 'This URL has already been submitted.' }, { status: 409 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(data: { type: string; message?: string; postId?: string }) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
      }

      try {
        // Step 1: Download via Jina Reader
        send({ type: 'progress', message: 'Downloading paper...' });
        const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
          headers: { Accept: 'text/plain' },
        });
        if (!jinaRes.ok) {
          send({ type: 'error', message: `Failed to download that URL (HTTP ${jinaRes.status}). Try a direct link to the paper page.` });
          controller.close();
          return;
        }
        const rawText = await jinaRes.text();
        if (rawText.length < 200) {
          send({ type: 'error', message: 'Could not read enough content — the page may be paywalled or require a login.' });
          controller.close();
          return;
        }

        // Step 2: Extract metadata + validate this is a bio paper
        send({ type: 'progress', message: 'Analyzing paper...' });
        const analysisRes = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: 'You extract metadata from webpages and assess whether they are bio-related scientific papers. Return ONLY valid JSON.',
            },
            {
              role: 'user',
              content: `Analyze this page. Return JSON with exactly these keys:
- isBioPaper: boolean (true if this is a biological, biomedical, or life sciences research paper)
- notBioReason: string (one sentence why it is NOT a bio paper, or "" if it is one)
- title: string (full article title, or "" if not found)
- abstract: string (full abstract text, or first 3 paragraphs if no abstract section, or "")
- authors: string[] (["LastName Initial", ...], or [])
- journal: string or null
- year: number or null (publication year as integer)
- doi: string or null (DOI without "https://doi.org/" prefix)
- pmid: string or null (PubMed ID if present)

Source URL: ${url}

Page content (first 8000 characters):
${rawText.substring(0, 8000)}`,
            },
          ],
        });

        const analysis = JSON.parse(analysisRes.choices[0].message.content || '{}') as {
          isBioPaper: boolean;
          notBioReason: string;
          title: string;
          abstract: string;
          authors: string[];
          journal: string | null;
          year: number | null;
          doi: string | null;
          pmid: string | null;
        };

        if (!analysis.isBioPaper) {
          const reason = analysis.notBioReason || 'This does not appear to be a biological or biomedical scientific paper.';
          send({ type: 'error', message: reason });
          controller.close();
          return;
        }

        if (!analysis.title) {
          send({ type: 'error', message: 'Could not identify a paper title from that URL. Please link directly to a scientific paper.' });
          controller.close();
          return;
        }

        const dupPost = await prisma.post.findFirst({
          where: {
            OR: [
              ...(analysis.doi ? [{ paperDoi: analysis.doi }] : []),
              { paperTitle: analysis.title },
            ],
          },
          select: { id: true },
        });
        if (dupPost) {
          send({ type: 'error', message: 'This paper has already been posted.' });
          controller.close();
          return;
        }

        // Step 3: Extract PubMed search keywords
        send({ type: 'progress', message: 'Extracting search keywords...' });
        const kwRes = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: 'Extract the best PubMed search keyword from a research paper. Return ONLY valid JSON.',
            },
            {
              role: 'user',
              content: `Extract PubMed search keywords for this paper. Return JSON:
- primaryKeyword: string (the single most specific and searchable term — prefer the condition/disease name, gene/protein name, or specific biological process, e.g. "CRISPR off-target effects", "VEGF angiogenesis", "hippocampal plasticity")
- keywords: string[] (2-5 additional useful search terms: body system, cell type, gene/protein, therapy type, mechanism)

Paper title: ${analysis.title}
Abstract: ${(analysis.abstract || '').substring(0, 2000)}`,
            },
          ],
        });
        const kwData = JSON.parse(kwRes.choices[0].message.content || '{}') as {
          primaryKeyword: string;
          keywords: string[];
        };
        const primaryKeyword = kwData.primaryKeyword || analysis.title.split(' ').slice(0, 5).join(' ');

        // Step 4: Search PubMed for 50 related papers
        send({ type: 'progress', message: `Searching PubMed for papers on "${primaryKeyword}"...` });
        const pubmedPapers = await searchPubMedWithDetails(primaryKeyword, 50);
        send({ type: 'progress', message: `Found ${pubmedPapers.length} related papers. Saving to database...` });

        // Step 5: Save PubMed papers
        let savedCount = 0;
        for (const paper of pubmedPapers) {
          const keyFilter = [
            ...(paper.pmid ? [{ pmid: paper.pmid }] : []),
            ...(paper.doi ? [{ doi: paper.doi }] : []),
          ];
          if (keyFilter.length === 0) continue;
          const dup = await prisma.paper.findFirst({ where: { OR: keyFilter }, select: { id: true } });
          if (dup) continue;

          await prisma.paper.create({
            data: {
              pmid: paper.pmid || null,
              doi: paper.doi || null,
              title: paper.title,
              abstract: paper.abstract || null,
              authors: paper.authors.join(', ') || null,
              journal: paper.journal || null,
              year: paper.pubDate ? (parseInt(paper.pubDate, 10) || null) : null,
              url: paper.url,
              isRelevant: true,
              relevanceReason: `Related paper from PubMed search: "${primaryKeyword}"`,
              searchTopics: primaryKeyword,
            },
          });
          savedCount++;
        }

        // Step 6: Upsert submitted paper
        send({ type: 'progress', message: `Saved ${savedCount} new related papers. Processing submitted paper...` });

        const dupPaperFilter = [
          ...(analysis.doi ? [{ doi: analysis.doi }] : []),
          ...(analysis.pmid ? [{ pmid: analysis.pmid }] : []),
          { title: analysis.title },
        ];
        const existingPaper = await prisma.paper.findFirst({
          where: { OR: dupPaperFilter },
          select: { id: true },
        });

        let paperId: string;
        if (existingPaper) {
          await prisma.paper.update({
            where: { id: existingPaper.id },
            data: {
              isRelevant: true,
              fullText: rawText.substring(0, 50000),
              fullTextSource: 'jina',
              ...(analysis.authors?.length > 0 ? { authors: analysis.authors.join(', ') } : {}),
              ...(analysis.year ? { year: analysis.year } : {}),
              ...(analysis.doi ? { doi: analysis.doi } : {}),
              ...(analysis.abstract ? { abstract: analysis.abstract } : {}),
              ...(analysis.journal ? { journal: analysis.journal } : {}),
            },
          });
          paperId = existingPaper.id;
        } else {
          const created = await prisma.paper.create({
            data: {
              pmid: analysis.pmid || null,
              doi: analysis.doi || null,
              title: analysis.title,
              abstract: analysis.abstract || null,
              authors: analysis.authors?.join(', ') || null,
              journal: analysis.journal || null,
              year: analysis.year || null,
              url,
              fullText: rawText.substring(0, 50000),
              fullTextSource: 'jina',
              isRelevant: true,
              relevanceReason: 'Submitted by user via website',
              searchTopics: primaryKeyword,
            },
          });
          paperId = created.id;
        }

        // Embed submitted paper for similarity search
        send({ type: 'progress', message: 'Embedding paper for similarity search...' });
        const embedInput = [analysis.title, analysis.abstract].filter(Boolean).join('\n\n');
        const embedding = await embedText(embedInput);
        await prisma.paper.update({
          where: { id: paperId },
          data: { embedding: embedding as any },
        });

        // Step 7: Generate post
        send({ type: 'progress', message: 'Generating post...' });
        const mrExplainer = await prisma.agent.findFirst({ where: { username: 'MrExplainer' } });
        const postAuthor = mrExplainer ?? await prisma.agent.findFirst();
        if (!postAuthor) throw new Error('No agents found in database — please run the seed script first');

        const identity = {
          username: postAuthor.username,
          specialty: postAuthor.specialty,
          personality: postAuthor.personality as any,
          bio: postAuthor.bio,
        };

        const paperForPrompt = {
          pmid: analysis.pmid || '',
          doi: analysis.doi || undefined,
          title: analysis.title,
          abstract: analysis.abstract || undefined,
          authors: analysis.authors || [],
          journal: analysis.journal || undefined,
          pubDate: analysis.year ? String(analysis.year) : undefined,
          url,
        };

        const postPromptText = getPostPrompt(identity, paperForPrompt);
        const postRes = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          temperature: 0.8,
          messages: [
            { role: 'system', content: 'Generate an accessible, engaging post about a scientific paper.' },
            { role: 'user', content: postPromptText },
          ],
        });
        const postData = JSON.parse(postRes.choices[0].message.content || '{}') as {
          postTitle?: string;
          postBody?: string;
        };
        if (!postData.postTitle) throw new Error('Failed to generate post title');

        const post = await prisma.post.create({
          data: {
            postTitle: postData.postTitle,
            postBody: postData.postBody || null,
            authorAgentId: postAuthor.id,
            paperTitle: analysis.title,
            paperDoi: analysis.doi || null,
            paperAbstract: analysis.abstract || null,
            paperUrl: url,
            score: 0,
          },
        });

        // Step 8: Generate scientific discussion
        send({ type: 'progress', message: 'Generating scientific discussion (1–2 minutes)...' });
        await runPaperConversation(post.id, post.postTitle, post.postBody, post.paperAbstract, post.paperDoi);

        send({ type: 'done', postId: post.id });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.';
        send({ type: 'error', message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
