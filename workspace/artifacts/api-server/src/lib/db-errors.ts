type PgErrorLike = {
  code?: string;
  constraint?: string;
};

function asPgError(error: unknown): PgErrorLike | null {
  if (!error || typeof error !== "object") return null;
  const direct = error as PgErrorLike;
  if (direct.code) return direct;
  const cause = (error as { cause?: unknown }).cause;
  if (cause && typeof cause === "object" && (cause as PgErrorLike).code) {
    return cause as PgErrorLike;
  }
  return null;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = asPgError(error);
  if (!pg || pg.code !== "23505") return false;
  if (!constraint) return true;
  return pg.constraint === constraint;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
