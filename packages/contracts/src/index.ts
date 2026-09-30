import { z } from 'zod';

// --- Form Schema (What the extension scrapes from CMT) ---

export const FieldKindSchema = z.enum([
  'text',
  'textarea',
  'radio',
  'dropdown',
  'listbox',
  'checkboxList',
  'agreement',
  'repro',
  'subjectArea'
]);

export type FieldKind = z.infer<typeof FieldKindSchema>;

export const FieldSchema = z.object({
  id: z.string(),
  kind: FieldKindSchema,
  label: z.string(),
  details: z.string().optional(),
  required: z.boolean(),
  maxLength: z.number().optional(),
  choices: z.array(z.object({
    id: z.string(),
    text: z.string()
  })).optional(),
  current: z.union([z.string(), z.array(z.string()), z.boolean(), z.null()]).optional(),
});

export type FieldSchemaType = z.infer<typeof FieldSchema>;

export const FormSchema = z.object({
  conference: z.string(),
  welcomeText: z.string(),
  fields: z.array(FieldSchema),
  authorsPresent: z.array(z.string()),
});

export type FormSchemaType = z.infer<typeof FormSchema>;

// --- AI Decision Schema (What the backend returns) ---

export const DecisionSchema = z.object({
  value: z.any(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
  engine: z.enum(['ollama', 'jev']),
  model: z.string().optional(),
  escalated: z.boolean().optional(),
});

export type Decision = z.infer<typeof DecisionSchema>;

export const DecideRequestSchema = z.object({
  paper: z.object({
    title: z.string(),
    abstract: z.string(),
    keywords: z.array(z.string()),
    fullText: z.string(),
  }),
  conference: z.object({
    name: z.string(),
    welcomeText: z.string(),
  }),
  fields: z.array(FieldSchema),
  authorSummary: z.object({
    emails: z.array(z.string()),
    organizations: z.array(z.string()),
    domains: z.array(z.string()),
  }).optional(),
});

export type DecideRequest = z.infer<typeof DecideRequestSchema>;

export const DecideResponseSchema = z.object({
  answers: z.record(z.string(), DecisionSchema),
  model: z.string(),
  requestId: z.string(),
});

export type DecideResponse = z.infer<typeof DecideResponseSchema>;
