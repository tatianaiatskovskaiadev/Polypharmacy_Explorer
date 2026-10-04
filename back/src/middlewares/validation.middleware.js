import Joi from 'joi';
import {RISK_LEVELS} from "../utils/constants.js";

const objectId = Joi.string().hex().length(24);

const interactionResultSchema = Joi.object({
    riskLevel: Joi.string().valid(...RISK_LEVELS).required(),
    description: Joi.string().trim().min(1).required(),
    actionRequired: Joi.string().trim().allow('').required()
});

const schemas = {
    register: Joi.object({
        email: Joi.string().trim().email().max(254).required(),
        password: Joi.string().min(12).max(128).required(),
        registrationCode: Joi.string().min(1).max(200).required()
    }),
    login: Joi.object({
        email: Joi.string().trim().email().max(254).required(),
        password: Joi.string().max(128).required()
    }),
    searchDrugs: Joi.object({
        text: Joi.string().trim().min(1).max(100).required()
    }),
    createDrug: Joi.object({
        name: Joi.string().required(),
        activeIngredient: Joi.string().required(),
        originalText: Joi.string().required()
    }),
    searchDrugsBySymptom: Joi.object({
        text: Joi.string().trim().min(1).max(500).required(),
        drugIds: Joi.array().items(objectId).min(1).max(50).required()
    }),
    ragAnswer: Joi.object({
        question: Joi.string().trim().min(5).max(1000).required(),
        drugIds: Joi.array().items(objectId).unique().min(1).max(20).required()
    }),
    agentAsk: Joi.object({
        question: Joi.string().trim().min(5).max(1000).required(),
        drugIds: Joi.array().items(objectId).unique().min(1).max(4).required()
    }),
    checkInteractions: Joi.object({
        drugIds: Joi.array().items(objectId).unique().min(1).max(20).required()
    }),
    syncInteraction: Joi.object({
        drugIdA: objectId.required(),
        drugIdB: objectId.required(),
        drugNameA: Joi.string().required(),
        drugNameB: Joi.string().required()
    })
}

const validate = (schemaName, target = 'body') => (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
        return next(new Error('Invalid schema name'));
    }
    const {error} = schema.validate(req[target]);
    if (error) {
        return res.status(400).json({
            "timestamp": new Date().toISOString(),
            "status": 400,
            "error": "Bad Request",
            "message": error.details[0].message,
            "path": req.path
        });
    }
    return next();
}

export const validateInteractionResult = (interactionResult) => (
    interactionResultSchema.validate(interactionResult, {stripUnknown: true})
);

export default validate;
