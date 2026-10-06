import Joi from 'joi';
import {RISK_LEVELS} from '../../../utils/constants.js';

const interactionResultSchema = Joi.object({
    riskLevel: Joi.string().valid(...RISK_LEVELS).required(),
    description: Joi.string().trim().min(1).required(),
    actionRequired: Joi.string().trim().allow('').required()
});

export const validateInteractionResult = (interactionResult) => (
    interactionResultSchema.validate(interactionResult, {stripUnknown: true})
);
