import { storage } from '../storage';
import { Paper, Author } from './schemas';

export async function getSelectedPaper(): Promise<Paper | null> {
  const papers = await storage.getPapers();
  if (papers.length === 0) return null;

  const selectedId = await storage.getSelectedPaperId();
  if (selectedId) {
    const matched = papers.find(p => p.id === selectedId);
    if (matched) return matched;
  }

  // Default to first paper if no selectedId is set or found
  return papers[0];
}

export async function getAuthors(): Promise<Author[]> {
  const paper = await getSelectedPaper();
  if (!paper) return [];
  // Return the paper's own author list if available, or fallback to global authors store
  if (paper.authors && paper.authors.length > 0) {
    return paper.authors;
  }
  return await storage.getAuthors();
}
