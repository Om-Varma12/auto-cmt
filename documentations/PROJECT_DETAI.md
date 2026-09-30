# CMT Autofill — Project Detail

> Working title. Full-stack monorepo with a Chrome extension frontend and a Node/Express backend service that fills Microsoft CMT paper-submission forms using the user's Ollama Cloud API key and Gemma 4, then hands control back to the user to review and submit.

---

## 1. Summary

Microsoft CMT (`cmt3.research.microsoft.com`) hosts submissions for a large number of academic conferences. Every conference asks for mostly the same information (title, abstract, authors, subject areas, declarations), but each form is configured differently by its chairs. Authors retype the same data for every submission.

This project is a browser extension backed by a web API that:

1. Stores the user's authors and papers in the extension/browser where practical.
2. On a CMT "Create Submission" page, reads the live form and converts it into a structured schema.
3. Sends the paper context + form schema to **our backend**.
4. Our backend retrieves the user's encrypted Ollama Cloud API key and calls **Ollama Cloud / Gemma 4** directly.
5. The backend returns validated structured answers to the extension.
6. The extension fills the CMT form and shows a review layer with confidence and reasoning.
7. The extension **never clicks Submit**; the user does.

There is **no local Ollama requirement**. Users never need to install or run Ollama on their machine.

---

## 2. Problem

- Same data re-entered for every conference.
- Forms differ per conference (abstract on/off, subject areas, conflict domains, iThenticate/TPMS consent, custom "Additional Questions", reproducibility checklist), so a hardcoded filler breaks.
- Existing tools (e.g. `arya2004/cmt-autofill`) only fill the author table from up to 4 saved authors and are hardcoded to the create-submission URL. Nothing found that reads the form semantically or answers custom questions from the paper.

---

## 3. Goals and non-goals

### Goals (v1)
- One click: pick a paper → Execute → whole form filled.
- Works across different CMT conferences/tracks without per-conference code.
- Answers unexpected/custom questions by reasoning over the full paper text.
- Transparent preview: user sees every value, its confidence, and the reason.
- Backend handles Ollama Cloud communication; the extension never talks directly to Ollama Cloud.
- User's Ollama Cloud API key is encrypted at rest and is never returned to the extension after setup.
- Usable by the project owner first, with an architecture that can support multiple users later.

### Non-goals (v1)
- Auto-submitting. Ever.
- Reviewer/meta-reviewer/chair roles.
- Edit-submission and camera-ready flows (Create page only).
- Other platforms (EasyChair, OpenReview, HotCRP).
- Local Ollama inference.
- Per-user model hosting by our infrastructure.
- Publishing to the Chrome Web Store.

---

## 4. Users

**Primary:** an author submitting the same/similar papers to many CMT conferences. The user installs the extension, creates an account with our backend, and provides their own Ollama Cloud API key.

**Later:** other researchers and labs submitting many papers.

---

## 5. Requirements

### Functional
| ID | Requirement |
|---|---|
| FR1 | User selects which paper to submit; clicking **Execute** automatically fills the supported submission form. |
| FR2 | User provides author information and the entire paper so unexpected questions can be answered from the paper. |
| FR3 | Nothing is submitted directly. The user previews the filled form and then submits using CMT. |
| FR4 | Delivered as a browser extension. |
| FR5 | Extension authenticates against our backend before AI-assisted filling. |
| FR6 | User supplies an Ollama Cloud API key; our backend encrypts and stores it. |
| FR7 | Backend uses the user's Ollama Cloud credential to call Gemma 4 and returns structured answers. |
| FR8 | Extension never receives or stores the user's plaintext Ollama Cloud API key after initial credential setup. |

### Derived requirements
| ID | Requirement |
|---|---|
| D1 | Legal/declaration checkboxes (iThenticate, TPMS, "I agree" questions) are not decided by a model. iThenticate/TPMS follow user-set standing consents; agreement questions are proposal-only. |
| D2 | Re-running Execute must be idempotent (no duplicate authors). |
| D3 | Each model-filled field carries a confidence level and a short reason. |
| D4 | Model access is behind one `decide()` interface so providers can be swapped. |
| D5 | Ollama credentials are encrypted at rest on the backend; plaintext secrets exist only in memory for the duration of the provider call. |
| D6 | Paper text is sent to our backend only when an AI decision is requested; it should not be persisted by default. |
| D7 | The final CMT Submit control is never programmatically clicked. |

---

## 6. Technology stack

### Extension frontend
- **Chrome Manifest V3**
- **TypeScript**
- **React** for popup, options, authentication/settings, and review-panel UI
- **Vite + `@crxjs/vite-plugin`** for development/builds
- **Plain TypeScript/DOM APIs** for CMT scraping and filling
- **Zod** for request/response validation
- **`pdfjs-dist`** for local PDF text extraction
- **Vitest + ESLint + Prettier**

### Backend
- **Node.js (current LTS)**
- **TypeScript**
- **Express 5** for the API service
- **Zod** for request/response validation (shared with the extension where practical)
- **Prisma** for PostgreSQL access and migrations
- **PostgreSQL** for users and encrypted Ollama credentials
- **native `fetch`** for Ollama Cloud HTTP calls
- **`node:crypto`** for application-level authenticated encryption of stored Ollama credentials
- **Argon2id** for password hashing if using application-managed credentials
- **JWT access tokens** for extension/backend authentication

### Monorepo
- **pnpm workspaces** for package management
- **Turborepo** for build/test/lint task orchestration and caching
- **Shared packages** for API contracts, validation schemas, and common TypeScript types

### AI
- **Primary brain:** Ollama Cloud with Gemma 4
- **Backend → Ollama:** direct HTTPS API request to `https://ollama.com/api/chat`
- **Default cloud model:** configure a Gemma 4 cloud model (for example `gemma4:31b`); keep it configurable rather than hardcoding a permanent model name.
- **Optional later provider:** Jev for typed boolean/choice decisions

### Infrastructure
- **Development:** extension + Express API locally + PostgreSQL locally/containerized
- **Deployment:** containerized Node/Express backend + managed PostgreSQL
- **Production secret protection:** KMS/Secrets Manager or equivalent for the backend encryption root key; do not rely on plain source-controlled secrets.

Ollama's current documentation states that direct cloud API requests use `https://ollama.com/api`, require an API key, and recommend keeping that key out of browser code. The backend therefore owns all Ollama Cloud authentication. citeturn877912view0turn877912view1

**Backend language decision:** Node.js + TypeScript + Express is the chosen backend stack. The project does not need Python-specific AI tooling because the backend is primarily an authenticated API gateway, credential manager, validation layer, and Ollama Cloud client. Using TypeScript across the extension, backend, and shared packages also lets us share API contracts and validation schemas. Express 5 is intentionally lightweight and leaves application structure to the project rather than imposing a large framework.

---

## 7. High-level architecture

```text
                         USER'S MACHINE
┌────────────────────────────────────────────────────────────┐
│                                                            │
│  Chrome                                                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ CMT Autofill Extension                               │  │
│  │                                                      │  │
│  │ Popup / Options / Review UI                          │  │
│  │ CMT Content Script                                   │  │
│  │ Local paper + author storage                         │  │
│  │ PDF text extraction                                  │  │
│  └──────────────────────────┬───────────────────────────┘  │
│                             │ HTTPS                        │
└─────────────────────────────┼──────────────────────────────┘
                              ▼
                   ┌─────────────────────┐
                   │ Our Backend         │
                   │ Node.js + Express   │
                   │                     │
                   │ Auth                │
                   │ AI orchestration    │
                   │ Key encryption      │
                   │ Request validation  │
                   └──────────┬──────────┘
                              │
                    decrypt key in memory
                              │
                              ▼
                   ┌─────────────────────┐
                   │ Ollama Cloud        │
                   │ Gemma 4             │
                   └─────────────────────┘
                              │
                              ▼
                         structured JSON
                              │
                              ▼
                       Backend → Extension
                              │
                              ▼
                         CMT form filled
                              │
                              ▼
                            HUMAN
                              │
                              ▼
                      CMT Submit button
```

Our backend is an application/API layer. **Ollama Cloud is an external model provider, not our own model server.**

---

## 8. Data ownership and flow

### Stored in the extension by default
- Authors
- Paper metadata
- Full paper text
- PDF bytes
- Standing consents
- Backend session/auth token as needed

### Stored in our backend
- User account
- Encrypted Ollama Cloud API credential
- Minimal account/settings metadata
- Optional audit/usage metadata if explicitly added later

### Sent transiently to the backend
- Selected paper text / metadata needed for the current decision
- Current CMT form schema
- Conference context

### Sent from backend to Ollama Cloud
- The same AI decision payload needed for the current request
- Structured output request

The backend should **not persist paper text or model prompts/responses by default**. If observability is added later, redact or explicitly opt into sensitive data logging.

---

## 9. User flow

### One-time setup
1. Install extension.
2. Sign in / create account with our backend.
3. Add authors.
4. Add a paper: upload PDF (text extracted locally) or paste text; confirm title / abstract / keywords; choose ordered authors + primary contact.
5. Open **AI Settings** and enter Ollama Cloud API key.
6. Backend validates the key by making a safe test request, then encrypts and stores it.
7. User selects a Gemma 4 model supported by their Ollama account (or uses our default).
8. Set standing consents (iThenticate, TPMS).

### Per submission
1. Open CMT → conference → "Create new submission".
2. Click the extension icon → popup detects the conference.
3. Pick paper → Execute.
4. Content script scrapes the live CMT form.
5. Extension sends `{paper, formSchema, conferenceContext}` to our backend.
6. Backend loads and decrypts the user's Ollama credential in memory.
7. Backend calls Ollama Cloud / Gemma 4.
8. Backend validates the model output and returns structured answers.
9. Extension fills the form and shows the review panel.
10. User fixes amber/red fields.
11. User clicks CMT's own Submit button.

---

## 10. Scope by phase

### v1 — working full-stack personal build
- Create-submission page only, role Author.
- Fields: title, abstract (if present), authors (+ primary contact), conflict domains, subject areas, additional questions, reproducibility checklist, iThenticate/TPMS via standing consent.
- Backend authentication.
- Encrypted Ollama Cloud API key storage.
- Gemma 4 via backend/Ollama Cloud with structured JSON output.
- Review panel with confidence colours.
- Options page + popup.

### v1 stretch
- Optional Jev for boolean/choice fields with confidence-based escalation to Gemma 4.
- Synthetic drag-and-drop of the PDF into CMT's upload box (experimental).
- Basic usage/error telemetry without sensitive paper contents.

### Later
- Edit-submission / camera-ready pages.
- Multiple profiles.
- Per-conference memory.
- Firefox build; Web Store packaging.
- Other conference systems.
- Job queue / async inference for very large papers or long-running workflows.

---

## 11. Key design decisions

| Decision | Rationale |
|---|---|
| Browser extension + backend | Extension needs the user's logged-in CMT session and live DOM; backend centralizes authenticated AI access and secret handling. |
| Never use local Ollama | User should not install/run Ollama; all inference uses Ollama Cloud. |
| Backend owns Ollama API key | Ollama recommends keeping API keys out of browser code. The backend can encrypt and control access. |
| Encrypt, don't encode | Base64/encoding is reversible and is not secret protection. Use authenticated encryption and a protected key-encryption root. |
| Preview = real filled form + side panel | Cheapest way to satisfy FR3 while keeping the human in control. |
| Hybrid authors + LLM | Author mechanics are deterministic; model reasoning is reserved for judgment-based fields. |
| Full paper text in the prompt for v1 | Simpler than adding RAG; revisit when context size or cost becomes a problem. |
| Model access behind `decide()` | Keeps Gemma 4/other providers replaceable. |
| Consent fields are user-controlled | They are legal authorisations, not inference problems. |
| Paper data remains primarily client-side | Reduces backend data retention; backend processes paper context transiently for AI calls. |

---

## 12. Risks and open questions

| # | Risk / question | Mitigation |
|---|---|---|
| 1 | CMT is a Knockout.js app; naive `.value=` or `.checked=` doesn't update its model. | Use native setters + events; click checkboxes/radios. See TECHNICAL.md. |
| 2 | Only one sample form seen (no subject areas / additional questions / repro checklist rendered). | Get rendered-DOM samples from conferences that use them before trusting those paths. |
| 3 | PDF upload via synthetic drop may not work, and uploads immediately to CMT. | Keep optional; manual drag-in as fallback. |
| 4 | Unpublished paper text passes through our backend and Ollama Cloud during AI requests. | Clear privacy disclosure; do not persist prompts/results by default. |
| 5 | User Ollama credential is highly sensitive. | Encrypt at rest; protect encryption root; never return plaintext key to client; redact logs. |
| 6 | Compromised backend could potentially use stored credentials. | Strong backend auth, least privilege, encryption, secret rotation/revocation support, rate limiting, audit logs. |
| 7 | Hallucinated answers to declarations or reproducibility questions. | Answer only from paper; unknown → low confidence/red; declarations never auto-checked. |
| 8 | Jev is an optional hosted decision provider. | Keep Jev behind the provider interface; Gemma 4 must work end to end without it. |
| 9 | CMT Terms of Use regarding automation not reviewed. | Personal use, user-in-the-loop, no auto-submit; review terms before sharing. |

---

## 13. Success criteria (v1)

- On a real CMT create-submission form, a single Execute fills all supported fields with no console errors.
- Re-running does not duplicate authors or overwrite manual edits without warning.
- Every filled field appears in the panel with value, confidence, and reason.
- Backend successfully authenticates the user and invokes Ollama Cloud using the stored credential.
- Ollama Cloud API key is never exposed to the extension after setup and is never committed to source control.
- No path in the code clicks the final Submit button.
- Paper prompts/responses are not persisted by default.
- Total time for a new submission (after one-time setup) is well under the manual time.

---

## 14. Milestones

| Phase | Deliverable |
|---|---|
| Phase 1 | Extension shell: MV3, React/Vite/CRXJS, popup/options/content script |
| Phase 2 | Backend shell: Express, PostgreSQL, migrations, health endpoint |
| Phase 3 | Backend authentication + user model |
| Phase 4 | Ollama API-key setup, encryption, and safe connection test |
| Phase 5 | CMT DOM scraper and `FormSchema` |
| Phase 6 | `/ai/decide` backend endpoint + Gemma 4 structured output + Zod/Pydantic validation |
| Phase 7 | Deterministic CMT filler + author flow |
| Phase 8 | Review panel + confidence/reason display |
| Phase 9 | Multi-form testing + error handling + security pass |
