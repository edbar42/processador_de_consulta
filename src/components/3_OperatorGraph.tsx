import type { Edge, Node } from "@xyflow/react";
import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo, useEffect } from "react";
import type { ParsedQuery } from "../helpers/types";

// Estrutura do Passo de Execução
export interface ExecutionStep {
    id: string;
    type: "TABLE" | "SELECTION" | "PROJECTION" | "JOIN";
    label: string;
    levelY: number;
}

interface Props {
    query: ParsedQuery;
    onPlanGenerated?: (plan: ExecutionStep[]) => void; // Callback para retornar o plano
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 60;
const H_GAP = 80;
const V_GAP = 50;

export function OperatorGraph({ query, onPlanGenerated }: Props) {
    const { nodes, edges, executionPlan } = useMemo(
        () => buildGraph(query),
        [query],
    );

    // Dispara o callback sempre que o plano for recalculado
    useEffect(() => {
        if (onPlanGenerated && query.isValid) {
            onPlanGenerated(executionPlan);
        }
    }, [executionPlan, onPlanGenerated, query.isValid]);

    if (!query.isValid) {
        return (
            <div className="error-container">
                <p>
                    Consulta inválida - verifique a sintaxe antes de visualizar
                    o grafo.
                </p>
            </div>
        );
    }

    return (
        <div className="graph-wrapper">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{ padding: 0.4 }}
                nodesDraggable={true}
                nodesConnectable={false}
                elementsSelectable={true}
                zoomOnScroll={true}
                panOnDrag={true}
            >
                <Background color="#f8f9fa" gap={20} />
                <Controls showInteractive={false} position="bottom-right" />
            </ReactFlow>
            <style>{styles}</style>
        </div>
    );
}

function buildGraph(query: ParsedQuery): {
    nodes: Node[];
    edges: Edge[];
    executionPlan: ExecutionStep[];
} {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let idCounter = 0;
    const nextId = () => `n${idCounter++}`;

    const VERTICAL_STEP = NODE_HEIGHT + V_GAP;
    const tables = [query.from, ...query.joins.map((j) => j.table)];
    const tableY = (query.joins.length + 6) * VERTICAL_STEP;

    const tableIds: string[] = [];
    const totalTablesWidth =
        tables.length * NODE_WIDTH + (tables.length - 1) * H_GAP;
    const tableStartX = -(totalTablesWidth / 2) + NODE_WIDTH / 2;

    // 1. Construção das Folhas (Tabelas e seus operadores locais)
    tables.forEach((tableExpr, i) => {
        const xPos = tableStartX + i * (NODE_WIDTH + H_GAP);
        const tableName =
            tableExpr.match(/([A-Za-z0-9_]+)\s*\)*$/)?.[1] || tableExpr;
        let currentY = tableY;

        // Nível: TABELA
        const tableId = nextId();
        nodes.push({
            id: tableId,
            position: { x: xPos, y: currentY },
            data: { label: tableName.toUpperCase() },
            className: "node-table",
        });
        let lastNodeId = tableId;

        // Nível: SELEÇÃO LOCAL (σ)
        if (tableExpr.includes("σ")) {
            currentY -= VERTICAL_STEP;
            const sigmaId = nextId();
            const label = `σ ${tableExpr.match(/σ\s*([^(]+)/)?.[1]?.trim()}`;
            nodes.push({
                id: sigmaId,
                position: { x: xPos, y: currentY },
                data: { label },
                className: "node-selection",
            });
            edges.push(makeEdge(sigmaId, lastNodeId));
            lastNodeId = sigmaId;
        }

        // Nível: PROJEÇÃO LOCAL (π)
        if (tableExpr.includes("π")) {
            currentY -= VERTICAL_STEP;
            const piId = nextId();
            const label = `π ${tableExpr.match(/π\s*([^(]+)/)?.[1]?.trim()}`;
            nodes.push({
                id: piId,
                position: { x: xPos, y: currentY },
                data: { label },
                className: "node-projection",
            });
            edges.push(makeEdge(piId, lastNodeId));
            lastNodeId = piId;
        }
        tableIds.push(lastNodeId);
    });

    // 2. Construção dos JOINs
    let prevId = tableIds[0];
    let joinY = tableY - 3 * VERTICAL_STEP;

    for (let i = 0; i < query.joins.length; i++) {
        const joinId = nextId();
        const join = query.joins[i];
        const leftNode = nodes.find((n) => n.id === prevId)!;
        const rightNode = nodes.find((n) => n.id === tableIds[i + 1])!;
        const cx = (leftNode.position.x + rightNode.position.x) / 2;

        nodes.push({
            id: joinId,
            position: { x: cx, y: joinY },
            data: { label: `⋈  ${join.on}` },
            className: "node-join",
        });

        // O Join aponta para os seus dois ramos (filhos)
        edges.push(makeEdge(joinId, prevId));
        edges.push(makeEdge(joinId, tableIds[i + 1]));

        prevId = joinId;
        joinY -= VERTICAL_STEP;
    }

    // 3. Filtros Globais
    if (query.wheres && query.wheres.length > 0) {
        const globalSigmaId = nextId();
        const conds = query.wheres
            .map((w) => `${w.left}${w.operator}${w.right}`)
            .join(" ∧ ");
        nodes.push({
            id: globalSigmaId,
            position: {
                x: nodes.find((n) => n.id === prevId)!.position.x,
                y: joinY,
            },
            data: { label: `σ ${conds}` },
            className: "node-selection",
        });
        edges.push(makeEdge(globalSigmaId, prevId));
        prevId = globalSigmaId;
        joinY -= VERTICAL_STEP;
    }

    // 4. Projeção Final (Raiz)
    const rootProjId = nextId();
    nodes.push({
        id: rootProjId,
        position: {
            x: nodes.find((n) => n.id === prevId)!.position.x,
            y: joinY,
        },
        data: { label: `π ${query.select.join(", ")}` },
        className: "node-projection",
    });
    edges.push(makeEdge(rootProjId, prevId));

    // --- GERAÇÃO DO PLANO DE EXECUÇÃO (PÓS-ORDEM) ---
    const executionPlan: ExecutionStep[] = [];
    const visited = new Set<string>();

    const traverse = (nodeId: string) => {
        if (visited.has(nodeId)) return;

        // Encontra todos os "filhos" (nós de onde saem arestas PARA este nó)
        // No nosso modelo de dados, o target é o filho e o source é o pai
        const childEdges = edges.filter((e) => e.source === nodeId);

        // Visita os ramos primeiro (Esquerda e depois Direita, se houver)
        childEdges.forEach((edge) => traverse(edge.target));

        // Processa o nó atual (Pós-ordem)
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
            const typeMatch = node.className?.match(/node-([a-z]+)/);
            const type = (
                typeMatch ? typeMatch[1].toUpperCase() : "OPERATOR"
            ) as any;

            executionPlan.push({
                id: node.id,
                type: type,
                label: node.data.label as string,
                levelY: node.position.y,
            });
        }
        visited.add(nodeId);
    };

    // Inicia a travessia a partir da Raiz (o último nó criado)
    traverse(rootProjId);

    return { nodes, edges, executionPlan };
}

function makeEdge(source: string, target: string): Edge {
    return {
        id: `${source}-${target}`,
        source,
        target,
        animated: true,
        className: "custom-edge",
        markerEnd: {
            type: "arrowclosed" as any,
            color: "#cbd5e1",
            width: 20,
            height: 20,
        },
    };
}

const styles = `
  .graph-wrapper { width: 100%; height: 600px; background: #f8fafc; border-radius: 16px; border: 1px solid #d2d2d2; overflow: hidden; }
  .error-container { padding: 24px; color: #c53030; font-weight: 500; }
  .node-projection { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important; color: white !important; width: ${NODE_WIDTH}px; }
  .node-selection { background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important; color: white !important; width: ${NODE_WIDTH}px; }
  .node-join { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%) !important; color: white !important; width: ${NODE_WIDTH}px; }
  .node-table { background: #334155 !important; color: #f8fafc !important; width: ${NODE_WIDTH}px; }
  .custom-edge { stroke: #cbd5e1 !important; stroke-width: 2.5 !important; stroke-dasharray: 5; }
`;

export default OperatorGraph;
