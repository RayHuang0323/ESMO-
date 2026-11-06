# GitHub Pages deployments for RayHuang0323/ESMO- never progress; actions/deploy-pages times out after 10 minutes (3 consecutive attempts, other repositories unaffected)

Prepared 2026-11-07 (all times UTC). Facts below were read from GitHub's public REST API and from our own repository. Items marked **[not verified]** could not be confirmed from outside because the job logs and the Pages settings/deployment endpoints require an authenticated token.

## Summary

For one commit (`7d59dab5e408ef275b11b8fe727427bb3b406d55`) the `deploy` job of our GitHub Pages workflow created a Pages deployment successfully, then waited the full 10 minutes without the deployment ever completing, and failed with `Timeout reached, aborting!`. This happened three times in a row, including after a full re-run that built a brand new artifact. The same workflow deployed the previous commit in 17 seconds about 70 minutes earlier. The live site is unaffected (it keeps serving the previous successful deployment), but we can no longer publish.

## Affected resources

| Item | Value |
|---|---|
| Repository | `RayHuang0323/ESMO-` (public) |
| Site | https://rayhuang0323.github.io/ESMO-/ |
| Workflow | `.github/workflows/deploy.yml`, "Deploy Vite site to GitHub Pages" (build job + deploy job, `environment: github-pages`, `concurrency: group: pages`) |
| Action | `actions/deploy-pages@v4` (runner log warns it is forced onto Node 24), `actions/upload-pages-artifact@v3`, `actions/configure-pages@v5` |
| Failing commit | `7d59dab5e408ef275b11b8fe727427bb3b406d55` (documentation and a test script only; no change to anything the site build reads) |
| Last good commit | `7b70cda9d57a2ebdfd33e216fc01421b2baa3abc` |
| Actions run | `42286568680` (run #300), attempts 1, 2, 3 |

## Timeline

(Deployment IDs below are from the repository Deployments API, `environment=github-pages`. The Pages-side deployment IDs are in the job log, see the last section.)

| Time (UTC) | Event | IDs |
|---|---|---|
| 19:05:14–19:05:35 | **Good reference.** Run `42276375532` (commit `7b70cda9`). Deploy job 19:05:17–19:05:34. Deployment statuses: waiting → queued → in_progress (19:05:18) → **success (19:05:35)**. The previous deployment became `inactive` normally. | deployment `7608490334`, artifact `13532394043` (102.53 MB) |
| 20:14:00–20:14:57 | Run `42286568680` attempt 1, build job succeeds. | artifact `13537462819` (102.53 MB) |
| 20:14:58–20:25:14 | Attempt 1, deploy job 20:15:01–20:25:12. Deployment statuses: waiting → queued → in_progress (20:15:02) → **failure (20:25:14)**. Job annotation: `Timeout reached, aborting!` (log lines 251 and 252). | deployment `7609855446` |
| 20:31:34–20:41:46 | Attempt 2 ("Re-run failed jobs", reuses the same artifact). Same sequence, **failure (20:41:46)**. | deployment `7610176504` |
| 21:02:48–21:13:46 | Attempt 3 ("Re-run all jobs": new build, **new artifact** `13539164903`, 102.53 MB). Deploy job 21:03:39–21:13:45. Same sequence, **failure (21:13:46)**. | deployment `7610771232` |

All three attempts used the same commit SHA. The repo owner reports from the job log that the action creates the deployment successfully and then keeps receiving an empty `Current status` until the 10-minute timeout **[not verified from outside]**.

## What we have ruled out

1. **Workflow / configuration change.** `deploy.yml` was last changed on 2026-09-11. The 11 most recent runs before this incident (run numbers #289–#299, 2026-10-07 through 19:05 today) all succeeded. The failure happens after the Pages deployment is created, while the action polls for completion (the repo owner reports the action logs a successful creation; **[not verified from outside]**), so permissions and OIDC are not the problem.
2. **Concurrent runs.** No other run was queued or in progress for this repository during the three attempts, and no run was cancelled.
3. **Artifact size or content.** All three artifacts are 102.53 MB (site: 581 files, 129 MB uncompressed), the same size as the artifact that deployed in 17 seconds at 19:05. The build inputs of the failing commit are identical to the last good commit (0 changed files under `src/`, `public/`, `index.html`, build config or `package*.json`). Four earlier pushes whose build inputs were also identical to their predecessor deployed successfully. A freshly built artifact (attempt 3) fails the same way, so a corrupt artifact is very unlikely.
4. **A platform-wide Pages outage.** https://www.githubstatus.com showed Pages and Actions as operational throughout, with no incident after 2026-11-05T23:36Z. Other public repositories using the Actions-based Pages deployment completed normally in the same window (deployment status timestamps from the public Deployments API, `success` in about 10–30 seconds):
   - `Obscuretone/obscuretone.github.io`: created 20:17:55 → success 20:18:07; created 20:24:52 → success 20:25:06
   - `CapitolTrace/govwatch-status`: created 20:21:08 → success 20:21:40
   - `morogoderrick-cmd/Vault`: created 21:08:43 → success 21:09:05 (inside our attempt 3)

   So the problem appears specific to this repository's Pages site, not to the service as a whole.

## Hypotheses (not confirmed)

- **A deployment for this repository/site is wedged on the Pages side** and the later deployments are queued behind it or attached to it. The pattern we see (deployment created, status never advances, action times out) matches the open issue https://github.com/actions/deploy-pages/issues/406 .
- **Deployments may be keyed by commit SHA (`pages_build_version`).** All three attempts used the same SHA, so re-running cannot tell "stuck deployment for this version" from "stuck site". A previous incident on this repository (August 2026, same 10-minute timeout) was resolved by pushing a new commit. We have not been able to confirm this against the backend.

## What we are asking GitHub Support to do

1. Check the backend state of GitHub Pages deployments for `RayHuang0323/ESMO-` and tell us whether any deployment (candidates: `7609855446`, `7610176504`, `7610771232`, or the Pages deployment IDs shown in the job log) is still queued or in progress.
2. If so, cancel or clear it, and confirm whether a deployment can be keyed or blocked by the repeated commit SHA.
3. Tell us the root cause, and whether anything on the repository's Pages site (Settings → Pages source, environment `github-pages`) needs to be reset on our side.

## Update 2026-11-06 21:27 UTC: deployments work again for a new commit SHA

We did not change the workflow, the environment or the deployment method. We pushed one documentation-only commit with a new SHA (`28023019b46342b943c34977e8df0d855db8928c`). Run `42296608521` (#301) succeeded in 1 min 18 s and the site's `Last-Modified` moved from `Fri, 06 Nov 2026 19:05:30 GMT` to `Fri, 06 Nov 2026 21:26:41 GMT`. Smoke checks on the live site pass.

This does **not** tell us the root cause: either the three attempts for `7d59dab5` were tied to one stuck deployment/version, or the site's Pages backend stalled for roughly 70 minutes and then recovered. **We are not asking Support to act unless this recurs**; this report is kept so it can be sent, with the job-log lines described below, if it does.

## Current impact and our mitigation (at the time of writing, before the update above)

The site was healthy and served the previous successful deployment (`7608490334`, commit `7b70cda9`; `Last-Modified: Fri, 06 Nov 2026 19:05:30 GMT`). We did not change the workflow, the environment, or the deployment method while this was investigated.

## Evidence files (public API snapshots, kept outside the repository)

`C:\Users\ifikn\esmo-measure\bp9-p0b-release-20261107\pages-incident\` — Actions run/jobs/annotations for attempts 1–3, deployment status sequences, artifact metadata, githubstatus.com snapshots, and the other-repository deployment samples above.

## Still needed from the repository owner before sending

Paste the raw job log lines of the failing `Deploy` step (roughly the first 30 lines, including `Creating Pages deployment with payload` and `Created deployment for ... ID: ...`, and the last 15 lines). They contain the Pages deployment ID and the exact `Current status:` strings. Do not include any tokens.
