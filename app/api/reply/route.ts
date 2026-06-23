import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { streamPaperReply } from '@/lib/papers/paper-comments';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      commentId?: string;
      postId?: string;
      question: string;
      authorName?: string;
      honeypot?: string;
    };

    const { commentId, postId, question, authorName, honeypot } = body;

    if (honeypot) {
      return new Response('Bad request', { status: 400 });
    }

    if (!question?.trim()) {
      return Response.json({ error: 'Question is required' }, { status: 400 });
    }

    const cookieId = req.cookies.get('idt-uid')?.value ?? null;

    let paper: { id: string; title: string; abstract: string | null; authors: string | null; year: number | null; fullText: string | null } | null = null;
    let originalCommentBody = '';
    let dbPostId: string;
    let parentCommentId: string | null = null;

    if (commentId) {
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: { authorPaper: true },
      });
      if (!comment?.authorPaper) {
        return Response.json({ error: 'Comment not found or not a paper comment' }, { status: 404 });
      }
      paper = comment.authorPaper;
      originalCommentBody = comment.body;
      dbPostId = comment.postId;
      parentCommentId = commentId;
    } else if (postId) {
      const post = await prisma.post.findUnique({ where: { id: postId } });
      if (!post?.paperDoi) {
        return Response.json({ error: 'Post paper DOI not found' }, { status: 404 });
      }
      const dbPaper = await prisma.paper.findFirst({ where: { doi: post.paperDoi } });
      if (!dbPaper) {
        return Response.json({ error: 'Paper not in database' }, { status: 404 });
      }
      paper = dbPaper;
      dbPostId = postId;
      parentCommentId = null;
    } else {
      return Response.json({ error: 'commentId or postId required' }, { status: 400 });
    }

    const humanComment = await prisma.comment.create({
      data: {
        postId: dbPostId,
        parentCommentId,
        authorName: authorName?.trim() || 'Anonymous',
        cookieId,
        body: question.trim(),
        depth: parentCommentId ? 1 : 0,
        score: 0,
        threadReplyCount: 0,
      },
    });

    const post = await prisma.post.findUnique({
      where: { id: dbPostId },
      select: { postTitle: true, paperAbstract: true },
    });

    const claudeStream = streamPaperReply(
      paper,
      question.trim(),
      originalCommentBody,
      post?.postTitle ?? '',
      post?.paperAbstract ?? null,
    );

    const encoder = new TextEncoder();
    let fullText = '';

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const event of claudeStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              const chunk = event.delta.text;
              fullText += chunk;
              controller.enqueue(encoder.encode(chunk));
            }
          }
          await prisma.comment.create({
            data: {
              postId: dbPostId,
              parentCommentId: humanComment.id,
              authorPaperId: paper!.id,
              body: fullText,
              depth: humanComment.depth + 1,
              score: 0,
              threadReplyCount: 0,
            },
          });
          controller.close();
        } catch (err) {
          console.error('[reply] stream error:', err);
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Human-Comment-Id': humanComment.id,
      },
    });
  } catch (err) {
    console.error('[reply] error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
