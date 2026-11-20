# SecNess Bench

The benchmark every SecNess change is measured against (plan section 0.2). Each app is a small,
realistic, AI-generated application with known planted vulnerabilities and a machine-checked
ground truth.

```
bench/
  apps/<NN-name>/
    prompt.md        # the exact generation prompt
    expected.yaml    # ground truth (schema: expected.schema.json)
    source/          # the app
  prompts/           # prompts for apps not yet generated
  public/            # public intentionally vulnerable apps, for comparison
  run.ts             # validate + run + score
```

## Commands

```sh
pnpm bench:validate                       # check every expected.yaml against its source
pnpm bench -- --scanner "secness scan --full --json --repo {repo}"
pnpm bench -- --findings results-dir/     # score saved scanner output (<app-id>.json each)
pnpm bench -- --scanner "..." --baseline bench/baseline.json   # fail on a >3 point drop
```

The scanner prints `{ "findings": Finding[], "first_finding_ms"?: number }` to stdout, where each
finding is a v1 `Finding` (validated). Exit code 0 or 1 (gate failed) both count as a completed scan.

## Scoring

A finding matches a planted vulnerability when its CWE is accepted for that class
(`src/classes.ts`) **and** either its endpoint matches (parameter styles normalised) or it is in the
same file within 5 lines of the planted range. Each planted vuln is matched once, by the most
confident finding. Further findings for the same vuln are duplicates: real, but no extra recall.
Findings matching `known_extras` (real, unplanted bugs) also count as real.

- **recall**: planted vulns found / planted vulns
- **precision (proven)**: proven findings that are real / proven findings. Stage 1 target: 90%.
- **time to first finding** (median) and **total run time**

## Protocol for adding an app

1. Generate the app with the named harness from its prompt, unedited. Record harness, model and date.
2. Make sure it builds and starts with `docker compose up`. Fix only what blocks that, and note it.
3. Commit the app as generated: this is the `clean_commit`.
4. Seed vulnerabilities in a **separate commit**, in the style the generator would plausibly write.
   No comments, names or markers that hint at the bug: the scanner (and its LLM) read this code.
5. Write `expected.yaml`. Every entry needs exact `lines` and a `snippet` found within them.
6. Run `pnpm bench:validate` and add any real bug the generator wrote on its own to `known_extras`.

## Status and plan

`01-teamtodo` is complete (13 vulns). The Stage 0 target is at least 10 apps and 60 planted
vulnerabilities covering all 14 classes. Planned seeding for the remaining apps:

| App             | Generator   | Stack                    | Planned classes                                                                                                        |
| --------------- | ----------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 02-invoicer     | codex       | Fastify, Postgres        | sqli, bola, jwt-misconfig (alg none), mass-assignment, verbose-errors, business-logic (negative quantity)              |
| 03-recipebox    | claude-code | Express, MongoDB, React  | nosqli (login operator), nosqli ($where search), stored-xss, bola, path-traversal, hardcoded-secret                    |
| 04-helpdesk     | codex       | Express, Postgres, React | bfla, ssrf (webhook), cors-misconfig, missing-rate-limit, sqli (ORDER BY), vulnerable-dependency                       |
| 05-bookit       | claude-code | Fastify, Postgres, React | bola, mass-assignment, business-logic (skip checkout), jwt-misconfig (weak secret), verbose-errors, missing-rate-limit |
| 06-dropzone     | codex       | Express, Postgres        | path-traversal (download), path-traversal (upload name), ssrf (URL import), bfla, hardcoded-secret, stored-xss (SVG)   |
| 07-pipeline-crm | claude-code | Express, Prisma, React   | sqli ($queryRawUnsafe), bola, mass-assignment, cors-misconfig, vulnerable-dependency, bfla                             |
| 08-inkwell      | codex       | Express, Postgres        | stored-xss, bfla, jwt-misconfig (alg none), missing-rate-limit, verbose-errors, hardcoded-secret                       |
| 09-bazaar       | claude-code | Fastify, Postgres, React | business-logic (price tampering), business-logic (coupon reuse race), bola, sqli, ssrf, mass-assignment                |
| 10-huddle       | codex       | Express, MongoDB, React  | nosqli, bola (cross-workspace), stored-xss, cors-misconfig, path-traversal, jwt-misconfig                              |

That plan adds 54, for 67 in total, with every class covered at least twice and 5 business-logic
flaws ready for Stage 2.

Public comparison apps (`public/`): OWASP Juice Shop and crAPI. Pin exact image digests and write
their expected lists from each project's official challenge or vulnerability documentation.
