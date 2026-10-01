const DB_NAME = 'cmt_autofill_db';
const DB_VERSION = 1;
const STORE_NAME = 'pdf_store';
const DEFAULT_KEY = 'active_paper_pdf';

export interface StoredPdf {
  blob: Blob;
  fileName: string;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePdfBlob(paperId: string, blob: Blob, fileName: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const data: StoredPdf = {
      blob,
      fileName,
      updatedAt: Date.now(),
    };
    // Save under paperId as well as DEFAULT_KEY for backwards compatibility
    store.put(data, paperId);
    const req = store.put(data, DEFAULT_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPdfBlob(paperId?: string): Promise<StoredPdf | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const keyToUse = paperId || DEFAULT_KEY;
    const req = store.get(keyToUse);
    req.onsuccess = () => {
      if (req.result) {
        resolve(req.result);
      } else if (paperId && paperId !== DEFAULT_KEY) {
        // Fallback to DEFAULT_KEY if specific paperId is not found
        const fallbackReq = store.get(DEFAULT_KEY);
        fallbackReq.onsuccess = () => resolve(fallbackReq.result || null);
        fallbackReq.onerror = () => resolve(null);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deletePdfBlob(paperId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(paperId);
    const req = store.delete(DEFAULT_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
