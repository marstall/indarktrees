/**
 * Full-text extraction for research papers.
 * Priority order:
 *   1. Europe PMC full-text XML  (open access, clean)
 *   2. Unpaywall → legal PDF URL → pdf-parse
 *   3. HTML scrape of DOI landing page (cheerio)
 *   4. Abstract only (fallback)
 */

import * as cheerio from 'cheerio';
import * as pdfParseModule from 'pdf-parse';
const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;

export interface ExtractResult {
  text: string | null;
  source: 'europepmc' | 'pdf' | 'html' | 'abstract_only';
}

const DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function safeFetch(url: string, options?: RequestInit): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; InDarkTreesBot/1.0; mailto:research@indarktrees.app)',
        ...options?.headers,
      },
      signal: AbortSignal.timeout(15000),
      ...options,
    });
    return res;
  } catch {
    return null;
  }
}

/**
 * Try Europe PMC full-text XML for a PubMed article (PMID).
 * Returns clean plain text if available.
 */
export async function tryEuropePMC(pmid: string): Promise<string | null> {
  await sleep(DELAY_MS);
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/MED/${pmid}/fullTextXML`;
  const res = await safeFetch(url);
  if (!res || !res.ok) return null;

  const xml = await res.text();
  if (!xml.includes('<body')) return null;

  // Extract body text, stripping XML tags
  const bodyMatch = xml.match(/<body[\s\S]*?>([\s\S]*?)<\/body>/);
  if (!bodyMatch) return null;

  const text = bodyMatch[1]
    .replace(/<[^>]+>/g, ' ')  // strip tags
    .replace(/\s{2,}/g, ' ')   // collapse whitespace
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .trim();

  return text.length > 200 ? text : null;
}

/**
 * Use Unpaywall to find a legal free PDF URL for a DOI.
 */
async function getUnpaywallPDFUrl(doi: string): Promise<string | null> {
  await sleep(DELAY_MS);
  const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=research@indarktrees.app`;
  const res = await safeFetch(url);
  if (!res || !res.ok) return null;

  try {
    const data = await res.json() as any;
    // Prefer PDF over landing page
    const locations: any[] = data.oa_locations || [];
    const pdfLocation = locations.find((l: any) => l.url_for_pdf);
    if (pdfLocation?.url_for_pdf) return pdfLocation.url_for_pdf;

    const best = data.best_oa_location;
    if (best?.url_for_pdf) return best.url_for_pdf;
  } catch {
    return null;
  }
  return null;
}

/**
 * Download a PDF and extract plain text using pdf-parse.
 */
export async function extractFromPDF(pdfUrl: string): Promise<string | null> {
  await sleep(DELAY_MS);
  const res = await safeFetch(pdfUrl);
  if (!res || !res.ok) return null;

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('pdf') && !pdfUrl.endsWith('.pdf')) {
    return null;
  }

  try {
    const buffer = Buffer.from(await res.arrayBuffer());
    const data = await pdfParse(buffer);
    const text = data.text?.replace(/\s{2,}/g, ' ').trim();
    return text && text.length > 200 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Try to extract article body text from the HTML of a landing page.
 */
export async function extractFromHTML(pageUrl: string): Promise<string | null> {
  await sleep(DELAY_MS);
  const res = await safeFetch(pageUrl, {
    headers: { Accept: 'text/html' },
  });
  if (!res || !res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove nav, ads, footers, scripts
  $('nav, header, footer, script, style, aside, .references, #references, .citation, figure, figcaption').remove();

  // Try progressively broader selectors
  const selectors = [
    'article',
    '.article-body',
    '.fulltext',
    '#full-text',
    '.paper-body',
    '.main-content',
    '.content-body',
    '[data-testid="article-body"]',
    '.article__body',
    '#article',
    'main',
  ];

  for (const sel of selectors) {
    const el = $(sel);
    if (el.length) {
      const text = el.text().replace(/\s{2,}/g, ' ').trim();
      if (text.length > 500) return text;
    }
  }

  // Last resort: everything in <body>
  const bodyText = $('body').text().replace(/\s{2,}/g, ' ').trim();
  return bodyText.length > 500 ? bodyText : null;
}

/**
 * Try to find a PDF link on a landing page and extract text from it.
 */
async function extractPDFFromLandingPage(pageUrl: string): Promise<string | null> {
  await sleep(DELAY_MS);
  const res = await safeFetch(pageUrl, { headers: { Accept: 'text/html' } });
  if (!res || !res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  const pdfLinks: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.toLowerCase().includes('pdf') || $(el).text().toLowerCase().includes('pdf')) {
      const absolute = href.startsWith('http') ? href : new URL(href, pageUrl).href;
      pdfLinks.push(absolute);
    }
  });

  for (const pdfUrl of pdfLinks.slice(0, 3)) {
    const text = await extractFromPDF(pdfUrl);
    if (text) return text;
  }

  return null;
}

/**
 * Main entry point: try all extraction strategies in priority order.
 */
export async function extractFullText(
  pmid?: string | null,
  doi?: string | null,
): Promise<ExtractResult> {
  // 1. Europe PMC (best for open access)
  if (pmid) {
    const text = await tryEuropePMC(pmid);
    if (text) return { text, source: 'europepmc' };
  }

  // 2. Unpaywall → PDF
  if (doi) {
    const pdfUrl = await getUnpaywallPDFUrl(doi);
    if (pdfUrl) {
      const text = await extractFromPDF(pdfUrl);
      if (text) return { text, source: 'pdf' };
    }

    // 3. HTML scrape of DOI landing page
    const doiUrl = `https://doi.org/${doi}`;
    const htmlText = await extractFromHTML(doiUrl);
    if (htmlText) return { text: htmlText, source: 'html' };

    // 4. Look for PDF links on the landing page
    const pdfFromPage = await extractPDFFromLandingPage(doiUrl);
    if (pdfFromPage) return { text: pdfFromPage, source: 'pdf' };
  }

  return { text: null, source: 'abstract_only' };
}
