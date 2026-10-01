// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import {
  uploadPdfToCmt,
  getUploadedFileCount,
  isFileNameUploaded,
} from '../content/pdf-uploader';

describe('PDF Uploader Module', () => {
  let doc: Document;

  beforeEach(() => {
    // Create a fresh jsdom document for each test
    doc = document.implementation.createHTMLDocument('CMT Test');
    doc.body.innerHTML = `
      <div id="submissionForm">
        <ul class="inline-list"></ul>
      </div>
    `;
  });

  it('1. Correctly creates a File object from a Blob preserving filename and MIME type', () => {
    const pdfBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
    const fileName = 'my_research_paper.pdf';
    const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

    expect(file.name).toBe('my_research_paper.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBeGreaterThan(0);
  });

  it('2. Correctly counts uploaded files and detects filename presence in DOM', () => {
    expect(getUploadedFileCount(doc)).toBe(0);

    const ul = doc.querySelector('ul.inline-list')!;
    ul.innerHTML = '<li><a href="#">my_research_paper.pdf</a></li>';

    expect(getUploadedFileCount(doc)).toBe(1);
    expect(isFileNameUploaded('my_research_paper.pdf', doc)).toBe(true);
    expect(isFileNameUploaded('other_paper.pdf', doc)).toBe(false);
  });

  it('3. Returns uploaded immediately if file is already present in DOM', async () => {
    const ul = doc.querySelector('ul.inline-list')!;
    ul.innerHTML = '<li><a href="#">my_paper.pdf</a></li>';

    const file = new File([new Blob(['test'])], 'my_paper.pdf', { type: 'application/pdf' });
    const result = await uploadPdfToCmt(file, doc);

    expect(result.status).toBe('uploaded');
    expect(result.method).toBe('file-input');
  });

  it('4. Successfully uploads via Strategy 1 (file-input #submissionFormFile)', async () => {
    const form = doc.createElement('form');
    const input = doc.createElement('input');
    input.type = 'file';
    input.id = 'submissionFormFile';

    // Mock change listener simulating CMT Knockout upload handling
    input.addEventListener('change', () => {
      const ul = doc.querySelector('ul.inline-list')!;
      ul.innerHTML = '<li><a href="#">sample_paper.pdf</a></li>';
    });

    form.appendChild(input);
    doc.body.appendChild(form);

    const file = new File([new Blob(['pdf bytes'])], 'sample_paper.pdf', { type: 'application/pdf' });
    const result = await uploadPdfToCmt(file, doc);

    expect(result.status).toBe('uploaded');
    expect(result.method).toBe('file-input');
    expect(result.message).toContain('sample_paper.pdf');
  });

  it('5. Falls back to Strategy 2 (drag-drop #fileDropBox) when file-input is missing or fails', async () => {
    const dropBox = doc.createElement('div');
    dropBox.id = 'fileDropBox';
    dropBox.className = 'dropTarget';

    // Mock drop listener simulating CMT Knockout drag-drop handler
    dropBox.addEventListener('drop', () => {
      const ul = doc.querySelector('ul.inline-list')!;
      ul.innerHTML = '<li><a href="#">drag_dropped_paper.pdf</a></li>';
    });

    doc.body.appendChild(dropBox);

    const file = new File([new Blob(['pdf bytes'])], 'drag_dropped_paper.pdf', { type: 'application/pdf' });
    const result = await uploadPdfToCmt(file, doc);

    expect(result.status).toBe('uploaded');
    expect(result.method).toBe('drag-drop');
    expect(result.message).toContain('drag_dropped_paper.pdf');
  });

  it('6. Gracefully handles complete failure when both file-input and drag-drop fail', async () => {
    const file = new File([new Blob(['pdf bytes'])], 'failed_paper.pdf', { type: 'application/pdf' });
    const result = await uploadPdfToCmt(file, doc, 150);

    expect(result.status).toBe('failed');
    expect(result.message).toBe('PDF could not be attached automatically. Please upload it manually.');
  });
});
