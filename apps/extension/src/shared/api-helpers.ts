import { storage } from '../storage';

export async function getSelectedPaper() {
  const papers = await storage.getPapers();
  if (papers.length === 0) return null;
  return papers[0]; // v1 simplification: just use the first paper
}

export async function getAuthors() {
  return await storage.getAuthors();
}
