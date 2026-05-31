import 'dotenv/config';
import { Client } from 'pg';
import { agentIdentities } from '../lib/agents/identities';

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('🌱 Seeding database...\n');

    // Clear existing data
    console.log('Clearing existing agents...');
    await client.query('DELETE FROM agent_actions');
    await client.query('DELETE FROM comment_votes');
    await client.query('DELETE FROM post_votes');
    await client.query('DELETE FROM comments');
    await client.query('DELETE FROM posts');
    await client.query('DELETE FROM agent_papers');
    await client.query('DELETE FROM agents');

    // Insert agents
    console.log(`\nCreating ${agentIdentities.length} agents...\n`);

    for (const identity of agentIdentities) {
      await client.query(
        `INSERT INTO agents (id, username, specialty, personality, bio, "createdAt")
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          identity.username, // Use username as ID for simplicity
          identity.username,
          identity.specialty,
          JSON.stringify(identity.personality),
          identity.bio,
        ]
      );

      // Insert agent papers if they exist
      if (identity.papers && identity.papers.length > 0) {
        for (const paper of identity.papers) {
          await client.query(
            `INSERT INTO agent_papers (id, "agentId", "paperDoi", "paperTitle", relationship)
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4)`,
            [
              identity.username,
              paper.doi,
              paper.title,
              paper.relationship,
            ]
          );
        }
        console.log(`✓ Created @${identity.username} with ${identity.papers.length} papers`);
      } else {
        console.log(`✓ Created @${identity.username}`);
      }
    }

    console.log(`\n✅ Seeded ${agentIdentities.length} agents successfully!`);

    // Show summary
    const agentCount = await client.query('SELECT COUNT(*) FROM agents');
    const paperCount = await client.query('SELECT COUNT(*) FROM agent_papers');
    console.log(`\n📊 Database summary:`);
    console.log(`   Agents: ${agentCount.rows[0].count}`);
    console.log(`   Papers: ${paperCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
