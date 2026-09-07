import { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export type ErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'AUTH'
  | 'FORBIDDEN'
  | 'RULE_VIOLATION'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid input', details?: unknown) {
    super('VALIDATION', 400, message, details);
  }
}
export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super('NOT_FOUND', 404, id ? `${entity} ${id} not found` : `${entity} not found`);
  }
}
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', 409, message, details);
  }
}
export class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super('AUTH', 401, message);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Not allowed') {
    super('FORBIDDEN', 403, message);
  }
}
export class RuleViolationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('RULE_VIOLATION', 422, message, details);
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

/** Converts any thrown value into a safe HTTP status + body. Never leaks stack traces. */
export function toErrorBody(err: unknown): { statusCode: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
    };
  }
  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION',
          message: 'Invalid input',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
    };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ');
      return {
        statusCode: 409,
        body: {
          error: { code: 'CONFLICT', message: `Already exists${target ? ` (${target})` : ''}` },
        },
      };
    }
    if (err.code === 'P2025') {
      return {
        statusCode: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Record not found' } },
      };
    }
    if (err.code === 'P2003') {
      return {
        statusCode: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'Referenced record does not exist or is still in use',
          },
        },
      };
    }
  }
  const fastifyError = err as Partial<FastifyError>;
  if (typeof fastifyError?.statusCode === 'number' && fastifyError.statusCode < 500) {
    const code: ErrorCode =
      fastifyError.statusCode === 429
        ? 'RATE_LIMITED'
        : fastifyError.statusCode === 401
          ? 'AUTH'
          : 'VALIDATION';
    return {
      statusCode: fastifyError.statusCode,
      body: { error: { code, message: fastifyError.message ?? 'Request error' } },
    };
  }
  return {
    statusCode: 500,
    body: { error: { code: 'INTERNAL', message: 'Internal server error' } },
  };
}

/** Fastify error handler: maps typed errors to HTTP codes and logs everything with context. */
export function errorHandler(err: unknown, request: FastifyRequest, reply: FastifyReply): void {
  const { statusCode, body } = toErrorBody(err);
  const logCtx = {
    err,
    reqId: request.id,
    url: request.url,
    method: request.method,
    code: body.error.code,
  };
  if (statusCode >= 500) request.log.error(logCtx, 'unhandled error');
  else request.log.warn(logCtx, body.error.message);
  void reply.status(statusCode).send(body);
}
