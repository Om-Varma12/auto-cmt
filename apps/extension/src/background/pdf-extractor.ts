/**
 * pdf-extractor.ts
 *
 * Browser-native PDF text extraction using pdfjs-dist (Mozilla PDF.js).
 * Replaces the Node-only 'pdf-parse' library used in the backend.
 *
 * [Deviation D1]: pdf-parse (Node.js) → pdfjs-dist (browser-native, no Node deps)
 * [Deviation D2]: Buffer.from(base64, 'base64') → Uint8Array.from(atob(...), ...)
 *
 * Chrome MV3 service workers cannot spawn sub-workers (new Worker(...) throws).
 * Setting GlobalWorkerOptions.workerSrc = '' disables the separate worker thread
 * and causes pdfjs-dist to run PDF parsing synchronously in the same thread.
 * This is slower than the worker mode but is required in SW context.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

// Attach pdfjsWorker to globalThis so PDF.js fake worker uses it in-memory
// without calling dynamic import(), which is disallowed in Service Worker context.
(globalThis as any).pdfjsWorker = pdfjsWorker;

/**
 * Extracts the text content of page 1 from a base64-encoded PDF.
 *
 * Mirrors the backend's behavior:
 *   const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
 *   const textResult = await parser.getText({ partial: [1] });
 *
 * @param base64 Raw base64 string of the PDF file (no data-URL prefix).
 * @returns Concatenated text of page 1.
 */
export async function extractTextFromPdfBase64(base64: string): Promise<string> {
  // [D2] Convert base64 → Uint8Array (replaces Node's Buffer.from(base64, 'base64'))
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    // Suppress console warnings about font/glyph issues that are non-fatal
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;

  try {
    // Extract page 1 only — same as backend behavior (partial: [1])
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();

    // Join all text items with a space separator
    const text = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');

    return text;
  } finally {
    await pdf.destroy();
  }
}
