import {
  fillTitleAndAbstract,
  fillAuthors,
  scrapeFormMeta,
  scrapeAdditionalQuestions,
  fillAdditionalQuestions,
} from './cmt-logic';
import { getSelectedPaper, getAuthors } from '../shared/api-helpers';
import { storage } from '../storage';
import { uploadPdfToCmt, UploadResult } from './pdf-uploader';

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
    const [paper, authors, settings] = await Promise.all([
      getSelectedPaper(),
      getAuthors(),
      storage.getSettings(),
    ]);

    if (!paper) {
      sendResponse({ status: 'error', error: 'No paper found. Upload a paper PDF in extension options.' });
      return;
    }

    console.log(`[CONTENT] Loaded paper: "${paper.title}", authors: ${authors.length}`);

    // ── STEP 1 & 2: Deterministic fills (no LLM) ─────────────────────────
    console.log('[CONTENT] Step 1: Filling title & abstract...');
    await fillTitleAndAbstract(paper);

    console.log('[CONTENT] Step 2: Adding co-authors...');
    const coAuthors = authors.filter(a => a.email !== paper.primaryContactId);
    await fillAuthors(coAuthors);

    // ── STEP 3: Automatic PDF Attachment (Controlled by autoUploadPdf setting)
    let pdfResult: UploadResult = { status: 'disabled' };
    if (!settings.autoUploadPdf) {
      console.log('[CONTENT] PDF auto-upload is OFF in settings.');
      pdfResult = {
        status: 'disabled',
        message: 'PDF auto-upload is OFF. Please upload PDF manually.',
      };
    } else {
      console.log(`[CONTENT] PDF auto-upload is ON — attempting to attach PDF for paper ID: ${paper.id}...`);
      // Read from chrome.storage.local (reliably shared across all extension contexts)
      const storedPdf = await storage.getPdfBase64(paper.id).catch(() => null);
      if (!storedPdf || !storedPdf.base64) {
        console.warn('[CONTENT] No PDF base64 found in storage for paper:', paper.id);
        pdfResult = {
          status: 'manual-required',
          message: 'PDF could not be attached automatically. Please upload it manually.',
        };
      } else {
        // Convert base64 → Uint8Array → Blob → File
        const binary = atob(storedPdf.base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const file = new File([blob], storedPdf.fileName, { type: 'application/pdf' });
        pdfResult = await uploadPdfToCmt(file);
      }
    }

    if (pdfResult.status === 'uploaded') {
      console.log(`[CONTENT] ✅ PDF Attachment Success: ${pdfResult.message} (${pdfResult.method})`);
    } else if (pdfResult.status === 'failed' || pdfResult.status === 'manual-required') {
      console.warn(`[CONTENT] ⚠️ PDF Attachment Warning: PDF could not be attached automatically. Please upload it manually.`);
    }

    // ── STEP 4: Scrape additional questions for LLM ────────────────────────
    console.log('[CONTENT] Step 4: Scraping additional questions for LLM...');
    const additionalFields = scrapeAdditionalQuestions();
    const meta = scrapeFormMeta();

    if (additionalFields.length === 0) {
      console.log('[CONTENT] No additional questions found. Done without LLM call.');
      sendResponse({
        status: 'success',
        model: 'none (deterministic only)',
        pdfUpload: pdfResult,
      });
      return;
    }

    console.log(`[CONTENT] Found ${additionalFields.length} additional fields — calling LLM via background...`);

    // ── STEP 5: LLM call (routed through background service worker) ───────
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
        sendResponse({ status: 'error', error: chrome.runtime.lastError.message, pdfUpload: pdfResult });
        return;
      }

      if (bgResponse?.status !== 'success') {
        sendResponse({ status: 'error', error: bgResponse?.error || 'LLM request failed', pdfUpload: pdfResult });
        return;
      }

      // ── STEP 6: Fill additional questions with LLM answers ────────────
      console.log('[CONTENT] Step 6: Filling additional questions from LLM answers...');
      try {
        fillAdditionalQuestions(bgResponse.data.answers);
        sendResponse({
          status: 'success',
          model: bgResponse.data.model,
          pdfUpload: pdfResult,
        });
      } catch (err: any) {
        sendResponse({ status: 'error', error: `Fill error: ${err.message}`, pdfUpload: pdfResult });
      }
    });

  } catch (err: any) {
    console.error('[CONTENT] Pipeline error:', err);
    sendResponse({ status: 'error', error: err.message });
  }
}
