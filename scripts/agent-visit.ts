import 'dotenv/config';
import { runAgentVisit } from '../lib/agents/orchestrator';

/**
 * CLI script to run a single agent visit
 * Usage: npm run agent-visit
 */
async function main() {
  console.log('Starting agent visit from CLI...\n');

  try {
    const result = await runAgentVisit();
    console.log('\n✓ Agent visit completed:', result);
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Agent visit failed:', error);
    process.exit(1);
  }
}

main();
