# Where TeamDesk is, and what's next

Updated 2026-10-31. Read this first when resuming.

## Done
- **Phase 1–2** (merged to `main`): workspaces, roles, team tasks, approvals, notifications, settings, deploy files. Plan: `plans/2026-10-31-teamdesk-foundation-and-tasks.md`. Final review done; fixes merged.
- **UI redesign** with the taste skill (`.claude/skills/design-taste-frontend`, style "Achromatic ledger", seed 444112219). Tokens in `frontend/src/styles/tokens.css`. Every new screen follows `references/app-screens.md` and passes `inspect.mjs --app` with 0 FAIL.
- **My space core** (branch `my-space`): all 10 tasks of `plans/2026-10-31-teamdesk-my-space-core.md` are complete. Backend: 137 tests. Frontend: 55 tests.

## Next, in order
1. **Final review of `my-space`** (executing-plans "Final Review"). Use a fresh reviewer on the range `main..my-space`. Fix Critical/Important findings with a failing test first, then merge `my-space` into `main`.
2. **My space step 2:** reminders and background worker, waiting-on nudges, personal notifications and email, calendar feed, installed app (PWA) with share target. Spec: `specs/2026-10-31-teamdesk-my-space-design.md` §6.5, §6.9, §6.16, §6.17, §7. Write the plan with superpowers:writing-plans, then execute it.
3. **My space step 3, AI:** spec §6.2, §6.10–6.14, §8. `backend/app/ai.py` holds every Vertex call. Config is env only: `AI_ENABLED`, `VERTEX_API_KEY`, `GEMINI_MODEL`, `EMBEDDING_MODEL`. Respect each user's `use_ai` switch.
4. **Jira, optional per workspace:** main spec §7.5 as amended by my-space spec §9. Covers Cloud and Data Center.
5. **Docs space:** main spec §7.7–7.9.

## Owner decisions to keep
- No sign-in screen yet. The env default user is `DEV_USER_*`. Company login comes later through `sign_in()`.
- Nobody can read another person's My space, admins included. Enforcement is in the app; there is no encryption at rest.
- AI may read a person's own items only when their "Use AI on my space" switch is on (the default).
- Developer tasks and tech tasks skip approval. Self-approval is always blocked (compliance).
- MongoDB 8.0.26 replica set; OpenShift; GitHub Enterprise; Microsoft Teams (Workflows webhook).
- Body text is 15px (the owner prefers larger type).

## Running locally
See `README.md`. Tests need `docker run -d -p 27018:27017 mongo:8.0`. `SESSION_SECRET` must be 32+ characters.
