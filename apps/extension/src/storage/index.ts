import { Author, Paper, ExtensionSettings } from '../shared/schemas';

export interface StoredPdfBase64 {
  base64: string;
  fileName: string;
  updatedAt: number;
}

export const storage = {
  async getAuthors(): Promise<Author[]> {
    const data = await chrome.storage.local.get('authors');
    return data.authors || [];
  },
  async saveAuthors(authors: Author[]): Promise<void> {
    await chrome.storage.local.set({ authors });
  },
  async getPapers(): Promise<Paper[]> {
    const data = await chrome.storage.local.get('papers');
    return data.papers || [];
  },
  async savePapers(papers: Paper[]): Promise<void> {
    await chrome.storage.local.set({ papers });
  },
  async getSelectedPaperId(): Promise<string | null> {
    const data = await chrome.storage.local.get('selectedPaperId');
    return data.selectedPaperId || null;
  },
  async setSelectedPaperId(selectedPaperId: string): Promise<void> {
    await chrome.storage.local.set({ selectedPaperId });
  },
  async getSettings(): Promise<ExtensionSettings> {
    const data = await chrome.storage.local.get('settings');
    return data.settings || { autoUploadPdf: false, modelName: 'gemma4:31b', rememberApiKey: true };
  },
  async saveSettings(settings: ExtensionSettings): Promise<void> {
    await chrome.storage.local.set({ settings });
  },

  // ── PDF base64 storage (works across all extension contexts) ─────────────
  async savePdfBase64(paperId: string, base64: string, fileName: string): Promise<void> {
    const payload: StoredPdfBase64 = { base64, fileName, updatedAt: Date.now() };
    const updates: Record<string, StoredPdfBase64> = {
      [`pdf_b64_${paperId}`]: payload,
      pdf_b64_active: payload,
    };
    await chrome.storage.local.set(updates);
  },

  async getPdfBase64(paperId?: string): Promise<StoredPdfBase64 | null> {
    const keys = paperId
      ? [`pdf_b64_${paperId}`, 'pdf_b64_active']
      : ['pdf_b64_active'];
    const data = await chrome.storage.local.get(keys);
    if (paperId && data[`pdf_b64_${paperId}`]?.base64) {
      return data[`pdf_b64_${paperId}`] as StoredPdfBase64;
    }
    if (data['pdf_b64_active']?.base64) {
      return data['pdf_b64_active'] as StoredPdfBase64;
    }
    return null;
  },

  async deletePdfBase64(paperId: string): Promise<void> {
    await chrome.storage.local.remove([`pdf_b64_${paperId}`, 'pdf_b64_active']);
  },
};
