import assert from 'node:assert/strict';
import test from 'node:test';
import type {Edge, Node} from '@xyflow/react';
import {getLayoutedElements, NODE_HEIGHT, NODE_WIDTH} from './graphLayout.ts';

test('lays connected drugs top to bottom without mutating inputs', () => {
    const nodes: Node[] = [
        {id: 'drug-a', data: {label: 'Drug A'}, position: {x: 0, y: 0}},
        {id: 'drug-b', data: {label: 'Drug B'}, position: {x: 0, y: 0}}
    ];
    const edges: Edge[] = [{id: 'interaction', source: 'drug-a', target: 'drug-b'}];

    const result = getLayoutedElements(nodes, edges);

    assert.ok(result.nodes[0].position.y + NODE_HEIGHT <= result.nodes[1].position.y);
    assert.deepEqual(nodes.map((node) => node.position), [{x: 0, y: 0}, {x: 0, y: 0}]);
    assert.equal(result.edges, edges);
});

test('keeps disconnected drug nodes from overlapping', () => {
    const nodes: Node[] = ['drug-a', 'drug-b', 'drug-c'].map((id) => ({
        id, data: {label: id}, position: {x: 0, y: 0}
    }));
    const result = getLayoutedElements(nodes, []);

    for (let first = 0; first < result.nodes.length; first += 1) {
        for (let second = first + 1; second < result.nodes.length; second += 1) {
            const left = result.nodes[first].position;
            const right = result.nodes[second].position;
            assert.ok(Math.abs(left.x - right.x) >= NODE_WIDTH || Math.abs(left.y - right.y) >= NODE_HEIGHT);
        }
    }
});
