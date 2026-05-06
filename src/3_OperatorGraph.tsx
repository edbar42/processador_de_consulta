import type { Edge, Node } from "@xyflow/react";
import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useEffect } from "react";
import type { QueryNode } from "./helpers/types";

export interface ExecutionStep {
    id: string;
    type: string;
    label: string;
    levelY: number;
}

interface Props {
    rootNode: QueryNode | null;
    onPlanGenerated?: (plan: ExecutionStep[]) => void;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 50;
const H_GAP = 60; // Espaço horizontal entre subárvores
const V_GAP = 60; // Espaço vertical entre níveis

export function OperatorGraph({ rootNode, onPlanGenerated }: Props) {
    const { nodes, edges, executionPlan } = useMemo(() => {
        if (!rootNode) return { nodes: [], edges: [], executionPlan: [] };
        return buildGraphFromAST(rootNode);
    }, [rootNode]);

    useEffect(() => {
        if (onPlanGenerated && rootNode) {
            onPlanGenerated(executionPlan);
        }
    }, [executionPlan, onPlanGenerated, rootNode]);

    if (!rootNode) {
        return (
            <div className="error-container">
                Aguardando definição do grafo...
            </div>
        );
    }

    return (
        <div className="graph-wrapper">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                nodesDraggable={true}
                nodesConnectable={false}
            >
                <Background color="#f8f9fa" gap={20} />
                <Controls showInteractive={false} position="bottom-right" />
            </ReactFlow>
            <style>{styles}</style>
        </div>
    );
}

function buildGraphFromAST(root: QueryNode) {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const executionPlan: ExecutionStep[] = [];
    let idCounter = 0;

    /**
     * PASSO 1: Calcular a largura total de cada subárvore recursivamente
     */
    const calculateSubtreeWidth = (node: QueryNode): number => {
        if (node.type === "TABLE") return NODE_WIDTH;
        if (node.type === "JOIN") {
            return (
                calculateSubtreeWidth(node.left) +
                calculateSubtreeWidth(node.right) +
                H_GAP
            );
        }
        if ("child" in node && node.child) {
            return calculateSubtreeWidth(node.child);
        }
        return NODE_WIDTH;
    };

    /**
     * PASSO 2: Posicionar os nós com base na largura das subárvores[cite: 3]
     */
    const traverse = (node: QueryNode, x: number, y: number): string => {
        const id = `n${idCounter++}`;
        const label = getLabel(node);
        const className = `node-${node.type.toLowerCase()}`;

        if (node.type === "JOIN") {
            const leftWidth = calculateSubtreeWidth(node.left);
            const rightWidth = calculateSubtreeWidth(node.right);
            const totalWidth = leftWidth + rightWidth + H_GAP;

            // Centraliza os ramos filhos em relação ao pai[cite: 3]
            const leftX = x - totalWidth / 2 + leftWidth / 2;
            const rightX = x + totalWidth / 2 - rightWidth / 2;

            const leftChildId = traverse(
                node.left,
                leftX,
                y + NODE_HEIGHT + V_GAP,
            );
            const rightChildId = traverse(
                node.right,
                rightX,
                y + NODE_HEIGHT + V_GAP,
            );

            edges.push(makeEdge(id, leftChildId));
            edges.push(makeEdge(id, rightChildId));
        } else if ("child" in node && node.child) {
            const childId = traverse(node.child, x, y + NODE_HEIGHT + V_GAP);
            edges.push(makeEdge(id, childId));
        }

        nodes.push({
            id,
            position: { x: x - NODE_WIDTH / 2, y }, // Ajuste para centralizar o nó no ponto X[cite: 3]
            data: { label },
            className,
        });

        executionPlan.push({ id, type: node.type, label, levelY: y });
        return id;
    };

    // Inicia a construção centralizada em X=0[cite: 3]
    traverse(root, 0, 0);

    return { nodes, edges, executionPlan };
}

function getLabel(node: QueryNode): string {
    switch (node.type) {
        case "PROJECTION":
            return `π ${node.params.columns.join(", ")}`;
        case "SELECTION":
            return `σ ${node.params.condition}`;
        case "JOIN":
            return `⋈ ${node.params.on}`;
        case "TABLE":
            return node.params.name.toUpperCase();
        default:
            return "";
    }
}

function makeEdge(source: string, target: string): Edge {
    return {
        id: `${source}-${target}`,
        source,
        target,
        animated: true,
        markerEnd: { type: "arrowclosed" as any, color: "#cbd5e1" },
    };
}

const styles = `
  .graph-wrapper { width: 100%; height: 550px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
  .node-projection { background: #6366f1 !important; color: white !important; border-radius: 8px; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px; }
  .node-selection { background: #10b981 !important; color: white !important; border-radius: 8px; font-size: 12px; font-weight: 500; display: flex; align-items: center; justify-content: center; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px; }
  .node-join { background: #f97316 !important; color: white !important; border-radius: 8px; font-size: 11px; font-weight: 500; display: flex; align-items: center; justify-content: center; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px; }
  .node-table { background: #334155 !important; color: white !important; border-radius: 4px; font-weight: bold; font-size: 13px; display: flex; align-items: center; justify-content: center; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px; }
  .error-container { padding: 20px; color: #ef4444; background: #fef2f2; border-radius: 8px; border: 1px solid #fecaca; }
`;
