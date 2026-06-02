/**
 * Test script to generate a post and conversation without saving to database
 */

import 'dotenv/config';
import OpenAI from 'openai';
import { searchPubMedWithDetails, generateSearchQuery } from '../lib/pubmed';
import { getPostPrompt, getRelevanceCheckPrompt, getMrExplainerPrompt, getSpecialistsPrompt, getTheConnectorPrompt, getAcidTripperPrompt } from '../lib/agents/prompts';
import { prisma } from '../lib/prisma';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testConversation() {
  console.log('🔬 Generating test post and conversation...\n');

  // 1. Get all agents
  const allAgents = await prisma.agent.findMany();

  // 2. Loop until we find a relevant post (max 5 attempts)
  let postAuthor: any = null;
  let postResult: { postTitle: string; postBody: string } | null = null;
  let paper: any = null;
  let attemptsCount = 0;
  const maxAttempts = 5;

  while (attemptsCount < maxAttempts) {
    attemptsCount++;

    const postAuthorData = allAgents[Math.floor(Math.random() * allAgents.length)];
    postAuthor = {
      username: postAuthorData.username,
      specialty: postAuthorData.specialty,
      personality: postAuthorData.personality as any,
      bio: postAuthorData.bio,
    };

    console.log(`\n📝 Attempt ${attemptsCount}: @${postAuthor.username} (${postAuthor.specialty})`);

    // Search for a paper
    const searchQuery = generateSearchQuery(postAuthor.specialty);
    const papers = await searchPubMedWithDetails(searchQuery, 5);

    if (papers.length === 0) {
      console.log('   ⚠️  No papers found, trying again...');
      continue;
    }

    paper = papers[Math.floor(Math.random() * papers.length)];
    console.log(`   📄 Paper: "${paper.title}"`);

    // Generate the post
    const postPrompt = getPostPrompt(postAuthor, paper);
    const postResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a researcher posting about an interesting paper.' },
        { role: 'user', content: postPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
    });

    postResult = JSON.parse(postResponse.choices[0].message.content || '{}') as {
      postTitle: string;
      postBody: string;
    };

    // Relevance check by a random reviewer
    const reviewer = allAgents.filter(a => a.username !== postAuthor.username)
      [Math.floor(Math.random() * (allAgents.length - 1))];
    const reviewerIdentity = {
      username: reviewer.username,
      specialty: reviewer.specialty,
      personality: reviewer.personality as any,
      bio: reviewer.bio,
    };

    console.log(`   🔍 @${reviewer.username} reviewing...`);
    const relevancePrompt = getRelevanceCheckPrompt(reviewerIdentity, postResult.postTitle, postResult.postBody);
    const relevanceResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are evaluating whether a post is relevant to Kabuki syndrome research.' },
        { role: 'user', content: relevancePrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const relevanceResult = JSON.parse(relevanceResponse.choices[0].message.content || '{}') as {
      isRelevant: boolean;
      reasoning: string;
    };

    console.log(`   ${relevanceResult.isRelevant ? '✅' : '❌'} ${relevanceResult.reasoning}`);

    if (relevanceResult.isRelevant) {
      console.log(`\n✅ Found relevant post after ${attemptsCount} attempt(s)!`);
      break;
    }

    postResult = null;
  }

  if (!postResult || !postAuthor || !paper) {
    console.log(`\n❌ Failed to find relevant post after ${maxAttempts} attempts`);
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('POST');
  console.log('='.repeat(80));
  console.log(`Title: ${postResult.postTitle}`);
  console.log(`Author: @${postAuthor.username}`);
  console.log(`\n${postResult.postBody}`);
  console.log('='.repeat(80) + '\n');

  const abstract = paper.abstract ?? null;
  const priorComments: Array<{ username: string; comment: string }> = [];

  function printComment(username: string, comment: string) {
    console.log(`\n@${username}:`);
    console.log(comment);
    console.log('\n' + '-'.repeat(80));
  }

  // 4. Step 1: MrExplainer
  console.log('\n' + '='.repeat(80));
  console.log('📖 STEP 1: MrExplainer');
  console.log('='.repeat(80));
  const explainerRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: getMrExplainerPrompt(postResult.postTitle, postResult.postBody, abstract) }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const explainerResult = JSON.parse(explainerRes.choices[0].message.content || '{}') as { comment: string };
  printComment('MrExplainer', explainerResult.comment);
  priorComments.push({ username: 'MrExplainer', comment: explainerResult.comment });

  // 5. Step 2: Four specialists
  console.log('\n' + '='.repeat(80));
  console.log('🔬 STEP 2: NeuroscienceLady, GeneticsPerson, TheClinician, EnvironmentalEnhancementGuy');
  console.log('='.repeat(80));
  const specialistsRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: getSpecialistsPrompt(postResult.postTitle, postResult.postBody, abstract, explainerResult.comment) }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const specialistsResult = JSON.parse(specialistsRes.choices[0].message.content || '{}') as {
    comments: Array<{ username: string; comment: string }>;
  };
  for (const c of specialistsResult.comments) {
    printComment(c.username, c.comment);
    priorComments.push(c);
  }

  // 6. Step 3: TheConnector
  console.log('\n' + '='.repeat(80));
  console.log('🔗 STEP 3: TheConnector');
  console.log('='.repeat(80));
  const connectorRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: getTheConnectorPrompt(postResult.postTitle, postResult.postBody, abstract, priorComments) }],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });
  const connectorResult = JSON.parse(connectorRes.choices[0].message.content || '{}') as { comment: string };
  printComment('TheConnector', connectorResult.comment);
  priorComments.push({ username: 'TheConnector', comment: connectorResult.comment });

  // 7. Step 4: AcidTripper
  console.log('\n' + '='.repeat(80));
  console.log('🌀 STEP 4: AcidTripper');
  console.log('='.repeat(80));
  const acidRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: getAcidTripperPrompt(postResult.postTitle, postResult.postBody, abstract, priorComments) }],
    response_format: { type: 'json_object' },
    temperature: 0.9,
  });
  const acidResult = JSON.parse(acidRes.choices[0].message.content || '{}') as { comment: string };
  printComment('AcidTripper', acidResult.comment);

  console.log('\n✅ Done!\n');
}

testConversation()
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
