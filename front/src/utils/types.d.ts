export interface Drug {
    _id: string;
    name: string;
    activeIngredient: string;
    guidelines: {
        source: string;
        originalText: string;
    };
    // Present only in symptom search results (vector similarity)
    score?: number;
}

export type RiskLevel = 'minor' | 'moderate' | 'major' | 'critical';

export type Interaction = {
    _id: string;
    drugA: string;
    drugB: string;
    riskLevel: RiskLevel;
    colorCode: string;
    description: string;
    actionRequired: string;
};

export type CheckInteractionsRequest = {
    drugIds: string[];
};

export type FailedInteractionPair = {
    drugIdA: string;
    drugIdB: string;
    drugNameA: string;
    drugNameB: string;
    reason: string;
};

export type CheckInteractionsResponse = {
    interactions: Interaction[];
    failedPairs: FailedInteractionPair[];
};

export type SymptomSearchRequest = {
    text: string;
    drugIds: string[];
};

export type SymptomSearchResponse = {
    drugs: Drug[];
    interactions: Interaction[];
};

export type RagAnswerRequest = {
    question: string;
    drugIds: string[];
};

export type RagSource = {
    number: number;
    drugName: string;
    section: string;
    text: string;
    sourceUrl: string;
    score: number;
};

export type RagAnswerResponse = {
    answer: string;
    sources: RagSource[];
    promptVersion: string;
};

export type AgentAnswerResponse = RagAnswerResponse & {
    toolCalls: {name: string; status: 'ok' | 'error'}[];
};
