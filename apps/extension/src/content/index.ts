import {
  fillTitleAndAbstract,
  fillAuthors,
  scrapeFormMeta,
  scrapeAdditionalQuestions,
  fillAdditionalQuestions,
} from './cmt-logic';
import { getSelectedPaper, getAuthors } from '../shared/api-helpers';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXECUTE') {
    console.log('[CONTENT] EXECUTE received — starting fill pipeline');
    runFillPipeline(sendResponse);
    return true; // keep async channel open
  }
});

async function runFillPipeline(sendResponse: (r: any) => void) {
  try {
    // ── Load stored data ──────────────────────────────────────────────────
    const [paper, authors] = await Promise.all([getSelectedPaper(), getAuthors()]);

    if (!paper) {
      sendResponse({ status: 'error', error: 'No paper found. Add a paper in extension options.' });
      return;
    }

    console.log(`[CONTENT] Loaded paper: "${paper.title}", authors: ${authors.length}`);

    // ── STEP 1 & 2: Deterministic fills (no LLM) ─────────────────────────
    console.log('[CONTENT] Step 1: Filling title & abstract...');
    await fillTitleAndAbstract(paper);

    console.log('[CONTENT] Step 2: Adding co-authors...');
    // Only add co-authors — the logged-in user is already author[0]
    const coAuthors = authors.filter(a => a.email !== paper.primaryContactId);
    await fillAuthors(coAuthors);

    // ── STEP 3: Scrape additional questions ───────────────────────────────
    console.log('[CONTENT] Step 3: Scraping additional questions for LLM...');
    const additionalFields = scrapeAdditionalQuestions();
    const meta = scrapeFormMeta();

    if (additionalFields.length === 0) {
      console.log('[CONTENT] No additional questions found. Done without LLM call.');
      sendResponse({ status: 'success', model: 'none (deterministic only)' });
      return;
    }

    console.log(`[CONTENT] Found ${additionalFields.length} additional fields — calling LLM via background...`);

    // ── STEP 4: LLM call (routed through background service worker) ───────
    const payload = {
      paper: {
        title: paper.title,
        abstract: paper.abstract,
        keywords: paper.keywords,
        fullText: paper.fullText,
      },
      conference: {
        name: meta.conference,
        welcomeText: meta.welcomeText,
      },
      fields: additionalFields,
      authorSummary: {
        emails: authors.map(a => a.email),
        organizations: authors.map(a => a.organization),
        domains: authors.map(a => a.organization),
      },
    };

    chrome.runtime.sendMessage({ type: 'DECIDE', payload }, (bgResponse) => {
      if (chrome.runtime.lastError) {
        sendResponse({ status: 'error', error: chrome.runtime.lastError.message });
        return;
      }

      if (bgResponse?.status !== 'success') {
        sendResponse({ status: 'error', error: bgResponse?.error || 'LLM request failed' });
        return;
      }

      // ── STEP 5: Fill additional questions with LLM answers ────────────
      console.log('[CONTENT] Step 5: Filling additional questions from LLM answers...');
      try {
        fillAdditionalQuestions(bgResponse.data.answers);
        sendResponse({ status: 'success', model: bgResponse.data.model });
      } catch (err: any) {
        sendResponse({ status: 'error', error: `Fill error: ${err.message}` });
      }
    });

  } catch (err: any) {
    console.error('[CONTENT] Pipeline error:', err);
    sendResponse({ status: 'error', error: err.message });
  }
}
