import 'dotenv/config';

/**
 * Local development cron simulator
 * Runs agent visits in a loop with configurable interval
 * Usage: npm run cron-loop [numLoops]
 * Example: npm run cron-loop 50
 */
const TIMES_PER_SECOND_TO_RUN = 1
const INTERVAL_MS = 1000/TIMES_PER_SECOND_TO_RUN;
const CRON_SECRET = process.env.CRON_SECRET;

// Get number of loops from command line, default to 10
const NUM_LOOPS = parseInt(process.argv[2] || '10', 10);

async function triggerAgentVisit() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${new Date().toLocaleTimeString()}] Triggering agent visit...`);
  console.log('='.repeat(60));

  try {
    const response = await fetch('http://localhost:3000/api/agent-visit', {
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
      },
    });
    const result = await response.json();

    if (response.ok) {
      console.log('✅ Success:', JSON.stringify(result, null, 2));
    } else {
      console.error('❌ Failed:', result);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

async function main() {
  console.log('🤖 Starting local cron loop...');
  console.log(`   Loops: ${NUM_LOOPS}`);
  console.log(`   Interval: ${INTERVAL_MS}ms (${(INTERVAL_MS / 1000).toFixed(1)}s)`);
  console.log(`   Total time: ~${((NUM_LOOPS * INTERVAL_MS) / 1000).toFixed(1)}s`);
  console.log(`   Press Ctrl+C to stop early\n`);

  let loopCount = 0;

  // Run immediately
  await triggerAgentVisit();
  loopCount++;

  // Then run on interval until we hit NUM_LOOPS
  const interval = setInterval(async () => {
    if (loopCount >= NUM_LOOPS) {
      clearInterval(interval);
      console.log(`\n✅ Completed ${NUM_LOOPS} loops. Exiting.`);
      process.exit(0);
    }

    await triggerAgentVisit();
    loopCount++;
  }, INTERVAL_MS);
}

main();
