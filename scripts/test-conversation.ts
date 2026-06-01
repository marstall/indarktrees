/**
 * Test script to generate a post and conversation without saving to database
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { searchPubMedWithDetails, generateSearchQuery } from '../lib/pubmed';
import { getPostPrompt, getConversationPrompt } from '../lib/agents/prompts';
import { prisma } from '../lib/prisma';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testConversation() {
  console.log('🔬 Generating test post and conversation...\n');

  // 1. Get a random agent to create the post
  const allAgents = await prisma.agent.findMany();
  const postAuthorData = allAgents[Math.floor(Math.random() * allAgents.length)];
  const postAuthor = {
    username: postAuthorData.username,
    specialty: postAuthorData.specialty,
    personality: postAuthorData.personality as any,
    bio: postAuthorData.bio,
  };
  console.log(`📝 Post Author: @${postAuthor.username} (${postAuthor.specialty})\n`);

  // 2. Search for a paper
  console.log('🔍 Searching PubMed for Kabuki syndrome papers...');
  const searchQuery = generateSearchQuery(postAuthor.specialty);
  const papers = await searchPubMedWithDetails(searchQuery, 5);

  if (papers.length === 0) {
    console.log('❌ No papers found');
    return;
  }

  const paper = papers[0];
  console.log(`📄 Found paper: ${paper.title}\n`);

  // 3. Generate the post
  console.log('✍️  Generating post...');
  const postPrompt = getPostPrompt(postAuthor, paper);

  const postResponse = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a researcher posting about an interesting paper.',
      },
      { role: 'user', content: postPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.8,
  });

  const postResult = JSON.parse(postResponse.choices[0].message.content || '{}') as {
    postTitle: string;
    postBody: string;
  };

  console.log('\n' + '='.repeat(80));
  console.log('POST');
  console.log('='.repeat(80));
  console.log(`Title: ${postResult.postTitle}`);
  console.log(`Author: @${postAuthor.username}`);
  console.log(`\n${postResult.postBody}`);
  console.log('='.repeat(80) + '\n');

  // 4. Get random agents for the conversation (excluding post author)
  const availableAgents = allAgents.filter(a => a.username !== postAuthor.username);
  const selectedAgents = availableAgents
    .sort(() => Math.random() - 0.5)
    .slice(0, 4);

  console.log('💬 Conversation participants:');
  selectedAgents.forEach(a => {
    console.log(`   - @${a.username} (${a.specialty})`);
  });
  console.log('\n');

  // 5. Generate the conversation
  console.log('🗣️  Generating conversation...\n');

  const agentIdentities = selectedAgents.map(a => ({
    username: a.username,
    specialty: a.specialty,
    personality: a.personality as any,
    bio: a.bio,
  }));

  const conversationPrompt = getConversationPrompt(
    agentIdentities,
    postResult.postTitle,
    postResult.postBody
  );

  const conversationResponse = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are orchestrating a dynamic conversation between researchers.',
      },
      { role: 'user', content: conversationPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.9,
  });

  const conversationResult = JSON.parse(conversationResponse.choices[0].message.content || '{}') as {
    comments: Array<{ username: string; comment: string }>;
  };

  // 6. Display the conversation
  console.log('='.repeat(80));
  console.log('CONVERSATION');
  console.log('='.repeat(80) + '\n');

  conversationResult.comments.forEach((comment, i) => {
    console.log(`@${comment.username}:`);
    console.log(comment.comment);
    console.log('\n' + '-'.repeat(80) + '\n');
  });

  console.log('✅ Done!\n');
}

testConversation()
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
