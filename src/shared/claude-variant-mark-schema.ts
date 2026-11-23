import { z } from 'zod'

// A malformed persisted mark drops the field, never the tab or record that carries it.
export const claudeVariantMarkSchema = z
  .object({ id: z.string(), label: z.string() })
  .nullable()
  .optional()
  .catch(undefined)
