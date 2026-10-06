import {OPENAI_EMBEDDING_MODEL} from '../../../utils/constants.js';

export const buildInteractionSearchText = ({description, actionRequired, riskLevel}) => (
    [description, actionRequired, riskLevel]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join('\n')
);

export const needsInteractionEmbedding = (interaction) => (
    interaction.searchText !== buildInteractionSearchText(interaction) ||
    interaction.embeddingModel !== OPENAI_EMBEDDING_MODEL ||
    !Array.isArray(interaction.embedding) || interaction.embedding.length === 0
);
