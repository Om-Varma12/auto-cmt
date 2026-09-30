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
  id: z.string(),
  title: z.string(),
  abstract: z.string(),
  keywords: z.array(z.string()).default([]),
  fullText: z.string().default(''),
  authors: z.array(AuthorSchema).default([]),
  primaryContactId: z.string().default(''),
  createdAt: z.number().default(() => Date.now()),
});

export type Paper = z.infer<typeof PaperSchema>;

export const ExtensionSettingsSchema = z.object({
  backendBaseUrl: z.string().url().default('http://localhost:3001'),
  autoUploadPdf: z.boolean().default(false),
});

export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;
