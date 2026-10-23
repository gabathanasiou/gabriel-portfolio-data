# Security Runbook — leaked credential or lost laptop

> **Read this when** a credential may have leaked (lost/stolen laptop, accidental
> commit, pasted token, suspicious Actions run). **Status:** current. Rotate first,
> investigate second — a rotated key makes the rest of the checklist low-risk.

## 1. Contain (first 10 minutes)

- **Lost/stolen laptop:** sign out of GitHub sessions (Settings → Sessions → revoke),
  then rotate everything in step 2. A stolen disk also means the local `.env.local`
  and any git objects on it are compromised.
- **Token pasted/committed:** delete the message or commit if you can, but assume it
  is already copied. Rotation is the fix, not deletion.
- **Suspicious Actions run:** disable the workflow (Actions → the workflow → ⋯ →
  Disable) until you have rotated and reviewed the run log.

## 2. Rotate

| Credential | Where | Notes |
|---|---|---|
| Airtable PAT | airtable.com → Developer hub → Personal access tokens | Create the new token scoped to the base with **read-only** access, delete the old one |
| Cloudinary API key/secret | Cloudinary console → Settings → API Keys | Generate the new pair, delete the old; scope the key to upload if the plan supports it |
| GitHub token / SSH key | github.com → Settings → Developer settings | Revoke old tokens/keys, issue new ones; check Settings → Sessions |
| `SYNC_ALERT_WEBHOOK` | Slack/other | Re-create the webhook URL if it appeared in logs |

## 3. Update the places that hold them

- **GitHub Actions secrets** (Settings → Secrets and variables → Actions):
  `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` (unchanged), `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, optionally `SYNC_ALERT_WEBHOOK`.
  Via CLI: `gh secret set CLOUDINARY_API_SECRET --repo gabathanasiou/gabriel-portfolio-data`.
- **Local `.env.local`**: update it, then `chmod 600 .env.local`. Never leave a copy
  in a checkout used for `data` publishes; keep it in Keychain/1Password if you can.
- **Stashes**: `git stash list` must not contain a `.env*` copy. If one does,
  `git stash drop <ref>`, then optionally `git gc --prune=now` to remove the object
  from disk.

## 4. Check exposure

```bash
# No .env anywhere in any ref (local + remote-tracking)
for ref in $(git for-each-ref --format='%(refname)'); do
  git ls-tree -r --name-only "$ref" | grep -E '(^|/)\.env' && echo "  ^ $ref"
done

# GitHub secret scanning has no open alerts
gh api repos/gabathanasiou/gabriel-portfolio-data/secret-scanning/alerts

# Nothing secret was ever committed in content (run on a full clone)
git log --all -p -S 'CLOUDINARY_API_SECRET' --oneline | head
```

If a secret *is* in a commit: rotate it first, then decide with roadmap item #13
whether a history rewrite is worth it. The published `data` branch is append-only;
the last good snapshot is a `data-*` tag.

## 5. Verify and close out

1. Run the sync workflow (**Actions → Sync Data & Static Files → Run workflow**).
2. Confirm it published: a new `data-*` tag, fresh `lastUpdated`, the site loads.
3. Confirm the old credential is dead: a request with the old key must be rejected.
4. Record the incident (date, credential, blast radius, fix) in the repo issue or
   roadmap item so the next rotation is routine.
