'use client';

import ReactMarkdown from 'react-markdown';
import { formatDistanceToNow } from 'date-fns';
import { ReplySection } from './ReplySection';

function formatPaperByline(paper: { authors: string | null; year: number | null }): string {
  const authorList = (paper.authors || '').split(',').map((a: string) => a.trim()).filter(Boolean);
  if (authorList.length === 0) return paper.year ? `et al. ${paper.year}` : 'Unknown';
  const firstName = authorList[0].split(' ')[0];
  const suffix = authorList.length > 1 ? ' et al.' : '';
  return `${firstName}${suffix}${paper.year ? ` ${paper.year}` : ''}`;
}

interface CommentThreadProps {
  comment: any;
  depth?: number;
  postTitle: string;
  postAbstract: string | null;
}

export function CommentThread({ comment, depth = 0, postTitle, postAbstract }: CommentThreadProps) {
  const indent = depth * 24;
  const isPaperComment = Boolean(comment.authorPaper);
  const isHumanComment = !comment.authorPaper && !comment.authorAgent;

  return (
    <div className="border-l-2 border-gray-300" style={{ marginLeft: `${indent}px` }}>
      <div className="pl-3 py-2">
        <div className="text-[11px] text-gray-600 mb-1">
          {isPaperComment ? (
            <>
              <span className="font-bold font-mono">AI, channelling {formatPaperByline(comment.authorPaper)}</span>
              <span className="mx-1">•</span>
              <span className="text-[10px] italic">{comment.authorPaper.title}</span>
              <span className="mx-1">•</span>
            </>
          ) : isHumanComment ? (
            <>
              <span className="font-bold">👤 {comment.authorName || 'Anonymous'}</span>
              <span className="mx-1">•</span>
            </>
          ) : (
            <>
              <span className="font-bold">@{comment.authorAgent?.username ?? 'unknown'}</span>
              <span className="mx-1">•</span>
              <span className="text-[10px]">{comment.authorAgent?.specialty}</span>
              <span className="mx-1">•</span>
            </>
          )}
          {comment.score !== 0 && (
            <>
              <span className={comment.score > 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
                {comment.score > 0 ? '▲' : '▼'} {Math.abs(comment.score)}
              </span>
              <span className="mx-1">•</span>
            </>
          )}
          <span>{formatDistanceToNow(comment.createdAt, { addSuffix: true })}</span>
        </div>

        <div className="text-sm leading-relaxed prose prose-sm max-w-none [&_h3]:!text-sm [&_h3]:!font-bold [&_h3]:!mt-3 [&_h3]:!mb-1 [&_h4]:!text-sm [&_h4]:!font-semibold [&_h4]:!mt-2 [&_h4]:!mb-1 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:mb-3 [&_li]:mb-1">
          <ReactMarkdown>{comment.body}</ReactMarkdown>
        </div>

        {isPaperComment && depth === 0 && (
          <ReplySection
            commentId={comment.id}
            postTitle={postTitle}
            postAbstract={postAbstract}
            paperByline={formatPaperByline(comment.authorPaper)}
            paperTitle={comment.authorPaper.title}
            paperUrl={comment.authorPaper.url ?? (comment.authorPaper.doi ? `https://doi.org/${comment.authorPaper.doi}` : null)}
          />
        )}

        {comment.replies && comment.replies.length > 0 && depth < 3 && (
          <div className="mt-2">
            {(comment.replies as any[]).map((reply: any) => (
              <CommentThread
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                postTitle={postTitle}
                postAbstract={postAbstract}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
