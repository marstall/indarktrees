/**
 * Search topics for the paper ingestion pipeline.
 * Each topic has multiple creative PubMed query variations.
 * Add or modify topics here to expand the knowledge base.
 */

export interface SearchTopic {
  name: string;
  queries: string[];
  /** If true, skip the LLM relevance check — any paper found via this topic is automatically marked relevant */
  alwaysRelevant?: boolean;
}

export const SEARCH_TOPICS: SearchTopic[] = [
  {
    name: 'kmt2d',
    queries: [
      'KMT2D',
    ],
  },
  {
    name: 'kdm6a',
    queries: [
      'KDM6A',
    ],
  },
  {
    name: 'hdac inhibitors',
    queries: [
      'HDAC inhibitor brain cognition',
      'HDAC inhibitor neurodevelopment learning',
      'histone deacetylase inhibitor memory intellectual disability',
      'vorinostat brain epigenetics',
    ],
  },
  {
    name: 'hippocampus',
    queries: [
      'hippocampus spatial learning epigenetics',
      'hippocampus epigenetics memory gene expression',
      'hippocampus synaptic plasticity chromatin',
    ],
  },
  {
    name: 'spatial reasoning',
    alwaysRelevant: true,
    queries: [
      'spatial reasoning hippocampus brain',
      'spatial learning hippocampus memory',
      'grid cells',
      'place cells',
      'epigenetic regulation memory brain',
    ],
  },
  {
    name: 'social learning',
    alwaysRelevant: true,
    queries: [
      'social learning brain neuroscience',
      'social cognition neurodevelopment',
    ],
  },
  {
    name: 'superenhancer',
    alwaysRelevant: true,
    queries: [
      'superenhancer',
      'super-enhancer',
      'enhancer regulation neurodevelopment brain',
    ],
  },
  {
    name: 'environmental enrichment',
    queries: [
      'environmental enrichment brain cognition',
      'environmental enrichment epigenetics gene expression',
      'enriched environment synaptic plasticity learning',
    ],
  },
  {
    name: 'creb',
    queries: [
      'CREB hippocampus memory consolidation',
      'CREB synaptic plasticity long-term potentiation',
      'PDE4 cognition hippocampus brain',
    ],
  },
  {
    name: 'h3k4',
    queries: [
      'H3K4me3 brain neuron gene regulation',
      'H3K4me1 enhancer neurodevelopment',
      'H3K4 methylation brain development',
    ],
  },
  {
    name: 'h3k4 methylation',
    queries: [
      'H3K4 methylation neurodevelopment intellectual disability',
      'chromatinopathy',
      'enhanceropathy',
      'superenhancer brain development',
    ],
  },
  {
    name: 'enhancer priming',
    queries: [
      'enhancer priming chromatin accessibility poised',
      'latent enhancer H3K4me1 activation development',
      'super enhancer transcription factor brain KMT2D',
      'cis-regulatory element activation developmental gene regulation',
    ],
  },
  {
    name: 'gene regulation',
    queries: [
      'gene regulation chromatin remodeling neurodevelopment epigenetics',
      'transcription factor enhancer intellectual disability brain',
      'epigenetic gene regulation synaptic plasticity cognition',
      'non-coding RNA enhancer gene expression neuron',
    ],
  },
];
