import { z } from 'zod';

export const AuthorSchema = z.object({
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  organization: z.string(),
  countryCode: z.string(),
});

export type Author = z.infer<typeof AuthorSchema>;

export const PaperSchema = z.object({
  title: z.string(),
  abstract: z.string(),
  keywords: z.array(z.string()),
  fullText: z.string(),
  authorIds: z.array(z.string()),
  primaryContactId: z.string(),
});

export type Paper = z.infer<typeof PaperSchema>;

export const ExtensionSettingsSchema = z.object({
  backendBaseUrl: z.string().url().default('http://localhost:3001'),
});

export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;
