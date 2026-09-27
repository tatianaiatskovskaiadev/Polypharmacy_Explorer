import {parseDrugRegistry} from '../services/etl.service.js'

export const drugRegistry = async (req,res, next) => {
    try {
        await parseDrugRegistry(req.body.filePath)
        return res.status(200).send()
    } catch(error) {
        return next(error)
    }
}