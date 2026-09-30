# CMT Autofill — Technical Design

Companion to `PROJECT_DETAIL.md`.
Status: implementation design for a first full-stack build.
Items marked **[verify]** are inferred from one sample form and must be checked against the live rendered DOM.

---

## 1. Architecture

### 1.1 Components

```text
┌──────────────────────────────────────────────────────────────────┐
│                         Chrome Extension                         │
│                                                                  │
│  Popup ───────┐                                                  │
│  Options ─────┼───► Extension runtime / shared state             │
│  Review UI ───┤                                                  │
│               └───► Content script ───► CMT live DOM             │
│                              │                                   │
│                              │ HTTPS / messages                  │
└──────────────────────────────┼───────────────────────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ Express Backend     │
                    │                     │
                    │ Auth                │
                    │ User/credential DB  │
                    │ AI orchestration    │
                    │ Validation         │
                    └─────────┬───────────┘
                              │
                              │ Authorization: Bearer <decrypted key>
                              ▼
                    ┌─────────────────────┐
                    │ Ollama Cloud        │
                    │ Gemma 4             │
                    └─────────────────────┘
```

### 1.2 Responsibilities

| Component | Does | Must not |
|---|---|---|
| Options UI | Account setup, authors, papers, consents, AI settings | Call Ollama directly; store plaintext Ollama key after setup |
| Popup | Select paper, trigger Execute, show status | Call Ollama directly |
| Content script | Detect CMT page, scrape DOM, fill DOM, render/refer to review UI | See or use Ollama API key; call model provider directly |
| Service worker | Extension messaging, backend API requests, session handling | Manipulate the CMT DOM directly |
| Backend | Auth, credential lookup/decryption, model orchestration, validation, rate limiting | Expose plaintext Ollama key to client; persist paper prompts by default |
| PostgreSQL | User/account and encrypted credential persistence | Store plaintext API credentials |
| Ollama Cloud | Model inference | Know anything about CMT beyond the prompt payload |

### 1.3 Important rule

**The extension talks to our backend. The backend talks to Ollama Cloud.**

The extension must never call `https://ollama.com/api/*` directly.

Ollama's current Cloud docs say direct cloud requests use an API key and specifically advise keeping the API key out of browser code. citeturn877912view0turn877912view1

---

## 2. Technology stack

### Extension

| Layer | Choice | Purpose |
|---|---|---|
| Platform | Chrome Manifest V3 | Extension runtime |
| Language | TypeScript | Types and application logic |
| UI | React + TSX | Popup, options, review panel |
| Build | Vite + `@crxjs/vite-plugin` | MV3 build/dev workflow |
| CMT integration | TypeScript + DOM APIs | Read/write live CMT form |
| Validation | Zod | Validate backend/model payloads |
| PDF parsing | `pdfjs-dist` | Extract paper text locally |
| Tests | Vitest | Unit/integration tests |
| Formatting | Prettier | Consistent formatting |
| Linting | ESLint | Static checks |

### Backend

| Layer | Choice | Purpose |
|---|---|---|
| Language | Node.js (current LTS) + TypeScript | Backend implementation |
| API | Express | REST API + async request handling |
| Schemas | Zod | API input/output validation |
| ORM | Prisma | Database access |
| Migrations | Prisma Migrate | Schema migrations |
| DB | PostgreSQL | Users + encrypted credentials |
| HTTP | native `fetch` | Ollama Cloud requests |
| Crypto | `Node `crypto`` | Authenticated encryption for credentials |
| Password hashing | Argon2id | Hash user passwords if using local auth |
| Auth | JWT access tokens | Extension → backend authentication |
| Tests | Vitest | Backend tests |

### External AI

- Provider: **Ollama Cloud**
- Endpoint: `https://ollama.com/api/chat`
- Authentication: `Authorization: Bearer <user_ollama_api_key>`
- Default model setting: a Gemma 4 cloud model such as `gemma4:31b`; keep configurable.
- The user-provided Ollama key is not an extension credential; it is a backend-managed secret.

Ollama currently documents `https://ollama.com/api` for direct cloud API access and uses model names such as `gemma4:31b` for direct API requests. citeturn877912view0turn877912view1

---

## 3. Repository structure

Use a Turborepo monorepo with pnpm workspaces. Turborepo coordinates build, lint, test, and development tasks across the packages, while shared packages hold code used by both applications.

```text
cmt-autofill/
├─ apps/
│  ├─ extension/
│  │  ├─ public/
│  │  ├─ src/
│  │  │  ├─ background/
│  │  │  ├─ cmt/
│  │  │  ├─ content/
│  │  │  ├─ popup/
│  │  │  ├─ options/
│  │  │  ├─ pdf/
│  │  │  ├─ storage/
│  │  │  └─ shared/
│  │  ├─ manifest.config.ts
│  │  ├─ vite.config.ts
│  │  └─ package.json
│  │
│  └─ api/
│     ├─ src/
│     │  ├─ config/
│     │  ├─ middleware/
│     │  ├─ routes/
│     │  ├─ controllers/
│     │  ├─ services/
│     │  ├─ providers/
│     │  │  ├─ ollama/
│     │  │  └─ jev/
│     │  ├─ db/
│     │  ├─ schemas/
│     │  └─ utils/
│     ├─ prisma/
│     │  └─ schema.prisma
│     ├─ tests/
│     └─ package.json
│
├─ packages/
│  ├─ contracts/
│  ├─ config/
│  └─ ui/
│
├─ docs/
│  ├─ PROJECT_DETAIL.md
│  └─ TECHNICAL.md
│
├─ package.json
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.json
├─ README.md
└─ .gitignore
```

`packages/contracts` is particularly important: it should contain shared Zod schemas and inferred TypeScript types for messages such as `FormSchema`, `/ai/decide` requests, decisions, and fill results.

## 4. Data model

### Extension-local data

```ts
interface Author {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organization: string;
  countryCode: string;
}

interface Paper {
  id: string;
  title: string;
  abstract: string;
  keywords: string[];
  fullText: string;
  authorIds: string[];
  primaryContactId: string;
  domainConflicts: string[];
  pdfBlobKey?: string;
  updatedAt: number;
}

interface ExtensionSettings {
  backendBaseUrl: string;
  selectedModel?: string;
  thresholds: { green: number; amber: number };
  standingConsents: { ithenticate: boolean; tpms: boolean };
}
```

Store `settings`, `authors`, and smaller paper metadata in `chrome.storage.local`; store large `fullText` and PDF blobs in IndexedDB. Never store the Ollama Cloud API key here.

### Backend database

```text
users
-----
id
email
password_hash              # if using local account auth
created_at
updated_at

ollama_credentials
------------------
id
user_id                    # FK users.id, unique
ciphertext
nonce
key_version
created_at
updated_at
last_validated_at
```

No plaintext API key column should exist.

For production, the encryption root should live outside PostgreSQL and outside source control. A managed KMS/secret manager should protect the key-encryption root.

---

## 5. Authentication and credential flow

### 5.1 Backend authentication

The extension needs its own identity with our backend because the backend must know **which user's Ollama credential** to use.

```text
Extension
   │
   ├── register/login
   ▼
Backend Auth API
   │
   └── access token
          │
          ▼
Extension stores session token
```

Use short-lived access tokens and a refresh mechanism suitable for an extension. Never use the Ollama API key as the extension's login credential.

### 5.2 Ollama API-key setup

```text
User enters Ollama API key
          │
          ▼
Extension → POST /credentials/ollama
          │
          ▼
Backend validates request
          │
          ▼
Backend optionally makes a small safe Ollama test call
          │
          ▼
Encrypt key
          │
          ▼
Store ciphertext + nonce + key version
          │
          ▼
Return only:
{ configured: true, lastValidatedAt: ... }
```

The plaintext key should not be returned to the extension.

### 5.3 AI request

```text
Extension
   │
   │ POST /ai/decide
   │ Authorization: Bearer <our-session-token>
   ▼
Backend
   │
   ├── authenticate user
   ├── load encrypted Ollama credential
   ├── decrypt key in memory
   ├── build Ollama request
   ├── call Ollama Cloud
   ├── validate result
   ├── discard key from normal execution scope
   └── return structured result
   ▼
Extension
```

The extension never sees the user's Ollama API key during this flow.

---

## 6. Backend API design

### Authentication

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/users/me
```

### Ollama credentials

```text
POST   /api/v1/credentials/ollama
GET    /api/v1/credentials/ollama/status
DELETE /api/v1/credentials/ollama
POST   /api/v1/credentials/ollama/test
```

`GET /status` returns metadata only, e.g. `{configured, lastValidatedAt}`. It never returns the secret.

### AI

```text
POST /api/v1/ai/decide
```

Request shape:

```ts
interface DecideRequest {
  paper: {
    title: string;
    abstract: string;
    keywords: string[];
    fullText: string;
  };
  conference: {
    name: string;
    welcomeText: string;
  };
  fields: FieldSchema[];
  authorSummary?: {
    emails: string[];
    organizations: string[];
    domains: string[];
  };
}
```

Response shape:

```ts
interface DecideResponse {
  answers: Record<string, Decision>;
  model: string;
  requestId: string;
}
```

The backend should validate both the incoming schema and outgoing answers.

---

## 7. Ollama provider

### 7.1 Direct cloud call

The backend calls Ollama Cloud directly:

```text
POST https://ollama.com/api/chat
Authorization: Bearer <decrypted_user_key>
Content-Type: application/json
```

Example logical payload:

```json
{
  "model": "gemma4:31b",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "stream": false
}
```

Ollama currently documents this direct-cloud pattern and identifies `gemma4:31b` as a cloud API model name; model naming may change, so keep it configurable. citeturn877912view0turn877912view1

### 7.2 Provider interface

```python
class ModelProvider(Protocol):
    async def decide(
        self,
        state: DecisionState,
        fields: list[FieldSchema],
    ) -> dict[str, Decision]: ...
```

Implementation:

```text
services/ai_service.py
        │
        ▼
providers/base.py
        │
   ┌────┴────┐
   ▼         ▼
ollama.py  jev.py
```

The rest of the backend should not care which provider is used.

---

## 8. CMT page facts [verify against live DOM]

The page is a Knockout.js app. `#submissionForm` is `display:none` until Knockout binds; questions and subject areas load at runtime. Everything must be scraped from the live DOM after render.

### Page detection

- Match: `https://cmt3.research.microsoft.com/*/Submission/Create*` and `.../Track/*/Submission/Create*`.
- Confirm `h1` text is "Create New Submission".
- Conference name: `#conferenceDropdownMenuButton[title]` and URL path.
- Welcome message / instructions: `.well` text.

### Selector map

| Field | Selector | Notes |
|---|---|---|
| Title | `#titleTextbox` | text input |
| Abstract | `#abstractTextbox` | textarea; only if abstract allowed; char limit in `#abstractCharsLeft` |
| Conflict domains | `#submissionConflictDomainsRawTextbox` | semicolon-separated |
| Authors (existing rows) | `[id^="autorEmailCell-"]` | read-only text cells |
| Add-author button | `button[title="Add author"]` | |
| Add-author form | `form.form-inline` | inputs by placeholder |
| Primary contact | `input[name="primaryEmail"][value="<email>"]` | radio |
| Subject areas | checkboxes in subject-area table | inspect primary/secondary labels |
| Additional question | `div` with id matching `/^sq_\d+$/` | see below |
| Repro checklist | `ul.repro-questions > li` | radios + optional comment |
| iThenticate consent | `#ithenticate_agreement_cb` | user-controlled |
| TPMS consent | `#tpms_agreement_cb` | user-controlled |
| File drop | `#fileDropBox` | experimental |
| **Submit** | `.form-actions .btn-primary` | **never touched** |

### Additional-question types

| Type | Detect | Answer |
|---|---|---|
| Agreement | `input[type=checkbox]#sq_{id}_cb` | bool — proposal only |
| Comment | text input / textarea | string within `maxlength` |
| Radio options | `input[type=radio][id^="sq_{id}_rb_"]` | one choice |
| Checkbox list | `input[type=checkbox][id^="sq_{id}_cb_"]` | array of choices |
| Dropdown | `select` | one choice |
| Listbox | `select[multiple]` | array of choices |

---

## 9. Knockout interaction rules

| Element | How to set |
|---|---|
| text / textarea | native value setter → dispatch `input` then `change` |
| select | set `.value` after options exist → dispatch `change` |
| checkbox / radio | `.click()` only if current state differs; never assign `.checked` |
| conditional UI | act → wait for new element → fill |

```ts
function setValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  v: string,
) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(el),
    'value',
  )!.set!;

  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function setChecked(el: HTMLInputElement, want: boolean) {
  if (el.checked !== want) el.click();
}
```

Optional escape hatch: a MAIN-world script using `ko.dataFor(document.getElementById('submissionForm'))` if a widget fights the DOM route. Not in v1.

---

## 10. Scrape → schema

```ts
type FieldKind =
  | 'text'
  | 'textarea'
  | 'radio'
  | 'dropdown'
  | 'listbox'
  | 'checkboxList'
  | 'agreement'
  | 'repro'
  | 'subjectArea';

interface FieldSchema {
  id: string;
  kind: FieldKind;
  label: string;
  details?: string;
  required: boolean;
  maxLength?: number;
  choices?: { id: string; text: string }[];
  current?: string | string[] | boolean | null;
}

interface FormSchema {
  conference: string;
  welcomeText: string;
  fields: FieldSchema[];
  authorsPresent: string[];
}
```

Authors, consents, and the submit button are not part of `fields`; dedicated code handles them.

---

## 11. Fill algorithm

```text
0. waitForRender()
1. authors deterministic
2. schema = scrape()
3. POST /api/v1/ai/decide
4. validate DecideResponse
5. scalar fields: title, abstract, conflict domains
6. subject areas from structured answers
7. additional questions by kind
8. repro checklist: phase A choice, phase B conditional textarea
9. consents from standingConsents only
10. re-scrape up to 3 passes for newly revealed fields
11. files only if experimental upload path is enabled
12. render review panel
```

Each field produces:

```ts
interface FillResult {
  fieldId: string;
  label: string;
  value?: unknown;
  confidence?: number;
  reason?: string;
  status: 'filled' | 'skipped' | 'failed' | 'proposal';
}
```

---

## 12. Authors (idempotent)

1. Existing emails = text of `[id^="autorEmailCell-"]`, lower-cased.
2. For each paper author not already present:
   1. click `button[title="Add author"]`;
   2. wait for `form.form-inline`;
   3. fill Email, pause ~300 ms, then First name, Last name, Organization, Country;
   4. submit the inline author form;
   5. wait for row count +1 or an error message;
   6. on failure, mark that author failed and continue.
3. Click the `primaryEmail` radio for the selected primary contact.

Note: `userInformationEntryRequiredForCoAuthor` may alter the author flow **[verify]**.

---

## 13. Model layer

### 13.1 Interface

```ts
interface Decision {
  value: unknown;
  confidence: number;
  reason?: string;
  engine: 'ollama' | 'jev';
  model?: string;
  escalated?: boolean;
}

interface DecisionState {
  paper: {
    title: string;
    abstract: string;
    keywords: string[];
    fullText: string;
  };
  conference: {
    name: string;
    welcomeText: string;
  };
  authorSummary?: {
    emails: string[];
    organizations: string[];
    domains: string[];
  };
}
```

The public `decide()` abstraction belongs to the backend AI service; the extension only sees the HTTP contract.

### 13.2 Gemma 4 path

- Extension → backend `/api/v1/ai/decide`.
- Backend authenticates user.
- Backend loads/decrypts the user's Ollama credential.
- Backend sends the relevant state + fields to Ollama Cloud.
- Backend validates structured output.
- Backend returns normalized `Decision` objects.
- No plaintext Ollama key is returned to the extension.

Prompt rules:
- Answer only from paper text and provided context.
- Never invent facts.
- If unsupported, return low confidence and explain why.
- Respect `maxLength`.
- Choose only from provided choice ids.
- Return JSON matching the expected schema.

### 13.3 Jev path (optional stretch)

Jev remains an optional typed-decision provider. It is not required for the initial architecture.

| Kinds | Engine |
|---|---|
| `radio`, `dropdown`, `listbox`, `checkboxList`, `repro`, `subjectArea` | Gemma 4 by default; Jev optional later |
| `text`, `textarea`, conflict domains | Gemma 4 |
| `agreement` | suggestion only; never auto-checked |
| iThenticate / TPMS | standing consent only |

If Jev is enabled later, a low-confidence typed decision may escalate to Gemma 4.

### 13.4 Confidence → UI

| Confidence | Behaviour |
|---|---|
| ≥ `green` (0.85) | Filled, green |
| `amber` ≤ c < `green` | Filled, amber, user review required |
| < `amber` | Red; leave empty or fill according to field type, user must confirm |
| declarations / failures | Red, never auto-acted |

Thresholds are starting values and must be tuned on real forms.

---

## 14. Messaging contracts

### Extension-internal

```ts
// popup → content
{ type: 'EXECUTE', paperId: string }

// content → service worker
{ type: 'DECIDE', paperId: string, schema: FormSchema }

// service worker → content
{ type: 'DECIDE_RESULT', answers: Record<string, Decision>, errors?: string[] }

// content → popup
{ type: 'STATUS', phase: string, done: number, total: number }

// popup → content
{ type: 'PING' }
```

### Extension → backend

```http
Authorization: Bearer <our_access_token>
Content-Type: application/json
```

```json
POST /api/v1/ai/decide
{
  "paper": { "title": "...", "abstract": "...", "keywords": [], "fullText": "..." },
  "conference": { "name": "...", "welcomeText": "..." },
  "fields": []
}
```

The extension does **not** send an Ollama `Authorization` header.

---

## 15. Manifest (sketch)

The extension needs CMT host access and our backend host access. It does **not** need Ollama Cloud host permissions.

```json
{
  "manifest_version": 3,
  "name": "CMT Autofill",
  "version": "0.1.0",
  "permissions": ["storage", "unlimitedStorage"],
  "host_permissions": [
    "https://cmt3.research.microsoft.com/*",
    "https://api.cmt-autofill.example/*"
  ],
  "background": {
    "service_worker": "dist/service-worker.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": [
      "https://cmt3.research.microsoft.com/*/Submission/Create*",
      "https://cmt3.research.microsoft.com/*/Track/*/Submission/Create*"
    ],
    "js": ["dist/content.js"],
    "run_at": "document_idle"
  }],
  "action": { "default_popup": "popup.html" },
  "options_page": "options.html"
}
```

Replace the example backend hostname with the real deployed API domain.

---

## 16. Backend security model

### 16.1 Encryption at rest

Do **not** "encode" the Ollama API key. Encoding (for example Base64) is reversible and offers no confidentiality.

For development:

```text
OLLAMA_KEY_ENCRYPTION_MASTER_KEY
        │
        ▼
AES-256-GCM (or equivalent authenticated encryption)
        │
        ▼
(ciphertext, nonce, key_version)
```

For production, protect the encryption root using a managed KMS/secret-management service. PostgreSQL stores ciphertext, not the root key.

### 16.2 Key use

```text
DB ciphertext
    ↓
decrypt in backend process
    ↓
short-lived in-memory plaintext
    ↓
HTTPS request to Ollama
    ↓
request complete
    ↓
plaintext leaves normal application scope
```

The implementation should avoid logging the key or inserting it into tracing metadata, exception messages, or analytics.

### 16.3 Request security

- HTTPS only outside local development.
- JWT/session validation on every protected API call.
- Per-user credential ownership checks.
- Rate limit `/ai/decide`.
- Restrict CORS to the extension origin and approved development origins.
- Validate payload size to prevent accidental huge paper uploads.
- Do not log paper text, full prompts, model outputs, or credentials by default.
- Add credential deletion and replacement endpoints.
- Treat the backend as a highly sensitive service because compromise could enable use of stored Ollama credentials.

---

## 17. Error handling

| Failure | Behaviour |
|---|---|
| Not on a CMT create form | Popup shows "Not on a CMT form"; Execute disabled |
| User not authenticated with backend | Prompt for sign-in |
| No Ollama credential configured | AI setup state shown; Execute disabled or limited to deterministic fields |
| Ollama credential invalid/expired | Backend marks credential invalid; extension asks user to update it |
| Backend unavailable | No model-decided fields are filled; show connection error |
| Ollama Cloud failure | Return safe error; do not partially apply invalid model data |
| Model response invalid | Backend rejects/normalizes; extension leaves affected fields unfilled |
| Form not rendered in 15 s | Abort with message |
| Field not found / wrong option | Row `failed` (red), continue |
| Author add fails | Row `failed`, continue with next author |
| File drop unsupported | Tell user to attach PDF manually |

---

## 18. Test plan

### Extension
1. CMT page detection.
2. DOM scraper fixture tests.
3. Knockout setter/event tests.
4. Author idempotency.
5. Review panel rendering.
6. Backend API mocking.

### Backend
1. Auth registration/login.
2. Password hashing/verification.
3. Ollama credential encryption/decryption.
4. Credential ownership/isolation between users.
5. Credential test endpoint.
6. Ollama provider request construction.
7. Model output validation.
8. `/ai/decide` authorization.
9. Rate limiting / payload limits.
10. Error mapping without secret leakage.

### End-to-end
1. Create account.
2. Save Ollama key.
3. Verify key status without exposing it.
4. Open CMT.
5. Execute with a mock backend response.
6. Execute with real Gemma 4 response.
7. Re-run and verify no duplicate authors.
8. Verify manual edits remain intact.
9. Verify Submit is never clicked.

---

## 19. Open items

- Rendered-DOM samples for subject areas / additional questions / repro checklist **[verify]**.
- Whether the synthetic file drop works.
- Exact Ollama Gemma 4 model identifier available to the user's account.
- Backend authentication UX for the extension.
- Production deployment target for Express/PostgreSQL.
- Production KMS/secret manager choice.
- Exact token refresh strategy for Chrome MV3.
- Jev API host, access status, exact question primitives, SDK compatibility.
- Exact author-add behaviour when `userInformationEntryRequiredForCoAuthor` is false.
- CMT Terms of Use on automation.
