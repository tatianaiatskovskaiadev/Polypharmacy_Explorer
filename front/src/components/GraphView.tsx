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

    const {nodes: layoutedNodes, edges} = useMemo(() => {
        const newNodes: Node[] = data.map((drug) => ({
            id: drug._id,
            data: {label: drug.name},
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
                : {},
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
        <div
            style={{
                width: "100vw",
                height: "100vh",
            }}
        >
            {data.length > 1 ? (
                <div className="absolute z-10 m-3 max-w-md rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 shadow-sm">
                    Missing lines mean no interaction data was found or returned for that pair. They do not prove the combination is safe.
                </div>
            ) : null}
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                nodesConnectable={false}
                fitView
                onEdgeClick={handleEdgeClick}
            />

            <ModalWindow
                interaction={selectedInteraction}
                modalConfig={modalConfig}
                close={() => {
                    dispatch(close());
                    setSelectedInteraction(null);
                }}
            />
        </div>
    );
};

export default GraphView;
