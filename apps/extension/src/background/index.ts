/**
 * background/index.ts — MV3 Service Worker
 *
 * All LLM provider calls happen here. Content scripts, popup, and options page
 * communicate via typed chrome.runtime messages and never receive the API key.
 *
 * Message handlers (each returns true to keep async channel open):
 *   DECIDE          → ollamaProvider.decide(payload)
 *   EXTRACT_PDF     → ollamaProvider.extractPdf(payload.pdfBase64)
 *   TEST_CONNECTION → ollamaProvider.testConnection(payload.model)
 *
 * Security:
 *   - sender.id is validated against chrome.runtime.id on every message.
 *   - API keys are read from encrypted chrome.storage; they never appear
 *     in responses, logs, or error messages sent back to callers.
 */

import { DecideRequestSchema } from '@cmt-autofill/contracts';
import { ollamaProvider } from './ai-provider';

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[SW] auto-cmt extension installed / updated');
});

// ─────────────────────────────────────────────────────────────────────────────
// Message dispatcher
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Security: only accept messages from our own extension.
  // Rejects any web page that somehow gets chrome.runtime.sendMessage access.
  if (sender.id !== chrome.runtime.id) {
    console.warn('[SW] Rejected message from unexpected sender:', sender.id);
    return false;
  }

  if (message.type === 'DECIDE') {
    handleDecide(message.payload)
      .then(data => sendResponse({ status: 'success', data }))
      .catch(err => sendResponse({ status: 'error', error: err.message }));
    return true; // Keep async channel open
  }

  if (message.type === 'EXTRACT_PDF') {
    handleExtractPdf(message.payload)
      .then(data => sendResponse({ status: 'success', data }))
      .catch(err => sendResponse({ status: 'error', error: err.message }));
    return true;
  }

  if (message.type === 'TEST_CONNECTION') {
    handleTestConnection(message.payload)
      .then(data => sendResponse({ status: 'success', data }))
      .catch(err => sendResponse({ status: 'error', error: err.message }));
    return true;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

async function handleDecide(payload: unknown) {
  console.log('\n--------------------------------------------------');
  console.log('[SW] Incoming DECIDE message');

  // Validate payload with the same Zod schema the backend controller used
  const validated = DecideRequestSchema.parse(payload);
  console.log(`[SW] Payload validated for paper: "${validated.paper.title}"`);

  return ollamaProvider.decide(validated);
}

async function handleExtractPdf(payload: any) {
  console.log('\n--------------------------------------------------');
  console.log('[SW] Incoming EXTRACT_PDF message');

  const { pdfBase64 } = payload ?? {};
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    throw new Error('pdfBase64 is required and must be a string');
  }

  console.log(`[SW] Received PDF payload (base64 length: ${pdfBase64.length})`);
  return ollamaProvider.extractPdf(pdfBase64);
}

async function handleTestConnection(payload: any) {
  console.log('\n--------------------------------------------------');
  console.log('[SW] Incoming TEST_CONNECTION message');

  const model: string = payload?.model || 'gemma4:31b';
  console.log(`[SW] Testing connection with model: ${model}`);

  // Provider reads key from encrypted storage — never passed through messages
  return ollamaProvider.testConnection(model);
}
