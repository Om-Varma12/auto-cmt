export type UploadResult = {
  status: 'uploaded' | 'disabled' | 'failed' | 'manual-required';
  method?: 'file-input' | 'drag-drop';
  message?: string;
};

/**
 * Creates a DataTransfer instance or a polyfilled container for Node/jsdom environments.
 */
function createDataTransfer() {
  if (typeof DataTransfer !== 'undefined') {
    return new DataTransfer();
  }
  const filesList: File[] = [];
  return {
    items: {
      add: (f: File) => filesList.push(f),
    },
    files: filesList as unknown as FileList,
  };
}

/**
 * Counts currently uploaded files displayed in CMT's DOM list.
 */
export function getUploadedFileCount(doc: Document = document): number {
  const list = doc.querySelectorAll('ul.inline-list > li, ul[data-bind*="foreach: files"] > li');
  return list.length;
}

/**
 * Checks if a file with matching name (or extension) is rendered in CMT's uploaded files list.
 */
export function isFileNameUploaded(fileName: string, doc: Document = document): boolean {
  const links = Array.from(doc.querySelectorAll('ul.inline-list a, ul[data-bind*="foreach: files"] a'));
  const lowerName = fileName.toLowerCase();
  return links.some(a => (a.textContent || '').toLowerCase().includes(lowerName));
}

/**
 * Polls the DOM until upload success is verified or timeout occurs.
 */
export function waitForUploadSuccess(
  initialCount: number,
  fileName: string,
  timeoutMs = 5000,
  doc: Document = document
): Promise<boolean> {
  return new Promise(resolve => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const currentCount = getUploadedFileCount(doc);
      const nameMatch = isFileNameUploaded(fileName, doc);

      if (currentCount > initialCount || nameMatch) {
        clearInterval(interval);
        resolve(true);
        return;
      }

      if (Date.now() - startTime >= timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 150);
  });
}

/**
 * Helper to safely create synthetic DragEvents without throwing TypeError on read-only dataTransfer getter.
 */
function createSyntheticDragEvent(type: string, dataTransfer: any): Event {
  let evt: Event;
  try {
    evt = new DragEvent(type, { bubbles: true, cancelable: true });
  } catch (_e) {
    evt = new Event(type, { bubbles: true, cancelable: true });
  }

  try {
    Object.defineProperty(evt, 'dataTransfer', {
      value: dataTransfer,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch (_e) {
    (evt as any).dataTransfer = dataTransfer;
  }

  return evt;
}

/**
 * Strategy 1: Upload via CMT's file input (`#submissionFormFile` or dynamic input)
 * Uses DataTransfer to assign input.files and dispatches native 'change' event.
 */
async function tryFileInputUpload(
  file: File,
  initialCount: number,
  doc: Document,
  timeoutMs = 5000
): Promise<boolean> {
  let fileInput = doc.querySelector<HTMLInputElement>(
    '#submissionFormFile, input[type="file"][id*="File"], input[type="file"]'
  );

  // If input not immediately in DOM, click "Upload from Computer" button inside drop box to trigger Knockout input creation
  if (!fileInput) {
    const uploadBtn = doc.querySelector<HTMLButtonElement>(
      '#fileDropBox button, button[data-bind*="uploadFile"]'
    );
    if (uploadBtn) {
      console.log('[PDF UPLOADER] File input not immediately in DOM. Triggering "Upload from Computer" button...');
      try {
        uploadBtn.click();
        await new Promise(r => setTimeout(r, 200));
        fileInput = doc.querySelector<HTMLInputElement>('input[type="file"]');
      } catch (_e) {
        // continue to check fallback
      }
    }
  }

  if (!fileInput) {
    console.warn('[PDF UPLOADER] File input (#submissionFormFile) not found in DOM');
    return false;
  }

  try {
    const dataTransfer = createDataTransfer();
    dataTransfer.items.add(file);

    try {
      fileInput.files = dataTransfer.files as FileList;
    } catch (_e) {
      Object.defineProperty(fileInput, 'files', {
        value: dataTransfer.files,
        writable: true,
        configurable: true,
      });
    }

    fileInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

    console.log('[PDF UPLOADER] Dispatched change event on file input, verifying DOM upload success...');
    return await waitForUploadSuccess(initialCount, file.name, timeoutMs, doc);
  } catch (err: any) {
    console.warn(`[PDF UPLOADER] File input strategy error: ${err.message}`);
    return false;
  }
}

/**
 * Strategy 2: Upload via CMT's Drag & Drop area (`#fileDropBox`)
 * Constructs DataTransfer and dispatches synthetic 'dragenter', 'dragover', and 'drop' events.
 */
async function tryDragDropUpload(
  file: File,
  initialCount: number,
  doc: Document,
  timeoutMs = 5000
): Promise<boolean> {
  const dropBox = doc.querySelector<HTMLElement>('#fileDropBox, .dropTarget');
  if (!dropBox) {
    console.warn('[PDF UPLOADER] Drop target (#fileDropBox) not found in DOM');
    return false;
  }

  try {
    const dataTransfer = createDataTransfer();
    dataTransfer.items.add(file);

    const dragEnterEvent = createSyntheticDragEvent('dragenter', dataTransfer);
    dropBox.dispatchEvent(dragEnterEvent);

    const dragOverEvent = createSyntheticDragEvent('dragover', dataTransfer);
    dropBox.dispatchEvent(dragOverEvent);

    const dropEvent = createSyntheticDragEvent('drop', dataTransfer);
    dropBox.dispatchEvent(dropEvent);

    console.log('[PDF UPLOADER] Dispatched drag & drop events on drop target, verifying DOM upload success...');
    return await waitForUploadSuccess(initialCount, file.name, timeoutMs, doc);
  } catch (err: any) {
    console.warn(`[PDF UPLOADER] Drag & drop strategy error: ${err.message}`);
    return false;
  }
}

/**
 * Main entry point: Attempts to upload PDF directly to CMT form.
 * Tries file-input strategy first, falls back to drag & drop strategy.
 * Returns structured UploadResult indicating status and method used.
 */
export async function uploadPdfToCmt(
  file: File,
  doc: Document = document,
  timeoutMs = 5000
): Promise<UploadResult> {
  const initialCount = getUploadedFileCount(doc);

  if (isFileNameUploaded(file.name, doc)) {
    return {
      status: 'uploaded',
      method: 'file-input',
      message: `PDF file "${file.name}" is already present in submission files.`,
    };
  }

  console.log(`[PDF UPLOADER] Starting upload pipeline for file: "${file.name}" (size: ${file.size} bytes)`);

  const fileInputSuccess = await tryFileInputUpload(file, initialCount, doc, timeoutMs);
  if (fileInputSuccess) {
    console.log('[PDF UPLOADER] Upload SUCCESS via file input');
    return {
      status: 'uploaded',
      method: 'file-input',
      message: `PDF "${file.name}" attached successfully via file input.`,
    };
  }

  console.warn('[PDF UPLOADER] File input strategy failed or timed out. Trying Drag & Drop fallback...');

  const dragDropSuccess = await tryDragDropUpload(file, initialCount, doc, timeoutMs);
  if (dragDropSuccess) {
    console.log('[PDF UPLOADER] Upload SUCCESS via Drag & Drop');
    return {
      status: 'uploaded',
      method: 'drag-drop',
      message: `PDF "${file.name}" attached successfully via Drag & Drop.`,
    };
  }

  console.error('[PDF UPLOADER] Both file input and drag-drop upload strategies failed.');
  return {
    status: 'failed',
    message: 'PDF could not be attached automatically. Please upload it manually.',
  };
}
