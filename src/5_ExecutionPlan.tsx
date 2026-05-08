import type { QueryNode } from "./helpers/types";

export interface ExecutionStep {
    id: number;
    type: string;
    label: string;
}

interface Props {
    rootNode: QueryNode | null;
}

export function ExecutionPlanList({ rootNode }: Props) {
    const steps = generatePlan(rootNode);

    if (!steps || steps.length === 0) {
        return (
            <div className="empty-plan">
                <p>Aguardando processamento da consulta...</p>
            </div>
        );
    }

    return (
        <div className="plan-container">
            <h3 className="plan-title">
                Plano de Execução (Prioridade por Profundidade)
            </h3>
            <div className="timeline">
                {steps.map((step, index) => (
                    <div
                        key={`${step.type}-${step.id}`}
                        className="timeline-item"
                    >
                        <div className="timeline-badge-container">
                            <div
                                className={`timeline-badge badge-${step.type.toLowerCase()}`}
                            >
                                {index + 1}
                            </div>
                            {index !== steps.length - 1 && (
                                <div className="timeline-line"></div>
                            )}
                        </div>

                        <div className="step-card">
                            <div className="step-header">
                                <span
                                    className={`step-type type-${step.type.toLowerCase()}`}
                                >
                                    {step.type}
                                </span>
                                <span className="step-order">
                                    PASSO {index + 1}
                                </span>
                            </div>
                            <div className="step-body">
                                <code className="step-label">{step.label}</code>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <style>{styles}</style>
        </div>
    );
}

// Calcula a altura de um nó para definir prioridade de leitura
function getNodeHeight(node: QueryNode): number {
    if (node.type === "TABLE") return 1;

    if (node.type === "JOIN") {
        return (
            Math.max(getNodeHeight(node.left), getNodeHeight(node.right)) + 1
        );
    }

    if ("child" in node && node.child) {
        return getNodeHeight(node.child) + 1;
    }

    return 0;
}

function generatePlan(node: QueryNode | null): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    let counter = 1;

    if (node) walk(node);

    return steps;

    function walk(currentNode: QueryNode) {
        if (currentNode.type === "JOIN") {
            const leftH = getNodeHeight(currentNode.left);
            const rightH = getNodeHeight(currentNode.right);

            // Se o ramo direito for mais profundo, ele deve ser processado primeiro
            if (rightH > leftH) {
                walk(currentNode.right);
                walk(currentNode.left);
            } else {
                walk(currentNode.left);
                walk(currentNode.right);
            }
        } else if ("child" in currentNode && currentNode.child) {
            walk(currentNode.child);
        }

        steps.push({
            id: counter++,
            type: currentNode.type,
            label: getNodeLabel(currentNode),
        });
    }
}

function getNodeLabel(node: QueryNode): string {
    switch (node.type) {
        case "PROJECTION":
            return `π (${node.params.columns.join(", ")})`;
        case "SELECTION":
            return `σ (${node.params.condition})`;
        case "JOIN":
            return `⋈ (${node.params.on})`;
        case "TABLE":
            return `TABELA ${node.params.name.toUpperCase()}`;
        default:
            return "OP";
    }
}

const styles = `
  .plan-container { padding: 20px; background: #fff; }
  .plan-title { font-size: 0.9rem; color: #475569; margin-bottom: 20px; font-weight: 800; text-transform: uppercase; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px; }
  .timeline { display: flex; flex-direction: column; }
  .timeline-item { display: flex; gap: 12px; }
  .timeline-badge-container { display: flex; flex-direction: column; align-items: center; }
  .timeline-badge { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.65rem; font-weight: bold; }
  .timeline-line { width: 2px; flex-grow: 1; background: #f1f5f9; }
  .badge-table { background: #334155; }
  .badge-selection { background: #10b981; }
  .badge-projection { background: #6366f1; }
  .badge-join { background: #f59e0b; }
  .step-card { flex-grow: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 12px; }
  .step-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .step-type { font-size: 0.55rem; font-weight: 900; color: #64748b; text-transform: uppercase; }
  .step-order { font-size: 0.6rem; color: #94a3b8; }
  .step-label { font-family: 'Fira Code', monospace; font-size: 0.8rem; color: #1e293b; }
  .empty-plan { padding: 20px; text-align: center; color: #94a3b8; }
`;
