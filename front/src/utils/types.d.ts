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

export type SymptomSearchRequest = {
    text: string;
    drugIds: string[];
};