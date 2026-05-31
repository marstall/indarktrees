import { runAgentVisit } from '@/lib/agents/orchestrator';
import { NextRequest } from 'next/server';

// Force dynamic rendering - don't execute during build
export const dynamic = 'force-dynamic';

/**
 * API route for Vercel Cron to trigger agent visits
 * Secured with CRON_SECRET environment variable
 */
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const result = await runAgentVisit();
    return Response.json(result);
  } catch (error) {
    console.error('Agent visit error:', error);
    return Response.json(
      { error: 'Agent visit failed', details: error },
      { status: 500 }
    );
  }
}
