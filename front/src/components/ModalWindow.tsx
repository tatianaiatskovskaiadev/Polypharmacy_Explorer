import type {Interaction} from "../utils/types";

type Props = {
    interaction: Interaction | null;
    modalConfig: {
        x: number;
        y: number;
    }
    close: () => void;
}

const ModalWindow = ({modalConfig, close, interaction}: Props) => {
    if (!interaction) return null;
    return (
        <div
            role="dialog"
            className="fixed z-50 max-w-sm bg-white border border-gray-300 rounded-md shadow-lg p-3"
            style={{left: modalConfig.x, top: modalConfig.y}}
        >
            <div className="font-semibold capitalize">{interaction.riskLevel}</div>
            <div>{interaction.description}</div>
            <div className="mt-2">{interaction.actionRequired}</div>
            <div className="mt-2 text-xs text-gray-500">
                AI-generated summary of {interaction.source ?? 'drug label'} text. Not medical advice.
            </div>
            {interaction.sourceUrl && (
                <a href={interaction.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 underline">
                    View source
                </a>
            )}
            <button
                className={'border border-gray-300 rounded-md p-2 mt-2'}
                onClick={close}>Close</button>
        </div>
    );
};

export default ModalWindow;
