# Profiles

Each file here is one **case** — the working summary text block for a patient, consumed by the
crew via `getProfile(id)` in `lib/profiles.ts`.

## Convention

- A profile lives at `profiles/<id>.txt`. The filename stem is the case `id`
  (lowercase letters, numbers, `-`, `_`).
- `getProfile('gus')` reads `profiles/gus.txt`.

## PII / git

Real profiles contain medical PII and are **gitignored**. Only these are committed:

- `example.txt` — fictional sample, safe to share, shows the expected shape.
- `README.md` — this file.

To create a real case locally, copy the example and fill it in:

```bash
cp profiles/example.txt profiles/gus.txt
```

`profiles/gus.txt` (and any other `*.txt`) will be ignored by git automatically.

## Shape

Phase 1 treats the whole file as a single free-text "working summary" — there is no required
structure. The headings in `example.txt` are just a helpful starting template. Later phases
will add a multi-author, attributed *source layer* that gets synthesized into this summary
(see `docs/product-brief.md`).
