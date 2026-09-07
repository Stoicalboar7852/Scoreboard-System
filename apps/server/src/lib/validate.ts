import { type z } from 'zod';
import { ValidationError } from '../errors.js';

/** Parses input with a shared Zod schema, throwing a typed ValidationError with field details. */
export function parse<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
  what = 'input',
): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      `Invalid ${what}`,
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

/** Reads a required route param as a string. */
export function param(params: unknown, name: string): string {
  const value = (params as Record<string, unknown> | undefined)?.[name];
  if (typeof value !== 'string' || value.length === 0)
    throw new ValidationError(`Missing route parameter ${name}`);
  return value;
}
