import { searchPubMedWithDetails, generateSearchQuery } from '../lib/pubmed';

/**
 * Test script for PubMed integration
 * Usage: npm run test-pubmed
 */
async function main() {
  console.log('🧪 Testing PubMed integration...\n');

  // Test 1: Basic search
  console.log('Test 1: Searching for hippocampal plasticity papers...');
  const query = 'hippocampal plasticity CREB';
  console.log(`Query: "${query}"\n`);

  const papers = await searchPubMedWithDetails(query, 5);

  console.log(`Found ${papers.length} papers:\n`);

  papers.forEach((paper, index) => {
    console.log(`${index + 1}. ${paper.title}`);
    console.log(`   PMID: ${paper.pmid}`);
    console.log(`   DOI: ${paper.doi || 'N/A'}`);
    console.log(`   Authors: ${paper.authors.slice(0, 3).join(', ')}${paper.authors.length > 3 ? ', et al.' : ''}`);
    console.log(`   Journal: ${paper.journal || 'N/A'}`);
    console.log(`   Year: ${paper.pubDate || 'N/A'}`);
    console.log(`   URL: ${paper.url}`);
    if (paper.abstract) {
      console.log(`   Abstract: ${paper.abstract.substring(0, 150)}...`);
    }
    console.log('');
  });

  // Test 2: Specialty-specific search
  console.log('\n---\n');
  console.log('Test 2: Specialty-specific search (Epigenetics)...');
  const specialtyQuery = generateSearchQuery('Epigenetics & Chromatin Remodeling');
  console.log(`Generated query: "${specialtyQuery}"\n`);

  const specialtyPapers = await searchPubMedWithDetails(specialtyQuery, 3);
  console.log(`Found ${specialtyPapers.length} papers:\n`);

  specialtyPapers.forEach((paper, index) => {
    console.log(`${index + 1}. ${paper.title}`);
    console.log(`   PMID: ${paper.pmid}`);
    console.log('');
  });

  console.log('✅ PubMed integration test complete!');
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
