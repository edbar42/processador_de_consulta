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
    rootNode: QueryNode | null; // Recebe o nó raiz do grafo (Passo 1 ou Passo 3)
    onPlanGenerated?: (plan: ExecutionStep[]) => void;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 60;
const H_GAP = 100;
const V_GAP = 60;

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
        return <div className="error-container">Aguardando definição do grafo...</div>;
    }

    return (
        <div className="graph-wrapper">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                nodesDraggable={true}
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

    // Função recursiva para posicionar e criar nós
    // xOffset ajuda a centralizar ramos de Joins
    const traverse = (node: QueryNode, x: number, y: number): { id: string; width: number } => {
        const id = `n${idCounter++}`;
        let label = "";
        let className = "";
        let subtreeWidth = NODE_WIDTH;

        // 1. Identificação do Tipo e Conteúdo
        switch (node.type) {
            case "PROJECTION":
                label = `π ${node.params.columns.join(", ")}`;
                className = "node-projection";
                break;
            case "SELECTION":
                label = `σ ${node.params.condition}`;
                className = "node-selection";
                break;
            case "JOIN":
                label = `⋈ ${node.params.on}`;
                className = "node-join";
                break;
            case "TABLE":
                label = node.params.name.toUpperCase();
                className = "node-table";
                break;
        }

        // 2. Processamento de Filhos (Recursão)
        if (node.type === "JOIN") {
            // Joins têm dois ramos. Calculamos a largura das subárvores para evitar sobreposição
            const leftResult = traverse(node.left, x - (NODE_WIDTH / 2 + H_GAP / 2), y + NODE_HEIGHT + V_GAP);
            const rightResult = traverse(node.right, x + (NODE_WIDTH / 2 + H_GAP / 2), y + NODE_HEIGHT + V_GAP);
            
            edges.push(makeEdge(id, leftResult.id));
            edges.push(makeEdge(id, rightResult.id));
            subtreeWidth = leftResult.width + rightResult.width + H_GAP;
        } else if ("child" in node && node.child) {
            // Operadores unários (Pi, Sigma)
            const childResult = traverse(node.child, x, y + NODE_HEIGHT + V_GAP);
            edges.push(makeEdge(id, childResult.id));
        }

        // 3. Adiciona o nó atual à lista
        nodes.push({
            id,
            position: { x, y },
            data: { label },
            className,
        });

        // 4. Alimenta o Plano de Execução (Pós-ordem para refletir a ordem de processamento)
        executionPlan.push({ id, type: node.type, label, levelY: y });

        return { id, width: subtreeWidth };
    };

    // Inicia a construção a partir do topo (y=0)
    traverse(root, 0, 0);

    return { nodes, edges, executionPlan: executionPlan.reverse() };
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
  .graph-wrapper { width: 100%; height: 500px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; }
  .node-projection { background: #6366f1 !important; color: white !important; border-radius: 8px; font-size: 12px; text-align: center; display: flex; align-items: center; justify-content: center; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px; }
  .node-selection { background: #10b981 !important; color: white !important; border-radius: 8px; font-size: 12px; text-align: center; display: flex; align-items: center; justify-content: center; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px; }
  .node-join { background: #f97316 !important; color: white !important; border-radius: 8px; font-size: 11px; text-align: center; display: flex; align-items: center; justify-content: center; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px; }
  .node-table { background: #334155 !important; color: white !important; border-radius: 4px; font-weight: bold; width: ${NODE_WIDTH}px; height: ${NODE_HEIGHT}px; display: flex; align-items: center; justify-content: center; }
`;