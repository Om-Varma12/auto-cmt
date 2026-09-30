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
  keywords: z.array(z.string()).default([]),
  fullText: z.string().default(''),
  authorIds: z.array(z.string()).default([]),
  primaryContactId: z.string().default(''),
});

export type Paper = z.infer<typeof PaperSchema>;

export const ExtensionSettingsSchema = z.object({
  backendBaseUrl: z.string().url().default('http://localhost:3001'),
});

export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;
