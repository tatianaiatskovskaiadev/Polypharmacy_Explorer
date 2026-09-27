import {useCallback, useState, useEffect} from "react";
import {
    applyEdgeChanges,
    applyNodeChanges,
    ReactFlow,
    type Node,
    type Edge,
    type NodeChange,
    type EdgeChange
} from "@xyflow/react";
import type {Drug, Interaction} from "../utils/types";
import ModalWindow from "./ModalWindow.tsx";
import {useAppDispatch, useAppSelector} from "../app/hooks.ts";
import * as React from "react";
import dagre from "dagre";
import {open, close} from "../features/window/windowSlice.ts";

type Props = {
    data: Drug[];
    interactions?: Interaction[];
    highlightedDrugs?: Drug[];
}

const NODE_WIDTH = 150;
const NODE_HEIGHT = 50;

export const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {

    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));

    graph.setGraph({
        rankdir: "TB",
        nodesep: 50,
        edgesep: 20,
        ranksep: 50,
        marginx: 20,
        marginy: 20,
    });

    nodes.forEach((node) => {
        graph.setNode(node.id, {
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
        });
    });

    edges.forEach((edge) => {
        graph.setEdge(edge.source, edge.target);
    });

    dagre.layout(graph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = graph.node(node.id);

        return {
            ...node,
            position: {
                x: nodeWithPosition.x - NODE_WIDTH / 2,
                y: nodeWithPosition.y - NODE_HEIGHT / 2,
            },
        };
    });

    return {nodes: layoutedNodes, edges};
}

// Stable references: inline `= []` defaults would change on every render and retrigger the layout effect
const NO_INTERACTIONS: Interaction[] = [];
const NO_DRUGS: Drug[] = [];

const GraphView = ({data, interactions = NO_INTERACTIONS, highlightedDrugs = NO_DRUGS} : Props) => {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);
    const modalConfig = useAppSelector((state) => state.window);
    const dispatch = useAppDispatch();

    const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)), []);
    const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)), []);

    useEffect(() => {
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

        const newEdges: Edge[] = interactions.map(
            (interaction: Interaction) => ({
                id: interaction._id,
                source: interaction.drugA,
                target: interaction.drugB,
                label: interaction.riskLevel,
                style: {
                    stroke: interaction.colorCode,
                    strokeWidth: 2,
                },
                animated: true,
            })
        );

        const {
            nodes: layoutedNodes,
            edges: layoutedEdges,
        } = getLayoutedElements(newNodes, newEdges);

        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
    }, [data, interactions, highlightedDrugs]);

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
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
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