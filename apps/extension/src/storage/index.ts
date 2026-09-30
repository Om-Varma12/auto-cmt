import { Author, Paper, ExtensionSettings } from './schemas';

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
  async getSettings(): Promise<ExtensionSettings> {
    const data = await chrome.storage.local.get('settings');
    return data.settings || { backendBaseUrl: 'http://localhost:3001' };
  },
  async saveSettings(settings: ExtensionSettings): Promise<void> {
    await chrome.storage.local.set({ settings });
  }
};
