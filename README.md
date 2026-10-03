# auto-cmt (CMT Autofill Chrome Extension)

A Chrome extension (Manifest V3) that automates paper submission form filling on Microsoft CMT (Conference Management Toolkit). It extracts metadata from paper PDFs and uses AI models to intelligently answer form fields.

## Architecture

This project is **100% frontend-only**. No backend server is required.

All AI logic, PDF parsing, and model requests run directly inside the Chrome Extension's **MV3 Service Worker**.

```
[Options Page UI] ──(AES-GCM-256)──> [chrome.storage.local / session]
                                              │
[CMT Page (Content Script)] ──(chrome.runtime)──> [Service Worker]
                                                      ├─ pdfjs-dist (Page 1 PDF parsing)
                                                      ├─ Ollama Cloud API (https://ollama.com/api/chat)
                                                      └─ Tavily Web Search API (https://api.tavily.com/search)
```

## Features

- **📄 Research Paper Library**: Upload paper PDFs to extract title, abstract, and authors automatically using AI.
- **⚡ Fast CMT Auto-Fill**: Fills paper title, abstract, co-authors, and answers conference-specific additional questions on CMT form.
- **🔑 Bring Your Own Keys**: Configure your own Ollama Cloud API Key (and optional Tavily API key for web search) in the Options page.
- **🔒 AES-GCM-256 Encrypted Key Storage**: API keys are encrypted at rest in local browser storage using Web Crypto API. Option to keep keys in session memory only.
- **📁 Optional Auto PDF Attachment**: Automatically attaches paper PDF file to the CMT submission form during execution.

## Setup & Loading Unpacked Extension

### 1. Build the Extension
```bash
npm install
npm run build
```

This compiles the extension into `apps/extension/dist`.

### 2. Load in Chrome
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (top right toggle).
3. Click **Load unpacked**.
4. Select the `apps/extension/dist` folder.

### 3. Configure API Keys
1. Click the extension icon and open **Options** (or right-click extension -> Options).
2. Enter your **Ollama Cloud API Key** (from [ollama.com](https://ollama.com)).
3. (Optional) Enter your **Tavily API Key** for web search context (from [tavily.com](https://tavily.com)).
4. Click **Test API Connection** to verify setup.

## Data & Security Model

- **No Remote Servers**: Requests go directly from your browser to Ollama Cloud and Tavily APIs. No intermediate servers or proxy APIs are used.
- **Least-Privilege Host Permissions**: Manifest host permissions are restricted exclusively to `https://cmt3.research.microsoft.com/*`, `https://ollama.com/*`, and `https://api.tavily.com/*`.
- **Isolated Credentials**: API keys are held strictly within background context and never passed back to content scripts or rendered DOM pages.