/**
 * Patient profile accessor.
 *
 * Phase 1 of the "Your Case, Your Crew" direction (see docs/product-brief.md).
 *
 * This is the "narrow waist" of the whole system: everything downstream consumes a single
 * `summaryText` block and nothing else. Today that text comes from a static file in
 * `/profiles`; later it can come from a database / synthesized multi-author source layer
 * without any change to consumers. ALL profile reads must go through `getProfile()` so that
 * swapping the backend later touches exactly one place.
 *
 * PII NOTE: real profiles are gitignored (`/profiles/*` except `example.txt`). Only the
 * committed `example.txt` contains fake data safe for the repo.
 */

import { promises as fs } from 'fs';
import path from 'path';

export interface Profile {
  /** Stable identifier / slug for the case (also the filename stem). */
  id: string;
  /** The distilled "working summary" text block the crew consumes. */
  summaryText: string;
}

const PROFILES_DIR = path.join(process.cwd(), 'profiles');

/** Profile ids are filename-safe slugs — guards against path traversal. */
const VALID_ID = /^[a-z0-9_-]+$/i;

export class ProfileNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`No profile found for "${id}" (expected profiles/${id}.txt)`);
    this.name = 'ProfileNotFoundError';
  }
}

/**
 * Load a patient profile by id.
 *
 * @throws {Error} if the id is not a valid slug
 * @throws {ProfileNotFoundError} if no matching profile file exists
 */
export async function getProfile(id: string): Promise<Profile> {
  if (!VALID_ID.test(id)) {
    throw new Error(`Invalid profile id "${id}" — must match ${VALID_ID}`);
  }

  const filePath = path.join(PROFILES_DIR, `${id}.txt`);

  let summaryText: string;
  try {
    summaryText = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ProfileNotFoundError(id);
    }
    throw err;
  }

  return { id, summaryText: summaryText.trim() };
}
