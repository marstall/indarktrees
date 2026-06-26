# Product Brief — "Your Case, Your Crew"

> A living reference for the soul and shape of this product. This is the *why* and the *what*,
> not the *how*. Technical/data design and implementation live elsewhere; this doc anchors
> tone, framing, the cast, and the open questions so the feeling stays intact as we build.

---

## The one-line soul

**A rare disease is an open case. This is the crew that never stops working yours.**

Mental tagline that started it all: *"making a scientific paper as stupid (and fun) as Reddit."*

---

## Who it's for

People living with a rare disease — and the people who love them. Rare disease has no clean
"answer." The goal is not to deliver a verdict; it's to **engage families with the science,
increase understanding, and leave them buzzing with ideas** — surfacing all the threads that
could relate to a condition in a friendly, punchy, readable way.

The patient is the center. They spend their lives being talked *about*, in the third person,
over their heads. This product speaks **to** them.

---

## The three braided values

1. **Understanding** — translate dense, paywalled, jargon-locked science into a lively,
   accessible, Reddit-style conversation anyone can follow.
2. **You're not alone** — someone is always on it. You come back and the crew has been working
   while you slept. The antidote to being alone with a diagnosis.
3. **A family engaged** — the patient's real family and extended family can each participate,
   ask questions, and contribute — feeling useful and connected, even those who can't follow
   the science.

---

## The core framing: "Case & Crew"

- Each patient profile is **a case**. An open case doesn't demand a verdict — which makes
  "no clean answer" a feature, not a failure. It reframes the whole experience as an ongoing
  investigation, honest about uncertainty.
- The people working it are **the crew** — and the crew spans two kinds of members:
  - **Synthetic crew** — Sam + a family of investigators + embodied papers/experts. Always on,
    keeps it buzzing, lowers the barrier.
  - **Real crew** — the patient's actual people (parents, grandparents, siblings, caregivers).
    They bring love, memory, lived observation, and the questions only someone who knows the
    patient would think to ask.
- The crew **cares about the person**, not just the puzzle. They're rooting for the patient.
  The warmth lives in *who* they're doing it for; the fun in *how* they work; the gravity in
  *what's at stake*.

Vocabulary this unlocks: *your case · on the case · the crew · case file · leads · "this thread
cracked something open."*

---

## The return ritual (signature feature)

The most important interaction: **you come back, and there's new news from your crew.** The
thread moved while you were away. The lights were on. This ongoing-ness is the emotional core —
it's what makes the patient and family feel they are never alone with the condition.

---

## The cast

- **You — the patient** (e.g., Gus). The center of the hearth, the reason the crew gathers.
  Not a character *in* the crew; the crew is *for* you. The one real human the experience is
  addressed to, in the second person.
- **Sam — the protagonist questioner.** A strong, warm, gender-neutral guide (name: **Sam**).
  The welcoming face who pulls you into the case file. Asks the smart-non-scientist questions.
  Has a dedicated, configurable persona/voice file.
- **The family of investigators** — a small, **fixed** cast of questioner characters, each with
  a short inline bio (<100 words), distinct interests, knowledge level, skepticism, and
  emotional register. They ask, they don't assert.
- **The embodied papers / experts** — the existing cast: papers and specialists who *answer*,
  grounded in their own findings. The crew pulls them in and grills them.
- **The real family** — actual named humans (Dad, Mom, Grandma) who participate as themselves,
  ask their own questions, and contribute to the profile.

### Synthetic vs. real
Real human contributions are **first-class and visually distinct**: "**Grandma asked…**" reads
differently from "**Sam (crew) wondered…**". Humans aren't spectators — their questions steer
the investigation just like Sam's do.

---

## Voice & the "you" question (open)

- Copy is **second person**, addressed to the patient. Marketing "you" = whoever's reading;
  inside a case, "you" = the patient, and their people show up as themselves around them.
- **Open question:** how to handle the patient who can't be the operator (an infant like Gus,
  severe intellectual disability). Leading idea: the **case always belongs to the patient**
  ("Gus's case, Gus's crew"), and the copy addresses whoever reads as an advocate. A
  profile-level **self vs. advocate** toggle could shift pronouns accordingly.

---

## The collaborative living profile

The profile is not a form — it's **a place the family gathers to describe the person they love.**

### Two layers
- **Source layer** — raw, *attributed*, multi-author contributions: medical records, uploaded
  PDFs/images/genetics reports, free-text observations, answers to onboarding questions.
  Preserved, credited, editable by the contributor. Emotional ownership lives here.
- **Working summary** — a single distilled **text block** the synthetic crew consumes,
  synthesized from the source layer. Re-distills as new contributions arrive (living document).

This is the **narrow waist**: the crew only ever consumes the summary text block, so the
*producer* side (hand-written file → multimodal ingest → DB) can evolve independently.

### Onboarding as an interview
A question-set on-ramp, **relationship- and expertise-aware**:
- *Guardian* → medical history, diagnoses, meds, test results
- *Developmental expert (e.g., a grandparent)* → learning style, temperament, what lights them up
- *Anyone* → daily life, sensory quirks, what's changed, what works

Questions can be **condition-aware** — weighted toward what's relevant to this case
(neurodevelopmental cases lean into observational tracks; others lean elsewhere).

### Contributions become leads
Family observations don't just enrich the static profile — they can **redirect the
investigation.** "He's always struggled with transitions" can become a thread the crew chases.
The contribution loop feeds the investigation loop.

### On the value of "soft" observation
The data-value of lived observation varies by condition, but:
- **Engagement value is condition-independent** — contributing fights helplessness regardless.
- Even "hard" conditions have lived dimensions (fatigue, pain, mood, sleep, treatment
  tolerance, quality of life) that research increasingly values (patient-reported outcomes).

### Care note
For engaged families this is a gift; for an overwhelmed parent at 2am it could feel like
homework. Keep it **optional, incremental, invitational** — never a wall before value. Make
contributing *feel* rewarding: contributors see their words reflected and watch the crew use them.

---

## The investigation loop

1. **Profile** — the case's working summary text block (from the collaborative profile).
2. **Keywords** — extract keywords defining the condition; tweak based on what results spark.
3. **Search** — smart PubMed searches; ingest a set of papers.
4. **Summarize** — summarize each paper **for this patient**, responding to their full context.
5. **Embodied comments** — other papers weigh in on each summary, given the patient's context.
6. **Questioner loop** — Sam + the family of investigators (and **real family members**) read
   the thread and ask follow-up questions grounded in the profile; the papers/experts reply.
   Capped at a few exchange rounds; ends on a resonant question, not a conclusion.
7. **Panel votes** — a panel upvotes/downvotes comments and papers.

Threads **end on an open question by design** — the point is to leave the reader buzzing.

---

## Questioner cast mechanics

- **Fixed characters** (recurring, so readers get to know them), each with a short inline bio
  (<100 words) shown for color. (Full profile pages + comment history: deliberately out of
  scope for now — the model leaves room to add later.)
- Reuse the existing **personality trait dials** (`AgentIdentity`). Questioner-specific axes:
  medical literacy, skepticism, what they care about, emotional register.
- **Protagonist + tunable family**: Sam is pinned high; every other character has a
  **per-profile activity level (0–5)** — 0 = silent for this case, 5 = very present. Composes
  the right "family around the hearth" for each case as data only.
- Each character has its own **configurable persona/voice file** (mirroring
  `mrexplainer-config.ts`) so voice can be retuned without touching loop logic.

---

## Architecture principles (to honor, not yet build)

- **Narrow waist:** everything downstream consumes `profileText: string` (the working summary).
- **Single accessor:** a `getProfile(id)` seam that reads a static file today, a DB later.
  Everything calls it; nothing reads the file directly.
- **Multi-participant case:** one owner (patient/guardian) who **invites** real family in —
  an explicit invite/consent model.
- **PII boundary:** profile data is real medical PII. Keep real profiles **gitignored**
  (e.g. `profiles/*.txt`) with a committed `profiles/example.txt` of fake data. Architect now
  to permit permanent, access-controlled PII storage later; never mix profile data into public
  conversation tables.
- **Two casts, shared machinery:** questioners (ask) and experts (answer) reuse the same
  identity/personality infrastructure.

---

## Phasing (suggested)

1. **Static profile + accessor** — `getProfile(id)` over a gitignored text file (start with
   Gus's, anonymized). Unblocks everything.
2. **Profile-aware summaries + embodied comments** — feed the profile into existing MrExplainer
   and paper-comment prompts.
3. **The questioner loop** — Sam + fixed family, the new heart of the product.
4. **Real human participation** — multi-participant case, invites, real-vs-synthetic
   attribution, human questions as first-class drivers.
5. **Collaborative profile-building** — onboarding interview, multi-author source layer,
   synthesis into the working summary.
6. **Panel voting** — mostly exists today.

---

## Open questions (parking lot)

- How exactly to handle the "you"/operator gap for non-self-advocating patients (self vs.
  advocate toggle?).
- Multi-participant consent & permissions model specifics.
- Loop termination: how many exchange rounds; how a thread decides it's "done."
- How the expert/voting panel is specified (reuse existing identities vs. dynamic per profile).
- Moderation/tone safeguards for emotionally charged family dynamics.
- Naming: product name that carries the "case & crew" + warmth + seriousness (not "team"/dry,
  not "family"/culty). Working frame: *"your case, your crew."*
