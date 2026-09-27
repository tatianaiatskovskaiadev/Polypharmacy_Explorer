class ApiError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
    }
}

export class NotFoundError extends ApiError {
    constructor(message = 'Not Found') {
        super(404, message);
    }
}

export class ConflictError extends ApiError {
    constructor(message = 'Conflict') {
        super(409, message);
    }
}

export class ExternalServiceError extends ApiError {
    constructor(message = 'External service unavailable') {
        super(502, message);
    }
}

export default ApiError;
