import type {Edge, Node} from "@xyflow/react";
import dagre from "dagre";

export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 100;

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
};
