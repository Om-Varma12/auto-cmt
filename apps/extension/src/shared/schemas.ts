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
  // [D4] backendBaseUrl removed — no server needed.
  // Old stored values with this field are silently stripped by Zod on parse.
  autoUploadPdf: z.boolean().default(true),
  modelName: z.string().default('gemma4:31b'),
  rememberApiKey: z.boolean().default(true),
});

export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;
