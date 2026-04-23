import { useState } from "react";
import "./App.css";
import OperatorGraph from "./components/OperatorGraph";
import {
  buildExecutionPlan,
  type ExecutionStep,
} from "./helpers/executionPlan";
import { optimizeAlgebra, summarizeOptimization } from "./helpers/optimizer";
import {
  buildOperatorGraph,
  type OperatorGraphData,
} from "./helpers/operatorGraph";
import { parseSqlQuery } from "./helpers/sqlParser";
import { schemaMetadata } from "./helpers/schemas";
import { algebraToString, queryToAlgebra } from "./helpers/sqlToAlgebra";
import validarConsulta from "./helpers/validarConsulta";
import { TestQueries } from "./helpers/testQueries";

type GraphView = "original" | "optimized";

interface ProcessResult {
  rawAlgebra: string;
  optimizedAlgebra: string;
  rawGraph: OperatorGraphData;
  optimizedGraph: OperatorGraphData;
  executionPlan: ExecutionStep[];
  optimizationNotes: string[];
}

function App() {
  const [query, setQuery] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [graphView, setGraphView] = useState<GraphView>("optimized");
  const [showTestQueries, setShowTestQueries] = useState(false);

  function applyTestQuery(nextQuery: string) {
    setQuery(nextQuery);
    setErro(null);
    setResult(null);
    setShowTestQueries(false);
  }

  function handleProcessar() {
    setErro(null);
    setResult(null);

    if (!query.trim()) {
      setErro("Digite uma consulta SQL.");
      return;
    }

    const validacao = validarConsulta(query, schemaMetadata);
    if (!validacao.valid) {
      setErro(validacao.error ?? "Consulta inválida.");
      return;
    }

    try {
      const parsed = parseSqlQuery(query, schemaMetadata);
      const rawTree = queryToAlgebra(parsed);
      const optimizedTree = optimizeAlgebra(rawTree, parsed, schemaMetadata);

      setResult({
        rawAlgebra: algebraToString(rawTree),
        optimizedAlgebra: algebraToString(optimizedTree),
        rawGraph: buildOperatorGraph(rawTree),
        optimizedGraph: buildOperatorGraph(optimizedTree),
        executionPlan: buildExecutionPlan(optimizedTree),
        optimizationNotes: summarizeOptimization(optimizedTree),
      });
      setGraphView("optimized");
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Erro ao processar a consulta.",
      );
    }
  }

  const activeGraph =
    graphView === "original" ? result?.rawGraph : result?.optimizedGraph;

  return (
    <div className="app-shell">
      <div className="app-container">
        <header className="hero">
          <h1>Processador de Consultas</h1>
        </header>

        <section className="panel input-panel">
          <label htmlFor="sql-input">Consulta SQL</label>
          <textarea
            id="sql-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Digite sua query SQL aqui"
            rows={5}
          />
          <div className="input-actions">
            <div className="test-query-picker">
              <button
                type="button"
                className="secondary-action"
                onClick={() => setShowTestQueries((current) => !current)}
                aria-expanded={showTestQueries}
                aria-haspopup="true"
              >
                Queries de Teste
              </button>
              {showTestQueries && (
                <div className="test-query-menu">
                  {TestQueries.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="test-query-option"
                      onClick={() => applyTestQuery(item.query)}
                    >
                      <span>{item.label}</span>
                      <code>{item.query}</code>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="primary-action"
              onClick={handleProcessar}
            >
              Processar
            </button>
          </div>
        </section>

        {erro && (
          <section className="panel error-section">
            <h2>Erro</h2>
            <p className="error-msg">{erro}</p>
          </section>
        )}

        {result && (
          <>
            <section className="panel result-section">
              <h2>Álgebra Relacional Original</h2>
              <pre className="algebra-expr">{result.rawAlgebra}</pre>
            </section>

            <section className="panel result-section">
              <h2>Álgebra Relacional Otimizada</h2>
              <pre className="algebra-expr">{result.optimizedAlgebra}</pre>
            </section>

            <section className="panel graph-panel">
              <div className="section-header">
                <div>
                  <h2>Grafo de Operadores</h2>
                  <p className="section-copy">
                    Alternar entre a estratégia original e a versão otimizada da
                    execução.
                  </p>
                </div>
                <div
                  className="graph-toggle"
                  role="tablist"
                  aria-label="Modo do grafo"
                >
                  <button
                    type="button"
                    className={graphView === "original" ? "is-active" : ""}
                    onClick={() => setGraphView("original")}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    className={graphView === "optimized" ? "is-active" : ""}
                    onClick={() => setGraphView("optimized")}
                  >
                    Otimizado
                  </button>
                </div>
              </div>

              {activeGraph && (
                <OperatorGraph
                  nodes={activeGraph.nodes}
                  edges={activeGraph.edges}
                />
              )}
            </section>

            <section className="panel result-section">
              <h2>Heurísticas Aplicadas</h2>
              <ul className="notes-list">
                {result.optimizationNotes.map((note, index) => (
                  <li key={`${note}-${index}`}>{note}</li>
                ))}
              </ul>
            </section>

            <section className="panel result-section execution-plan">
              <h2>Plano de Execução</h2>
              <ol>
                {result.executionPlan.map((step) => (
                  <li key={step.resultName}>
                    <div className="step-topline">
                      <span className="step-order">#{step.order}</span>
                      <span className="step-operation">{step.operation}</span>
                      <span className="step-result">{step.resultName}</span>
                    </div>
                    <p className="step-description">{step.description}</p>
                    <p className="step-deps">
                      Dependências:{" "}
                      {step.dependsOn.length > 0
                        ? step.dependsOn.join(", ")
                        : "nenhuma"}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
