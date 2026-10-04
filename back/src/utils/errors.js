class ApiError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
    }
}

export class UnauthorizedError extends ApiError {
    constructor(message = 'Unauthorized') {
        super(401, message);
    }
}

export class ForbiddenError extends ApiError {
    constructor(message = 'Forbidden') {
        super(403, message);
    }
}

export class ConflictError extends ApiError {
    constructor(message = 'Conflict') {
        super(409, message);
    }
}

export class TooManyRequestsError extends ApiError {
    constructor(message = 'Too many requests') {
        super(429, message);
    }
}

export class ExternalServiceError extends ApiError {
    constructor(message = 'External service unavailable') {
        super(502, message);
    }
}

export default ApiError;
