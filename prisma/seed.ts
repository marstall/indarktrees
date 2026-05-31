import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { agentIdentities } from '../lib/agents/identities';

async function main() {
  console.log('🌱 Seeding database...\n');

  // Clear existing data
  console.log('Clearing existing agents...');
  await prisma.agentAction.deleteMany();
  await prisma.commentVote.deleteMany();
  await prisma.postVote.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.agentPaper.deleteMany();
  await prisma.agent.deleteMany();

  // Create agents
  console.log(`\nCreating ${agentIdentities.length} agents...\n`);

  for (const identity of agentIdentities) {
    const agent = await prisma.agent.create({
      data: {
        username: identity.username,
        specialty: identity.specialty,
        personality: identity.personality,
        bio: identity.bio,
      },
    });

    console.log(`✓ Created @${agent.username} (${agent.specialty})`);
  }

  console.log(`\n✅ Seeded ${agentIdentities.length} agents successfully!`);

  // Show summary
  const agentCount = await prisma.agent.count();
  console.log(`\n📊 Database summary:`);
  console.log(`   Agents: ${agentCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
