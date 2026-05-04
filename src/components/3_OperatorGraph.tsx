import type { Edge, Node } from "@xyflow/react";
import { Background, Controls, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import type { ParsedQuery } from "../helpers/types";

interface Props {
    query: ParsedQuery;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 60;
const H_GAP = 80;
const V_GAP = 50;

export function OperatorGraph({ query }: Props) {
    const { nodes, edges } = useMemo(() => buildGraph(query), [query]);

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

function buildGraph(query: ParsedQuery): { nodes: Node[]; edges: Edge[] } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let idCounter = 0;
    const nextId = () => `n${idCounter++}`;

    // Passo vertical constante: altura do nó + o gap de 50px
    const VERTICAL_STEP = NODE_HEIGHT + V_GAP;

    const tables = [query.from, ...query.joins.map((j) => j.table)];

    // Calculamos o tableY para ser o ponto mais baixo.
    // Estimamos 3 níveis por folha + níveis de join + topo.
    const tableY = (query.joins.length + 6) * VERTICAL_STEP;

    const tableIds: string[] = [];
    const totalTablesWidth =
        tables.length * NODE_WIDTH + (tables.length - 1) * H_GAP;
    const tableStartX = -(totalTablesWidth / 2) + NODE_WIDTH / 2;

    // 1. Renderização das Folhas (Tabelas e seus operadores locais)
    tables.forEach((tableExpr, i) => {
        const xPos = tableStartX + i * (NODE_WIDTH + H_GAP);

        const hasProjection = tableExpr.includes("π");
        const hasSelection = tableExpr.includes("σ");

        const tableName =
            tableExpr.match(/([A-Za-z0-9_]+)\s*\)*$/)?.[1] || tableExpr;
        const selectionMatch = tableExpr.match(/σ\s*([^(]+)/)?.[1];
        const projectionMatch = tableExpr.match(/π\s*([^(]+)/)?.[1];

        let currentY = tableY;

        // NÍVEL: TABELA
        const tableId = nextId();
        nodes.push({
            id: tableId,
            position: { x: xPos, y: currentY },
            data: { label: tableName.toUpperCase() },
            className: "node-table",
        });
        let lastNodeId = tableId;

        // NÍVEL: SELEÇÃO (σ) -> Sobe exatamente 1 STEP
        if (hasSelection) {
            currentY -= VERTICAL_STEP;
            const sigmaId = nextId();
            nodes.push({
                id: sigmaId,
                position: { x: xPos, y: currentY },
                data: { label: `σ ${selectionMatch?.trim()}` },
                className: "node-selection",
            });
            edges.push(makeEdge(sigmaId, lastNodeId));
            lastNodeId = sigmaId;
        }

        // NÍVEL: PROJEÇÃO (π) -> Sobe exatamente 1 STEP
        if (hasProjection) {
            currentY -= VERTICAL_STEP;
            const piId = nextId();
            nodes.push({
                id: piId,
                position: { x: xPos, y: currentY },
                data: { label: `π ${projectionMatch?.trim()}` },
                className: "node-projection",
            });
            edges.push(makeEdge(piId, lastNodeId));
            lastNodeId = piId;
        }

        tableIds.push(lastNodeId);
    });

    // 2. Renderização dos JOINs
    // Começamos os joins acima do nível máximo que as folhas podem atingir
    let prevId = tableIds[0];
    let joinY = tableY - 3 * VERTICAL_STEP;

    for (let i = 0; i < query.joins.length; i++) {
        const joinId = nextId();
        const join = query.joins[i];
        const leftNode = nodes.find((n) => n.id === prevId)!;
        const rightNode = nodes.find((n) => n.id === tableIds[i + 1])!;

        // Centraliza o Join entre os dois nós que ele une
        const cx = (leftNode.position.x + rightNode.position.x) / 2;

        nodes.push({
            id: joinId,
            position: { x: cx, y: joinY },
            data: { label: `⋈  ${join.on}` },
            className: "node-join",
        });

        edges.push(makeEdge(joinId, prevId));
        edges.push(makeEdge(joinId, tableIds[i + 1]));

        prevId = joinId;
        joinY -= VERTICAL_STEP; // Sobe exatamente 1 STEP
    }

    // 3. Filtros Globais (Sigma final, se houver)
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

    return { nodes, edges };
}
function makeEdge(source: string, target: string): Edge {
    return {
        id: `${source}-${target}`,
        source,
        target,
        animated: true, // Agora todas as conexões terão a animação de fluxo
        className: "custom-edge",
        markerEnd: {
            type: "arrowclosed" as any,
            color: "#cbd5e1", // Cor combinando com a linha
            width: 20,
            height: 20,
        },
    };
}

// --- ESTILOS CSS ---
const styles = `
  .graph-wrapper {
    width: 100%;
    height: 600px;
    background: #f8fafc;
    border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.08);
    border: 1px solid #d2d2d2;
    overflow: hidden;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }

  .error-container {
    padding: 24px;
    background: #f91515;
    border: 1px solid #feb2b2;
    border-radius: 12px;
    color: #c53030;
    font-weight: 500;
    margin-top: 20px;
  }

  /* Estilos Base dos Nós */
  .react-flow__node {
    border-radius: 12px !important;
    padding: 12px 20px !important;
    font-weight: 600 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
    border: none !important;
    transition: transform 0.1s ease, box-shadow 0.2s ease !important;
  }

  .react-flow__node:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1) !important;
  }

  /* Projeção (Pi) - Azul/Roxo */
  .node-projection {
    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
    color: white !important;
    width: ${NODE_WIDTH}px;
    min-height: ${NODE_HEIGHT}px;
  }

  /* Seleção (Sigma) - Verde */
  .node-selection {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
    color: white !important;
    width: ${NODE_WIDTH}px;
  }

  /* Join (Bowtie) - Laranja/Coral */
  .node-join {
    background: linear-gradient(135deg, #f97316 0%, #ea580c 100%) !important;
    color: white !important;
    font-size: 12px !important;
    width: ${NODE_WIDTH}px;
  }

  /* Tabela - Dark/Gray */
  .node-table {
    background: #334155 !important;
    color: #f8fafc !important;
    letter-spacing: 0.5px;
    width: ${NODE_WIDTH}px;
  }

  /* Customização das Arestas */
  .custom-edge {
    stroke: #cbd5e1 !important;
    stroke-width: 2.5 !important;
    /* Controla a velocidade e o estilo do tracejado animado */
    stroke-dasharray: 5; 
   }

  .react-flow__edge-path {
    transition: stroke-width 0.2s;
  }

  .react-flow__controls {
    box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
    border: none !important;
  }

  .react-flow__controls-button {
    background: white !important;
    border-bottom: 1px solid #eee !important;
  }
`;

export default OperatorGraph;
