export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

/** HTTP 423 — resource locked (e.g. deployment in progress on target environment). */
export class LockedError extends AppError {
  constructor(message: string) {
    super(message, 423, "LOCKED");
    this.name = "LockedError";
  }
}

export class DeploymentError extends AppError {
  constructor(message: string) {
    super(message, 422, "DEPLOYMENT_ERROR");
    this.name = "DeploymentError";
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400, "BAD_REQUEST");
    this.name = "BadRequestError";
  }
}
