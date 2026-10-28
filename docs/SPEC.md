# PECIT Thesis Archive System: Master Build Spec

Oct 24, 2026 · @haz


## Summary

Your two files are one spec cut in half (workflow.txt stops mid-sentence at the lifecycle section and Logic.txt picks it up), so this document treats them as a single source of truth and adds what is needed to build it on Next.js, Supabase, R2, Redis and Vercel.

Your roles, lifecycle, schema, upload pipeline, cache namespaces and screens stay as written. Where the source contradicts itself or leaves a gap, the gaps section names the fix, and the additions section covers features a thesis repository should not go live without.

Development follows seven stages (plan, design, set up, build, local QA, staging, production) and stays on your computer until the local QA gate passes; the delivery plan below shows the gates.

| Question | Decision |
| --- | --- |
| Where metadata lives | Supabase Postgres is the only source of truth. R2 holds files; Redis holds copies that can be rebuilt. |
| Who gets an account | Nobody self-registers. The admin creates every account in the Users module. |
| Student login | Email and password, with a &quot;Contact Administrator&quot; link instead of a register button. |
| Google login | Deferred. The button stays on the page but is disabled until you have PECIT Workspace access and a budget; the full design below is kept for then. |
| Route protection | Next.js 16 proxy.ts refreshes sessions; every Server Action and API route re-checks the role itself. |
| Lifecycle rules | Enforced inside Postgres (a transition function plus RLS), so no client or bug can skip a state. |
| Main additions | Group authors, advisor assignment, duplicate check, publication consent and license, bulk user import, Data Privacy Act retention, Google Scholar tags. |


## Architecture and metadata placement

Put every piece of metadata in Supabase Postgres. R2 holds only the PDF and DOCX bytes, and Redis holds only copies the system can rebuild at any time.

architecture · browser, Vercel, Supabase, Redis, R2

The browser talks to Vercel for pages and actions, Vercel talks to Supabase and Redis, and PDF bytes travel between the browser and R2 on URLs that Vercel signs.

| Data | Lives in | Why there |
| --- | --- | --- |
| Thesis record: title, abstract, status, authors, supervisor, dates, DOI, license, embargo, confidentiality | Postgres theses | A status change, its audit entry and its notification must commit together |
| File records: R2 key, size, SHA-256, version number, change notes, uploader | Postgres thesis_versions | The database stores the key, never a URL |
| Manuscript bytes (PDF, optional DOCX) | R2 private bucket, key submissions/{thesisId}/v{n}/manuscript.pdf | Large binaries stay off the database and off Vercel |
| Review checklist and page comments | Postgres theses.review_checklist, pdf_annotations | Queried together with the version they belong to |
| Search text and semantic vector | Postgres search_vector, embedding | One indexed table, no joins at search time |
| People and roles | Supabase Auth (identity) plus profiles (role, department, program) | The role in profiles is the source of truth |
| Audit trail | Postgres activity_logs, append-only | A trigger blocks update and delete |
| Branding, allowed email domains, policy links | Postgres settings, injected into the app shell at boot | Super admin edits them without a deploy |
| Search results, thesis detail JSON, facets, autocomplete | Redis, with the TTLs already in your spec | Disposable; a miss falls back to Postgres |
| Signed download URLs | Nowhere | Generated per request, never stored or cached |

Three rules keep this clean:

- Redis and R2 never hold a fact that Postgres lacks. The R2 key already encodes the thesis id and version, so the bucket can always be reconciled against the database.
- Vercel signs URLs but never carries PDF bytes; the browser uploads to and downloads from R2 directly.
- The commit step confirms the object really exists in R2 (size and type) before it creates the thesis_versions row, because the browser&apos;s report is not proof.
R2 bucket setup. Browser uploads with presigned URLs fail without a CORS policy, even when the URL is valid. Allow your Vercel domain and http://localhost:3000, methods PUT (upload) and GET (the in-page PDF viewer), and the Content-Type header, then sign each upload with exactly the content type the browser will send (Cloudflare R2 CORS). An expired presigned URL returns a 403 that browser code cannot read, so request a fresh URL whenever an upload has sat idle near the 15-minute limit.


## Login and user provisioning

Nobody registers themselves: the admin creates every account in the Users module, and people sign in with email and password. Google sign-in is designed but switched off for now.


### Login page

Keep the page from your screenshot (logo, email, password, remember me, forgot password, Sign In, Sign in with Google) with these rules:

- No register button and no /register or /signup route. The &quot;Contact Administrator&quot; link stays and can open the admin&apos;s email address stored in settings.
- Turn off &quot;Allow new users to sign up&quot; in Supabase Auth, so the API itself refuses self-signup, not only the UI.
- The &quot;Security Verification Bypassed&quot; bar looks like a CAPTCHA placeholder. Keep any bypass for local development only; in production, verify a Cloudflare Turnstile token on the server.
- Rate-limit sign-in attempts per IP and per email (Upstash Ratelimit, on the Redis you already use) and show one generic error for a wrong email or password.
- The &quot;Remember me&quot; label is dark on the blue card; make it white.
- Land each role on its page after sign-in: student /my-thesis, advisor /review-manager, librarian /thesis-management, admin and super admin /.

### How the admin registers a user

- Users, then Register User: name, email, role, department, program, and either &quot;send invite link&quot; or &quot;set temporary password&quot;.
- A Server Action restricted to admin and super admin calls Supabase&apos;s admin API with the secret (service-role) key, kept in a server-only environment variable, to create the auth user with the email already confirmed, then writes the profiles row. If the profile write fails, delete the auth user so the two never drift.
- A temporary password sets must_change_password = true, and the first sign-in forces a new password before anything else loads.
- Deactivate instead of delete. A disabled user cannot sign in, but their theses, versions and audit entries stay intact.

### Google Workspace sign-in

Status: deferred. You do not have PECIT Workspace access or a budget for Google auth yet, so the Sign in with Google button stays on the page but disabled, with a tooltip saying it is not available yet. A setting, google_login_enabled (false), controls it, and the callback route refuses to run while it is false, so enabling it later needs no redesign. When access is available, build it as the same account with a different door, using four layers because each one alone can be bypassed:

- In Google Cloud, set the OAuth consent screen to Internal (available when the project belongs to your Workspace organization), so only accounts in the organization can complete the Google step.
- Pass Google&apos;s hosted-domain hint (hd) when sign-in starts so the account picker shows only your domain. It is a convenience, not security.
- In the /auth/callback route, after the code exchange, require a verified email, a domain listed in settings.allowed_email_domains, and an existing active profiles row. Otherwise sign the person out and show &quot;This account is not registered. Contact the administrator.&quot;
- As a database backstop, add a Before User Created hook (a Postgres function) that rejects any new auth user whose email domain is not allowed (Supabase docs).
When the admin creates a student with their school email, that student&apos;s first Google sign-in attaches to the same user, because Supabase automatically links identities that share an email, and avoids doing so for unverified emails (Supabase docs). That is why registration creates users with a confirmed email. When Google sign-in is enabled later, test this first with signups turned off, since the docs do not describe that exact combination.


### Roles, claims and who can create whom

- Keep the role in profiles.role and copy it into the token with a Custom Access Token hook, so RLS policies read it from the JWT without a query. A role change reaches the token at its next refresh, so Server Actions that change data re-read the role from profiles instead of trusting the token alone.
- Admin can create student, advisor and librarian. Only super_admin can create admin or super_admin, and the last super_admin cannot be demoted or deactivated. Your source gives admin &quot;full management of users&quot;, so this is a tightening you can relax in one policy.
- Store student everywhere. The CLIENT label in the screenshot is an older name for the same role.

### Users module

Keep what your screenshot shows: search box, user column with avatar, name and email, Role filter, Added Date sort, 10 per page, refresh, and Register User. Add a Status column (active or disabled), Department and Program, last sign-in, row actions (edit, change role, reset password, deactivate), and Import CSV so the admin can register a whole class at once.


## Gaps and inconsistencies in the source spec

Eleven items in your files need a decision before coding starts; each row gives the fix this spec adopts. Section numbers refer to Logic.txt.

| Gap | Where it shows | Fix |
| --- | --- | --- |
| Role names disagree | RBAC table says student / client, the enum says student, the screenshot says CLIENT | Store student, show &quot;Student&quot;, migrate any old client rows |
| Super admin slug disagrees | 5.2 uses spadmin, the enum uses super_admin | Use super_admin everywhere |
| rejected has no rules | It is in the enum but the lifecycle never defines it | Terminal and locked; a written reason is required and logged; only an admin can reopen it |
| Transitions are implied, not defined | Lifecycle lists what each state allows, not who may move it | Define every move with its actor (diagram below) and enforce it in one Postgres function |
| The revision loop never closes | revision_requested lets the author upload v2, but nothing returns it to review | Uploading a version with change notes moves the thesis to submitted and notifies the advisor |
| Nobody assigns the advisor | primary_supervisor_id is never set, yet advisors see &quot;assigned submissions&quot; | Librarian or admin assigns it; advisors see only theses where they are the supervisor |
| DOCX has no upload path | docx_r2_key exists, but the presign step accepts PDF only | Allow an optional DOCX with its own content type and size limit, downloadable by librarian, admin and super admin only |
| Password re-check fails for Google accounts | 5.2 requires password re-verification for DOCX export | Re-verify with the method used to sign in: the password, or a fresh Google sign-in within the last 5 minutes |
| No publication date | The year facet and the year field have no source column | Add published_at, set when a thesis is published, and derive the year from it |
| Cache invalidation by pattern | 6.2 deletes archive:search:* | Pattern deletes need a key scan, which is slow on serverless Redis. Put a version in the key (archive:search:v{n}:{hash}), bump n with one INCR on any change, and let old keys expire |
| Bulk delete conflicts with an archive | 7.4 offers batch deletion | Delete only drafts and rejected theses (and remove their R2 files); archive everything else so DOIs and citations never break |


### Lifecycle with actors

thesis lifecycle · 8 states, advisor review before publishing

The student submits and resubmits, the librarian or admin assigns the advisor, the advisor accepts, rejects or requests revisions, and the librarian or admin publishes and archives.


## Crucial additions

Ten additions close the gaps a real repository hits in its first semester. Items 1 and 2 belong in the first schema, because retrofitting them later means rewriting every policy and query.


### 1. Rules enforced in the database

Your spec lists permissions in the UI, but Supabase exposes tables directly through its API, so a table without Row Level Security can be read or written by anyone holding the project&apos;s public key. Turn RLS on for every table and mirror the RBAC matrix: students see their own and co-authored theses, advisors see theses they supervise, librarian, admin and super admin see all, and anonymous visitors see only published, non-confidential, embargo-expired rows through a public view. Then revoke direct updates of status and make one SECURITY DEFINER function, transition_thesis_status, the only way to change it. It checks the caller&apos;s role, the current state and the lock rules, writes the activity_logs row and the notification, and returns the new row.


### 2. Group authors and co-author access

Theses and capstones are often written by groups, but your schema stores authors as text and access as one owner_id, so co-authors could not see their own work. Add a thesis_authors table (thesis id, profile id, author order) and let RLS treat every listed author as an owner. A trigger rebuilds the author_names array from it, so public search still reads one table with no joins.


### 3. Advisor assignment

An advisor sees only theses where they are primary_supervisor_id, so someone has to set it. Librarian and admin pick the advisor, filtered by department, from the submission row in Thesis Management. The advisor gets an in-app notification, and a reassignment is written to the audit log with a reason.


### 4. Duplicate check at submission

A repository that accepts the same topic twice loses trust fast. When a thesis is submitted, a background job compares its title (pg_trgm) and abstract embedding (pgvector) against the archive and saves the closest matches with scores into review_checklist, so the advisor sees possible duplicates next to the rubric. If PECIT already uses a commercial similarity tool, add a required rubric item to attach its report and record the percentage; this check complements that tool and does not replace it.


### 5. Publication consent and license

Before submitting, the author accepts a publication agreement (permission for the institution to host the work) and picks a license and an optional embargo request. Store consent_accepted_at, consent_version, license and a new published_at, and let the transition function refuse published when consent is missing. Without this the library has no record that the author allowed publication.


### 6. Bulk user import and account lifecycle

Registering a class one person at a time will not survive enrollment week. The Users module gets Import CSV (email, name, role, department, program) with a dry-run preview that lists bad rows before anything is created, then creates the accounts in batches and sends the invites. Add profiles.status (active, disabled, graduated) so each year the admin can close graduated accounts in one action without touching their theses.


### 7. Data Privacy Act handling

Your footer promises compliance with RA 10173, so back it with behavior. Keep address, phone and date of birth readable only by the person, admin and super admin, and never in a public view. Record acceptance of a privacy notice (privacy_consent_at) at first sign-in, store retention periods for logs and closed accounts in settings, and add an access_logs table that records who viewed or downloaded a confidential file. Confirm the retention periods and consent wording with your school&apos;s Data Protection Officer; this spec provides the mechanisms, not legal advice.


### 8. Upload integrity and orphan cleanup

A browser can claim an upload succeeded when it did not, and an abandoned upload leaves a file with no record. At commit, check the object in R2 (it exists, the size is within 50 MB, the first bytes are a PDF header) before creating the version row. A nightly scheduled job deletes objects under submissions/ that have no thesis_versions row after 24 hours, and flags any version row whose file is missing.


### 9. Discoverability

Public thesis pages should carry Google Scholar style citation_* meta tags (title, author, date, PDF link) so scholarly search engines can index PECIT&apos;s work; check Scholar&apos;s inclusion guidelines before launch. That needs a stable PDF address, but signed URLs expire, so expose /archive/{id}/pdf: it checks the public conditions, then redirects to a freshly signed R2 URL, and nothing is stored. Map the columns to Dublin Core now (title to dc.title, author to dc.creator, abstract to dc.description, keywords to dc.subject, published_at to dc.date, DOI to dc.identifier, license to dc.rights) so an OAI-PMH feed for library aggregators can be added later without a schema change.


### 10. Background jobs

Embeddings, emails, the orphan sweep and cache refresh should not run inside a user&apos;s request. Use Upstash QStash (same account as your Redis) to call protected API routes with retries, so a slow mail provider never delays a status change, and send email through a transactional provider such as Resend.


### Schema changes at a glance

| Table | Change |
| --- | --- |
| thesis_authors | New: thesis id, profile id, author order |
| access_logs | New: thesis id, version id, actor id, kind (view, download, docx export), created at |
| theses | Add published_at, license, consent_accepted_at, consent_version |
| profiles | Add status, must_change_password, privacy_consent_at |
| settings | New keys allowed_email_domains, google_auto_provision (default false), admin_contact_email, retention_policy |
| activity_logs | Unchanged and still append-only; the transition function becomes its main writer |


## Delivery plan

Work in seven stages and keep everything on your computer until Stage 5 proves the system is solid; only then touch Vercel or any production service.

delivery plan · seven stages, local first

Phase 0 finishes Stage 3, and Phases 1 to 5 in the build section make up Stage 4. Each stage ends with a gate you can check yourself, and the agent may not start the next stage until you confirm the gate.


### Stage 1: Plan

Answer the Open decisions table, create the repository with the docs folder (see the GitHub steps in the next section), and have the agent turn this spec into a task plan. No code is written.

STAGE 1: PLAN. No code. Read docs/SPEC.md and docs/source/. Produce docs/PLAN.md with: the scope in one paragraph; the build phases (Phase 0 to 5, then Local QA, Staging, Production) with small tasks under each, every task finishable in one sitting; the dependencies between tasks; the ten biggest risks, each with how we reduce it; my answers to the Open decisions table; and what is out of scope for now (Google sign-in, a real email provider, a commercial similarity tool).Done when: I can read PLAN.md and tell what gets built, in what order, without asking you anything.


### Stage 2: Design

Still no application code. The agent writes the design files and you approve them one by one; building starts only after that.

STAGE 2: DESIGN. No application code. Create docs/design/ with: (1) data-model.md, an ER diagram in Mermaid for every table in SPEC.md including the additions, plus the indexes; (2) rls-matrix.md, a table of role against table against action (select, insert, update, delete) with the rule in words; (3) routes.md, every page and API route with who may call it and the Zod schema for its input; (4) screens.md, every screen from SPEC.md and docs/screens with its loading, empty, error and no-permission states, using the PECIT blue from the logo; (5) threat-model.md, one page on how an attacker could read a confidential thesis, skip a lifecycle state, upload a bad file or take over an account, and which control stops each; (6) test-plan.md, one test case for every Done-when check in SPEC.md.Done when: I have approved each file and the Mermaid diagrams render without errors.


### Stage 3: Set up

You create the accounts and fill .env.local by following the next section. The agent then builds the empty project in Phase 0 and proves every connection works with one command.


## Accounts and credentials

You paste every credential yourself, so the agent never sees a key: it only knows variable names from .env.example, and you fill in .env.local on your computer. Use development accounts, projects and buckets for everything until Stage 6. Before you start, install Node.js (current LTS) and Git.


### Rules for secrets

- Keys live only in .env.local (ignored by git) for now, and in Vercel&apos;s environment variables at Stage 6. Never put one in code, chat, a screenshot or docs/.
- Only variables that start with NEXT_PUBLIC_ reach the browser. The Supabase secret key, R2 keys, Upstash token and Turnstile secret never get that prefix.
- .env.example lists every name and is the only env file you commit.
- If a key is ever exposed, replace it straight away (each service below says where) and update .env.local.
- Save every account login and recovery detail in a password manager.

### 3.1 GitHub

- Create a private repository named pecit-thesis-archive.
- Clone it to your computer and open the folder in Antigravity.
- Create docs/ and put in it SPEC.md (this document exported as Markdown), MASTER_PROMPT.md (from the next section), source/ (your two original files) and screens/ (your screenshots). Put the PECIT logo in public/.
- Before your first commit, open .gitignore and confirm it lists .env.local.

### 3.2 Supabase (development project)

- In the Supabase dashboard, create a project named pecit-thesis-dev. Choose the region closest to your users and save the database password in your password manager. The free plan allows two active projects, so pause or delete one you do not need.
- Open the project&apos;s Connect dialog (or Settings, then API Keys). Copy the project URL into NEXT_PUBLIC_SUPABASE_URL, the publishable key (starts with sb_publishable_) into NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and the secret key (starts with sb_secret_) into SUPABASE_SECRET_KEY. If the page offers only the older anon and service_role keys, click Create new API keys first; it is safe and the old keys keep working (Supabase docs).
- In Authentication settings, turn off &quot;Allow new users to sign up&quot;. The admin API can still create users, which is how the first super admin is seeded.
- In Authentication, URL Configuration, set the Site URL to http://localhost:3000 and add http://localhost:3000/** as a redirect URL, so invite and password-reset links work locally.
- Apply database changes without pasting SQL: the agent writes migration files in supabase/migrations/, and you run npx supabase login, then npx supabase link --project-ref &lt;your project ref&gt; (the ref is the code in your project URL), then npx supabase db push, which asks for the database password.
- If the secret key leaks, create a new one under Settings, API Keys, switch .env.local to it, then delete the old one.

### 3.3 Cloudflare R2 (development bucket)

- In the Cloudflare dashboard, open R2 Object Storage. If R2 is not enabled on the account, enable it; Cloudflare asks for a payment method, so check the free allowance on its R2 pricing page first.
- Create a bucket named pecit-thesis-dev and copy the name into R2_BUCKET_NAME. Leave public access off.
- Copy your Cloudflare account ID from the R2 overview page into R2_ACCOUNT_ID.
- On the R2 overview page, under Account details, choose Manage next to API Tokens, then Create API token. Pick the permission Object Read &amp; Write and limit it to the pecit-thesis-dev bucket. Prefer an Account API token, which keeps working if a team member leaves (Cloudflare docs).
- The Access Key ID and Secret Access Key appear once. Paste them straight into R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY. The app builds the endpoint https://&lt;account id&gt;.r2.cloudflarestorage.com itself.
- Open the bucket, then Settings, then CORS Policy, and add the policy shown below these steps (the production domain is added at Stage 6).
- To replace a leaked token, create a new one, update .env.local, then delete the old one.
[  {    &quot;AllowedOrigins&quot;: [&quot;http://localhost:3000&quot;],    &quot;AllowedMethods&quot;: [&quot;PUT&quot;, &quot;GET&quot;],    &quot;AllowedHeaders&quot;: [&quot;Content-Type&quot;],    &quot;ExposeHeaders&quot;: [&quot;ETag&quot;],    &quot;MaxAgeSeconds&quot;: 3600  }]


### 3.4 Upstash Redis (development database)

- Sign in at console.upstash.com and choose Create Database. Name it pecit-thesis-dev, pick the region nearest you and the free plan.
- Open the database and find the REST API section. Copy the URL into UPSTASH_REDIS_REST_URL and the token into UPSTASH_REDIS_REST_TOKEN. Use the read and write token, not the read-only one, and treat it like a password.
- Check the free plan&apos;s command limit on Upstash&apos;s pricing page before launch, because caching and rate limiting both use commands.
- Skip QStash for now; locally, background jobs run inline.

### 3.5 Cloudflare Turnstile (test keys for now)

For local work you need no account. Cloudflare publishes dummy keys that work on localhost: a site key that always passes and a matching secret key. Put them in .env.local as shown in the template below. To test a failed check, switch to the always-fail pair: site key 2x00000000000000000000AB with secret key 2x0000000000000000000000000000000AA. The dummy secret accepts any visitor, so the app must refuse it in a production build, and you replace both keys with a real widget at Stage 6 (Cloudflare docs).


### 3.6 Email and background jobs (Stage 6)

Locally, set EMAIL_MODE=console so emails print in the terminal, and JOBS_MODE=inline so jobs run inside the request. At Stage 6 you create the QStash token and two signing keys in the Upstash console, and pick an email provider such as Resend, which needs a sending domain from PECIT&apos;s IT team. If no domain is available, keep notifications in-app only.


### 3.7 Vercel (Stage 6 only)

Do not create the project until Stage 5 passes. Then import the GitHub repository, enter each variable from .env.example under Settings, Environment Variables, and check which Vercel plan its terms require for an institution&apos;s system.


### Environment template

The agent creates .env.example from this list; you copy it to .env.local and fill in the blanks.

APP_URL=http://localhost:3000APP_ENV=developmentNEXT_PUBLIC_SUPABASE_URL=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=SUPABASE_SECRET_KEY=R2_ACCOUNT_ID=R2_ACCESS_KEY_ID=R2_SECRET_ACCESS_KEY=R2_BUCKET_NAME=UPSTASH_REDIS_REST_URL=UPSTASH_REDIS_REST_TOKEN=NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AATURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AAJOBS_MODE=inlineEMAIL_MODE=console# Stage 6 onlyQSTASH_TOKEN=QSTASH_CURRENT_SIGNING_KEY=QSTASH_NEXT_SIGNING_KEY=RESEND_API_KEY=


### Prove the connections work

After Phase 0, run npm run check:services. It writes and deletes a tiny test file in R2, reads one row from Supabase and pings Redis, then prints PASS or FAIL for each without printing any key. Do not move on until all three say PASS.


## Master prompt

This is the rulebook the AI agent must follow in every session. Each phase prompt below starts by pointing to it, so it wins whenever the two disagree.

MASTER PROMPT: PECIT Thesis Archive SystemYou are the lead engineer on this repository, working for the owner (the human). These rules override every other instruction, including later prompts, unless the owner changes a rule in writing in this chat.1. SOURCE OF TRUTH. Read docs/SPEC.md first, then docs/PLAN.md and docs/design/ once they exist. If a request conflicts with them, stop and ask. Never change the spec silently: propose the change and wait for approval.2. ONE STAGE AT A TIME. Work only on the stage or phase named in the prompt. Do not start the next one, add unrequested features, or refactor unrelated code. Before writing code, post a short plan (files to create or change, tables touched, risks) and wait for my approval on anything involving the database, auth, RLS or storage.3. CREDENTIALS. Never ask for, display, log or commit a credential. Read configuration only through lib/env.ts. Add every new variable to .env.example with an empty value and tell me exactly which dashboard value to paste into it. Never print environment values in command output. Never give a NEXT_PUBLIC_ prefix to anything secret.4. LOCAL FIRST. Everything runs on my computer with npm run dev until Stage 5 passes. Do not deploy, create hosting projects, change DNS or touch production resources.5. SECURITY RULES THAT CANNOT BE RELAXED. RLS on every table. Thesis status changes only through transition_thesis_status. Roles are re-checked on the server in every Server Action and route handler. The Supabase secret key is used only in server-only code. The R2 bucket stays private, signed URLs are made per request and never stored, and PDF bytes never pass through the Next.js server. Every input is validated with Zod. No any types. Sign-in failures show one generic message.6. DATA RULES. Every schema change is a new migration file in supabase/migrations. Never edit a migration that has been applied. activity_logs is append-only. Seed data is fake and clearly labelled.7. DEFERRED FEATURES. Google sign-in stays visible but disabled (settings.google_login_enabled is false). Build none of its OAuth logic until I confirm I have Workspace access and budget. Real email sending and QStash wait for Stage 6; locally use EMAIL_MODE=console and JOBS_MODE=inline.8. QUALITY. Strict TypeScript, lint clean, no personal data in logs. Automate every Done-when check you can as a test, and write manual steps for the rest. Every screen handles loading, empty, error and no-permission states. Keep components small and name things plainly.9. REPORTING. End every task with: (a) files created or changed; (b) each Done-when check marked PASS, FAIL or NOT RUN, with the command or steps used; (c) assumptions you made; (d) the one thing I must do next by hand. Never mark a check PASS unless you ran it.10. WHEN IN DOUBT, ASK. If a rule blocks a request, name the rule and offer the closest compliant option. Stop and ask before deleting data or files, adding a paid service or dependency, or changing auth or RLS behavior.11. STYLE. Plain English. Explain each manual step for a beginner, one step at a time, with the exact click path or command.

Save it as docs/MASTER_PROMPT.md. If Antigravity offers workspace rules or custom instructions, paste it there too, and start every new chat with one line: Follow docs/MASTER_PROMPT.md strictly.


## Build phases (Phase 0 to 5)

Phase 0 finishes Stage 3, and Phases 1 to 5 are Stage 4. Run them in order and start the next one only when the current phase&apos;s Done-when checks pass. Stages 5 to 7 follow the phases below.


### Opening lines for every prompt

Paste this at the top of each phase prompt:

Follow docs/MASTER_PROMPT.md strictly. It overrides anything below that conflicts with it. Then do only the phase below, and finish with the report format the master prompt defines.


### Phase 0: Project and environments

PHASE 0 (finishes Stage 3). Create the Next.js 16 TypeScript project in this repository and connect it to GitHub only; do not touch Vercel. Add .env.example with every name in the Environment template in SPEC.md, and lib/env.ts, which validates them with Zod at boot and fails with a clear message naming the missing variable (never printing values). Make it refuse the dummy Turnstile secret when APP_ENV is production. Add the Supabase browser and server clients with @supabase/ssr, a root proxy.ts that refreshes the session, a jobs helper that runs inline when JOBS_MODE is inline, and an email helper that prints to the terminal when EMAIL_MODE is console. Add npm run check:services, which writes and deletes a test file in R2, makes one authenticated request to Supabase and pings Redis, and prints PASS or FAIL for each without printing any key. Build the layout shell (sidebar, header with the PECIT logo and institution name, footer with the RA 10173 notice) to match docs/screens.Done when: npm run dev starts the app; a protected route redirects to /login; a missing env var stops the app with a clear message; npm run check:services prints PASS three times.


### Phase 1: Database, auth and the Users module

PHASE 1. Write Supabase migrations for the enums, tables, triggers, indexes and extensions in SPEC.md, including the additions (thesis_authors, access_logs, new columns, settings keys). Enable RLS on every table with policies that mirror the RBAC matrix, add a public view for published, non-confidential, embargo-expired theses, and create transition_thesis_status as SECURITY DEFINER with direct status updates revoked. Turn off public signups. Add a Custom Access Token hook that puts profiles.role in the JWT (the Before User Created domain hook is added later, together with Google sign-in). Build /login (email and password with Turnstile and rate limiting, a Google button that is visible but disabled by settings.google_login_enabled (default false), no register link), /auth/callback with the four checks in SPEC.md, wired up but refusing to run while google_login_enabled is false, and the Users module (list, search, role filter, Register User, edit, change role, deactivate, reset password, CSV import with a dry run) matching docs/screens. Seed one super_admin.Done when: (a) a direct self-signup API call is rejected; (b) a student created by the admin signs in with email and password; (c) the Google button is visible and disabled, and the callback refuses to run; (d) a student cannot read another student&apos;s thesis through a direct API query.


### Phase 2: Thesis core and uploads

PHASE 2. Build /my-thesis: submission cards with status badges, the multi-step submit and revise modal (metadata, co-authors saved to thesis_authors, publication consent and license, PDF drag and drop with a progress bar), and the routes presign-upload, commit-version and signed download. The commit step must check the object in R2 (exists, at most 50 MB, PDF header) before creating the thesis_versions row. Use the key submissions/{thesisId}/v{n}/manuscript.pdf and the idempotency guard from SPEC.md. Give me the R2 CORS JSON to apply (PUT and GET from http://localhost:3000 only; the Vercel domain is added at Stage 6, Content-Type allowed).Done when: a 50 MB PDF uploads with progress and never passes through Vercel; a 51 MB file and a non-PDF are refused; double-clicking Submit creates one thesis; a listed co-author can see the thesis; commit rejects a key that was never uploaded.


### Phase 3: Review and publishing

PHASE 3. Build /review-manager (queue, split-pane PDF reader with page comments saved to pdf_annotations, rubric checklist, Request Revisions, Accept and Reject with a required reason) and the librarian tools in /thesis-management (advisor assignment, metadata check, confidentiality and embargo, DOI, Publish, Archive). Every status change goes through transition_thesis_status. Send in-app notifications, and send emails and run background jobs through the helpers from Phase 0 (inline and console locally).Done when: every move in the lifecycle diagram works for its role and fails for every other role; a revision upload returns the thesis to Submitted; Publish is refused without publication consent; each move appears once in activity_logs, and activity_logs cannot be edited or deleted.


### Phase 4: Public archive and search

PHASE 4. Build /archive: hero, search with a 250 ms debounce, facet sidebar, grid and list views, drawer preview with the citation generator and the PDF viewer, with every filter synced to URL parameters. Search reads only the denormalized columns of theses and truncates abstracts. Add the Redis cache-aside layer with versioned search keys and the invalidation steps from SPEC.md, the /archive/{id}/pdf redirect route, citation_* meta tags, and the duplicate-check job.Done when: a repeated search returns in under 100 ms from cache; changing a thesis status refreshes search results on the next request; a confidential or embargoed thesis never appears for anonymous users; no signed URL is found in Redis.


### Phase 5: Admin, reports and hardening

PHASE 5. Build the dashboard KPIs and charts, the report generator with streaming CSV (500-row chunks, UTF-8 BOM), the audit log viewer, system settings and branding, the version history inspector, the DOCX download with re-verification, the nightly orphan sweep, access_logs for confidential files, and the privacy-notice screen. Add Playwright tests for the lifecycle and RBAC, a database backup check, and a copy of the R2 bucket to a second location.Done when: a CSV opens correctly in Excel with names containing accents intact; Playwright passes for every role; a restore drill recovers the database into a test project.


## Stages 5 to 7: test and release


### Stage 5: Local QA gate

Nothing new is built here. The agent proves the system is solid on your computer, and you click through every role yourself before anything is deployed.

STAGE 5: LOCAL QA GATE. Add no features. Run and report: (1) lint, typecheck, unit tests and Playwright tests; (2) npm run check:services; (3) a walk-through with seeded users for student, advisor, librarian, admin and super_admin, performing every lifecycle move; (4) a security pass against docs/design/threat-model.md, attempting each attack on the local app and recording the result; (5) direct API calls with each role&apos;s token proving RLS blocks what it should; (6) a search speed test with 1,000 seeded theses against the numbers in SPEC.md; (7) an accessibility check (keyboard use, contrast, labels) on login, my-thesis, review-manager and archive; (8) a backup and restore drill of the development database; (9) a scan of the git history confirming no secret was ever committed. Fix each defect with the smallest change and re-run. Write the results to docs/QA-REPORT.md.Done when: every item is PASS in docs/QA-REPORT.md and I have clicked through each role myself.


### Stage 6: Staging

Staging puts the app on Vercel using your development services, so you test real hosting without risking real data. Your steps:

- Create the Vercel project from the GitHub repository and enter the variables (step 3.7).
- Switch Turnstile to a real widget: in the Cloudflare dashboard open Turnstile, add a widget for your Vercel hostname, and paste the site key and secret key.
- Add the Vercel domain to the R2 bucket&apos;s CORS policy and to Supabase&apos;s Site URL and redirect URLs.
- Create the QStash token and signing keys in the Upstash console, and set JOBS_MODE=qstash.
- Run the Stage 5 checks against the staging URL.
STAGE 6: STAGING. Do not touch production resources. Prepare the app for Vercel: make npm run build pass, add the QStash job handlers with signature verification behind the JOBS_MODE switch, make Turnstile verification reject the dummy secret when APP_ENV is production, add security headers (content security policy, frame-ancestors, referrer policy) and an /api/health route that checks Supabase, R2 and Redis without exposing details, and write docs/DEPLOY.md listing every environment variable, where its value comes from, and the order of steps. Then give me the exact clicks and pastes needed in Vercel, Supabase, Cloudflare and Upstash.Done when: the Stage 5 checks pass against the staging URL; a 50 MB PDF uploads from the staging site straight to R2; a signed URL stops working after its expiry; a production build refuses the dummy Turnstile secret.


### Stage 7: Production

Production gets its own Supabase project, bucket, Redis database and Turnstile widget, created fresh, so no test data or development key carries over. Work through this checklist:

- ☐ Create the production services (name them pecit-thesis-prod) and enter their values in Vercel&apos;s Production environment variables.
- ☐ Apply the migrations to the production database with npx supabase link and npx supabase db push, then seed the first super admin.
- ☐ Decide on backups before go-live: free Supabase projects pause after a week of inactivity and are limited to two active projects, so choose a paid plan or scheduled exports, and run one restore drill (Supabase pricing).
- ☐ Connect PECIT&apos;s domain with HTTPS, then update Supabase&apos;s Site URL, the R2 CORS origin and the Turnstile hostnames to it.
- ☐ Have PECIT&apos;s Data Protection Officer approve the privacy notice, the consent text and the retention periods.
- ☐ Import a small first batch of real users by CSV and run one thesis from submission to publication as a smoke test.
- ☐ Write down the rollback plan: redeploy the previous Vercel build, and keep a reverse migration for every schema change.
- ☐ Watch the first weeks: Vercel logs, the /api/health check, and alert emails to you.

## Open decisions

Seven choices have a default in this spec; change any of them before you sign off the plan in Stage 1.

| Decision | Default in this spec | Change it if |
| --- | --- | --- |
| Google sign-in for a school account the admin has not registered | Refused until the admin registers it (google_auto_provision is false) | You want every Workspace member to get a student account automatically on first sign-in |
| Allowed email domains | Not known yet; set them in settings.allowed_email_domains | PECIT uses more than one domain, for example a separate student domain |
| Password login for non-school emails | Allowed, since the Users screenshot lists gmail.com accounts; only Google sign-in is domain-locked | You want password login limited to school domains as well |
| Who creates admin accounts | Super admin only | Admins should be able to create other admins |
| Who can publish | Librarian and admin | Only the librarian |
| Reopening a rejected thesis | Admin only | Rejection should be final |
| Similarity checking | Built-in duplicate check only | PECIT uses a commercial tool, so attach its report as a required rubric item |

Google sign-in is deferred, so the first two rows apply only once it is enabled.


## Sources

- Supabase Docs: Identity Linking
- Supabase Docs: Before User Created Hook
- Supabase Docs: Understanding API keys
- Supabase pricing
- Cloudflare R2 Docs: Configure CORS
- Cloudflare R2 Docs: API tokens
- Cloudflare Turnstile Docs: Test your implementation
- Upstash: redis-js (create a database, REST URL and token)
- Vercel Academy: Proxy and Protected Routes (Next.js 16)
