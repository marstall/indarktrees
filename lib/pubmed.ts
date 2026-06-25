/**
 * PubMed API integration using NCBI E-utilities
 * Docs: https://www.ncbi.nlm.nih.gov/books/NBK25501/
 */

export interface PubMedPaper {
  pmid: string;
  doi?: string;
  title: string;
  abstract?: string;
  authors: string[];
  journal?: string;
  pubDate?: string;
  url: string;
}

interface ESearchResult {
  esearchresult: {
    idlist: string[];
    count: string;
  };
}

interface PubMedArticle {
  MedlineCitation: {
    PMID: { _: string };
    Article: {
      ArticleTitle: string;
      Abstract?: {
        AbstractText: string | string[];
      };
      AuthorList?: {
        Author: Array<{
          LastName?: string;
          ForeName?: string;
          CollectiveName?: string;
        }>;
      };
      Journal?: {
        Title?: string;
      };
      ArticleDate?: Array<{
        Year: string;
        Month: string;
        Day: string;
      }>;
    };
  };
  PubmedData?: {
    ArticleIdList?: {
      ArticleId: Array<{
        _: string;
        $: { IdType: string };
      }>;
    };
  };
}

interface EFetchResult {
  PubmedArticleSet: {
    PubmedArticle: PubMedArticle[];
  };
}

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// Rate limiting: NCBI allows 3 requests/second without API key
// Being conservative with 500ms to avoid 429 errors
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // ms

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  
  lastRequestTime = Date.now();
}

/**
 * Search PubMed for papers matching a query
 */
export async function searchPubMed(
  query: string,
  maxResults: number = 10,
  mindate?: string, // 'YYYY/MM/DD'
): Promise<string[]> {
  await rateLimit();
  
  const params = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmax: maxResults.toString(),
    retmode: 'json',
    sort: 'date',
    ...(mindate ? { mindate, datetype: 'edat' } : {}),
  });

  const response = await fetch(`${BASE_URL}/esearch.fcgi?${params}`);

  if (!response.ok) {
    throw new Error(`PubMed search failed: ${response.statusText}`);
  }

  const data = (await response.json()) as ESearchResult;
  return data.esearchresult.idlist || [];
}

/**
 * Fetch paper details by PMID
 */
export async function fetchPaperDetails(pmids: string[]): Promise<PubMedPaper[]> {
  if (pmids.length === 0) return [];

  await rateLimit();
  
  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
  });

  const response = await fetch(`${BASE_URL}/efetch.fcgi?${params}`);

  if (!response.ok) {
    throw new Error(`PubMed fetch failed: ${response.statusText}`);
  }

  const xmlText = await response.text();
  return parseXMLResponse(xmlText);
}

/**
 * Parse XML response from PubMed
 * Note: This is a simplified parser. For production, consider using a proper XML parser.
 */
function parseXMLResponse(xml: string): PubMedPaper[] {
  const papers: PubMedPaper[] = [];

  // Extract each PubmedArticle
  const articleMatches = xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g);

  for (const match of articleMatches) {
    const articleXml = match[1];

    // Extract PMID
    const pmidMatch = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    const pmid = pmidMatch ? pmidMatch[1] : '';

    // Extract title
    const titleMatch = articleXml.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
    const title = titleMatch ? cleanXMLText(titleMatch[1]) : 'Untitled';

    // Extract abstract
    const abstractMatch = articleXml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
    const abstract = abstractMatch ? cleanXMLText(abstractMatch[1]) : undefined;

    // Extract DOI
    const doiMatch = articleXml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
    const doi = doiMatch ? doiMatch[1] : undefined;

    // Extract authors
    const authors: string[] = [];
    const authorMatches = articleXml.matchAll(/<Author[^>]*>([\s\S]*?)<\/Author>/g);
    for (const authorMatch of authorMatches) {
      const authorXml = authorMatch[1];
      const lastNameMatch = authorXml.match(/<LastName>([^<]+)<\/LastName>/);
      const foreNameMatch = authorXml.match(/<ForeName>([^<]+)<\/ForeName>/);
      const collectiveMatch = authorXml.match(/<CollectiveName>([^<]+)<\/CollectiveName>/);

      if (collectiveMatch) {
        authors.push(collectiveMatch[1]);
      } else if (lastNameMatch) {
        const lastName = lastNameMatch[1];
        const foreName = foreNameMatch ? foreNameMatch[1] : '';
        authors.push(foreName ? `${foreName} ${lastName}` : lastName);
      }
    }

    // Extract journal
    const journalMatch = articleXml.match(/<Title>([^<]+)<\/Title>/);
    const journal = journalMatch ? journalMatch[1] : undefined;

    // Extract publication date
    const yearMatch = articleXml.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
    const pubDate = yearMatch ? yearMatch[1] : undefined;

    papers.push({
      pmid,
      doi,
      title,
      abstract,
      authors: authors.slice(0, 10), // Limit to first 10 authors
      journal,
      pubDate,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    });
  }

  return papers;
}

/**
 * Clean XML text by removing HTML tags and decoding entities
 */
function cleanXMLText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Search for papers and return full details
 */
export async function searchPubMedWithDetails(
  query: string,
  maxResults: number = 10,
  mindate?: string,
): Promise<PubMedPaper[]> {
  const pmids = await searchPubMed(query, maxResults, mindate);

  if (pmids.length === 0) {
    return [];
  }

  return fetchPaperDetails(pmids);
}

/**
 * Generate search queries for biological research based on specialty
 */
export function generateSearchQuery(specialty: string): string {

  const specialtyKeywords: Record<string, string> = {
    'Epigenetics': 'epigenetics OR chromatin OR histone methylation',
    'Developmental Biology': 'development OR morphogenesis OR embryonic',
    'Clinical Genetics': 'clinical OR diagnosis OR phenotype',
    'Biostatistics': 'cohort OR statistical OR epidemiology',
    'Structural Biology': 'structure OR protein OR molecular',
    'Neurodevelopment': 'neurodevelopment OR cognition OR brain',
    'Genomics': 'genomics OR sequencing OR variant',
    'Immunology': 'immune OR immunology OR infection',
    'Model Organisms': 'mouse OR zebrafish OR drosophila OR model',
    'Cardiac': 'cardiac OR heart OR congenital heart',
    'Endocrinology': 'growth OR endocrine OR hormone',
    'Multi-omics': 'transcriptomics OR proteomics OR metabolomics',
    'Therapeutic': 'therapy OR treatment OR drug OR therapeutic',
    'Phenotyping': 'phenotype OR clinical features OR natural history',
    'Evolutionary': 'evolution OR comparative genomics OR conservation',
    'Bioinformatics': 'bioinformatics OR computational OR analysis',
    'Craniofacial': 'craniofacial OR facial OR neural crest',
    'Educational': 'education OR learning OR intervention OR cognitive',
    'Gene Regulation': 'gene regulation OR transcription OR enhancer',
    'Neuropsychiatry': 'memory OR learning OR CREB OR hippocampus',
    'Superenhancers': 'superenhancer OR super-enhancer OR enhancer',
    'Environmental Enrichment': 'environmental enrichment OR plasticity OR intervention',
  };

  // Find matching keywords
  for (const [key, keywords] of Object.entries(specialtyKeywords)) {
    if (specialty.toLowerCase().includes(key.toLowerCase())) {
      return keywords;
    }
  }

  // Default: broad life sciences
  return 'biology OR neuroscience OR genetics OR biomedicine';
}
