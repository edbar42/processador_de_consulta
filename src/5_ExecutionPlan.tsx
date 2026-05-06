import type { ExecutionStep } from "./3_OperatorGraph";

interface Props {
    steps: ExecutionStep[];
}

export function ExecutionPlanList({ steps }: Props) {
    if (!steps || steps.length === 0) {
        return (
            <div className="empty-plan">
                <p>Aguardando processamento da consulta...</p>
            </div>
        );
    }

    // Inverte a lista para que o Passo 1 seja a base da árvore (TABLE)
    const bottomUpSteps = [...steps].reverse();

    return (
        <div className="plan-container">
            <h3 className="plan-title">Plano de Execução (Bottom-Up)</h3>
            <div className="timeline">
                {bottomUpSteps.map((step, index) => (
                    <div key={step.id} className="timeline-item">
                        <div className="timeline-badge-container">
                            <div
                                className={`timeline-badge badge-${step.type.toLowerCase()}`}
                            >
                                {index + 1}
                            </div>
                            {index !== bottomUpSteps.length - 1 && (
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
                                <span className="step-id">ID: {step.id}</span>
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

function getStepDescription(step: ExecutionStep): string {
    switch (step.type) {
        case "TABLE":
            return `Início da leitura física dos dados na tabela.`;
        case "SELECTION":
            return `Filtragem de tuplas baseada na condição lógica.`;
        case "PROJECTION":
            return `Redução do esquema: mantendo apenas colunas necessárias.`;
        case "JOIN":
            return `Junção de dois fluxos de dados via predicado de junção.`;
        default:
            return "Processamento de álgebra relacional.";
    }
}

const styles = `
  .plan-container {
    padding: 24px;
    background: #ffffff;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    font-family: 'Inter', system-ui, sans-serif;
    margin-top: 20px;
  }

  .plan-title {
    margin-bottom: 24px;
    color: #1e293b;
    font-size: 1.2rem;
    font-weight: 700;
    border-bottom: 2px solid #f1f5f9;
    padding-bottom: 12px;
  }

  .timeline {
    display: flex;
    flex-direction: column;
  }

  .timeline-item {
    display: flex;
    gap: 20px;
  }

  .timeline-badge-container {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .timeline-badge {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 0.75rem;
    font-weight: bold;
    flex-shrink: 0;
  }

  .timeline-line {
    width: 2px;
    flex-grow: 1;
    background: #e2e8f0;
    margin: 4px 0;
  }

  .badge-table { background: #334155; }
  .badge-selection { background: #10b981; }
  .badge-projection { background: #6366f1; }
  .badge-join { background: #f97316; }

  .step-card {
    flex-grow: 1;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 16px;
  }

  .step-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .step-type {
    font-size: 0.65rem;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .type-table { background: #e2e8f0; color: #334155; }
  .type-selection { background: #d1fae5; color: #065f46; }
  .type-projection { background: #e0e7ff; color: #3730a3; }
  .type-join { background: #ffedd5; color: #9a3412; }

  .step-id { font-size: 0.65rem; color: #94a3b8; }

  .step-label {
    display: block;
    background: #fff;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    font-size: 0.85rem;
    color: #334155;
    margin-bottom: 6px;
    font-family: 'Fira Code', monospace;
  }

  .step-description {
    font-size: 0.8rem;
    color: #64748b;
    margin: 0;
  }

  .empty-plan {
    padding: 30px;
    text-align: center;
    color: #94a3b8;
    border: 2px dashed #e2e8f0;
    border-radius: 16px;
  }
`;
