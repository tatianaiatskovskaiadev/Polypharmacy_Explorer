export const ENV_VARS = {
    port: 'PORT',
    mongoUri: 'MONGO_URI',
    dbName: 'DB_NAME',
    corsOrigin: 'CORS_ORIGIN',
    demoApiKey: 'DEMO_API_KEY',
    openAiApiKey: 'OPENAI_API_KEY',
    nodeEnv: 'NODE_ENV'
};

export const DEFAULT_PORT = 3000;
export const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';
export const LOCAL_NODE_ENV_VALUES = ['development', 'dev', 'local', 'test'];
export const DEMO_API_KEY_HEADER = 'x-demo-api-key';

export const FDA_LABEL_URL = 'https://api.fda.gov/drug/label.json';
export const FDA_REQUEST_TIMEOUT_MS = 10_000;
export const FDA_MAX_RETRIES = 2;
export const FDA_RETRY_BACKOFF_MS = 750;

export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
export const OPENAI_CHAT_MODEL = 'gpt-4o-mini';
export const OPENAI_EMBEDDING_ENCODING_FORMAT = 'float';
export const OPENAI_JSON_RESPONSE_FORMAT = 'json_object';

export const MAX_EMBEDDING_INPUT_LENGTH = 8_000;
export const MAX_EMBEDDING_TEXT_LENGTH = 6_000;
export const MAX_FDA_SECTION_LENGTH = 1_500;

export const RISK_LEVELS = ['minor', 'moderate', 'major', 'critical'];
export const INTERACTION_ANALYSIS_VERSION = 3;
export const COLOR_BY_RISK = {
    minor: 'green',
    moderate: 'yellow',
    major: 'orange',
    critical: 'red'
};
export const INTERACTION_SYNC_CONCURRENCY = 3;

export const VECTOR_SEARCH_INDEX = 'vector_index';
export const DRUG_EMBEDDING_PATH = 'guidelines.embedding';
export const VECTOR_SIMILARITY_THRESHOLD = 0.6;
export const VECTOR_CANDIDATES_MULTIPLIER = 20;

export const ETL_BATCH_SIZE = 2000;

export const EXPENSIVE_ENDPOINT_RATE_LIMIT_WINDOW_MS = 60_000;
export const EXPENSIVE_ENDPOINT_RATE_LIMIT_MAX_REQUESTS = 30;
