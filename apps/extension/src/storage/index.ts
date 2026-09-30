import { Author, Paper, ExtensionSettings } from '../shared/schemas';

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
    return data.settings || { backendBaseUrl: 'http://localhost:3001', autoUploadPdf: false };
  },
  async saveSettings(settings: ExtensionSettings): Promise<void> {
    await chrome.storage.local.set({ settings });
  }
};
