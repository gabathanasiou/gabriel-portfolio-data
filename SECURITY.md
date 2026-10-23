# Security Policy

This repository is the public data layer for `directedbygabriel.com` and
`lemonpost.studio`: an Airtable → GitHub Actions → jsDelivr pipeline. It has no
server, database or user accounts, but it does hold provider credentials in GitHub
Actions secrets and publishes static artifacts.

## Reporting a vulnerability

**Please do not open a public issue.**

Report privately through GitHub Security Advisories:
[Report a vulnerability](https://github.com/gabathanasiou/gabriel-portfolio-data/security/advisories/new).

Include:

- what is exposed or exploitable, and where (file, workflow, published URL);
- the smallest reproduction you can give;
- whether a credential may already be public (do **not** paste the credential itself —
  say which provider and when it was issued).

## Response commitment

- **Acknowledge** within 5 business days.
- **Triage and rotate** any credential that may be exposed first, then fix and republish.
- **Critical issues** (live credentials, unpublished work, injected content in a
  published artifact) are targeted for a fix within 14 days and get a short summary
  here once resolved.

## Scope

In scope:

- this repository's pipeline, workflows and generated artifacts served from the
  `data` branch;
- credential handling in `.env.local`, Actions secrets and the Cloudinary uploader.

Out of scope (please report to the appropriate project):

- the frontend at
  [`gabriel-portfolio`](https://github.com/gabathanasiou/gabriel-portfolio);
- Airtable, Cloudinary, GitHub or jsDelivr infrastructure.

## Guidance for contributors

- Never commit `.env*`, `docs/SCHEMA-FULL.local.md`, provider tokens or generated
  artifacts (they are gitignored on `main`).
- Never run `git add .` in a checkout of the `data` branch — see
  [`docs/MAINTENANCE.md`](docs/MAINTENANCE.md).
- Do not paste secrets into issues, pull requests, logs or screenshots.
- The response runbook for a lost laptop or leaked credential is
  [`docs/SECURITY-RUNBOOK.md`](docs/SECURITY-RUNBOOK.md).
