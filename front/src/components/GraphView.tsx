import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
    applyNodeChanges,
    ReactFlow,
    type Node,
    type Edge,
    type NodeChange,
} from "@xyflow/react";
import type {Drug, Interaction} from "../utils/types";
import ModalWindow from "./ModalWindow.tsx";
import {useAppDispatch, useAppSelector} from "../app/hooks.ts";
import * as React from "react";
import {open, close} from "../features/window/windowSlice.ts";
import {getLayoutedElements, NODE_HEIGHT, NODE_WIDTH} from "../utils/graphLayout.ts";
import {isPubChemOnlyDrug} from "../utils/drugEvidence.ts";

type Props = {
    data: Drug[];
    interactions?: Interaction[];
    highlightedDrugs?: Drug[];
    highlightedInteractions?: Interaction[];
}

// Stable references: inline `= []` defaults would change on every render and retrigger the layout effect
const NO_INTERACTIONS: Interaction[] = [];
const NO_DRUGS: Drug[] = [];

const GraphView = ({
    data,
    interactions = NO_INTERACTIONS,
    highlightedDrugs = NO_DRUGS,
    highlightedInteractions = NO_INTERACTIONS
} : Props) => {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
    const nodePositionsRef = useRef(new Map<string, {x: number; y: number}>());
    const modalConfig = useAppSelector((state) => state.window);
    const dispatch = useAppDispatch();
    const pubChemOnlyDrugs = data.filter(isPubChemOnlyDrug);

    const {nodes: layoutedNodes, edges} = useMemo(() => {
        const newNodes: Node[] = data.map((drug) => ({
            id: drug._id,
            data: {label: (
                <div className="flex flex-col items-center gap-1 text-center">
                    <span className="break-words font-medium">{drug.name}</span>
                    {isPubChemOnlyDrug(drug) ? (
                        <span className="rounded bg-amber-100 px-1 text-xs font-semibold text-amber-900">
                            PubChem only · FDA evidence unavailable
                        </span>
                    ) : null}
                </div>
            )},
            position: {
                x: 0,
                y: 0,
            },
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            style: highlightedDrugs.some(
                (highlightedDrug) =>
                    highlightedDrug._id === drug._id
            )
                ? {
                    border: "3px solid red",
                    backgroundColor: "#ffe6e6",
                    boxShadow: "0 0 10px red",
                }
                : isPubChemOnlyDrug(drug) ? {
                    border: "2px dashed #b45309",
                    backgroundColor: "#fffbeb",
                } : {},
        }));

        const highlightedInteractionIds = new Set(
            highlightedInteractions.map((interaction) => interaction._id)
        );

        const newEdges: Edge[] = interactions.map((interaction: Interaction) => {
            const isHighlighted = highlightedInteractionIds.has(interaction._id);

            return {
                id: interaction._id,
                source: interaction.drugA,
                target: interaction.drugB,
                label: interaction.riskLevel,
                style: {
                    stroke: isHighlighted ? "#7c3aed" : interaction.colorCode,
                    strokeWidth: isHighlighted ? 5 : 2,
                },
                animated: true,
            };
        });

        return getLayoutedElements(newNodes, newEdges);
    }, [data, interactions, highlightedDrugs, highlightedInteractions]);

    useEffect(() => {
        setNodes(
            layoutedNodes.map((node) => ({
                ...node,
                position: nodePositionsRef.current.get(node.id) ?? node.position,
            }))
        );
    }, [layoutedNodes]);

    const onNodesChange = useCallback((changes: NodeChange[]) => {
        setNodes((currentNodes) => {
            const updatedNodes = applyNodeChanges(changes, currentNodes);

            for (const node of updatedNodes) {
                nodePositionsRef.current.set(node.id, node.position);
            }

            return updatedNodes;
        });
    }, []);

    const handleEdgeClick = (
        event: React.MouseEvent,
        edge: Edge
    ) => {
        event.preventDefault();

        const foundInteraction = interactions.find((interaction) => interaction._id === edge.id);

        if (!foundInteraction) return;

        setSelectedInteraction(foundInteraction);

        dispatch(
            open({
                x: event.clientX,
                y: event.clientY,
            })
        );
    };

    return (
        <section aria-label="Drug interaction graph" className="relative h-[65vh] min-h-80 max-h-[42rem] w-full min-w-0 overflow-hidden rounded-md border border-gray-300">
            {data.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-600">
                    Search for a drug and add it to see the interaction graph.
                </div>
            ) : null}
            {data.length > 1 || pubChemOnlyDrugs.length > 0 ? (
                <div className="absolute top-3 right-3 left-3 z-10 max-h-[40%] max-w-md overflow-y-auto rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 shadow-sm">
                    {pubChemOnlyDrugs.length > 0 ? (
                        <p>
                            PubChem only: {pubChemOnlyDrugs.map((drug) => drug.name).join(', ')}. Chemical identity does not verify a medicinal product or its interactions. No FDA label passages are available for these entries.
                        </p>
                    ) : null}
                    {data.length > 1 ? (
                        <p className={pubChemOnlyDrugs.length > 0 ? 'mt-2' : undefined}>
                            Missing lines mean no interaction data was found or returned for that pair. They do not prove the combination is safe.
                        </p>
                    ) : null}
                </div>
            ) : null}
            {data.length > 0 ? (
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    nodesConnectable={false}
                    fitView
                    onEdgeClick={handleEdgeClick}
                />
            ) : null}

            <ModalWindow
                interaction={selectedInteraction}
                modalConfig={modalConfig}
                close={() => {
                    dispatch(close());
                    setSelectedInteraction(null);
                }}
            />
        </section>
    );
};

export default GraphView;
