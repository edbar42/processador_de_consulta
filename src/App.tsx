import { useState } from "react";
import "./App.css";
import OperatorGraph from "./components/OperatorGraph";
import { buildExecutionPlan, type ExecutionStep } from "./helpers/executionPlan";
import { optimizeAlgebra, summarizeOptimization } from "./helpers/optimizer";
import { buildOperatorGraph, type OperatorGraphData } from "./helpers/operatorGraph";
import { parseSqlQuery } from "./helpers/sqlParser";
import { schemaMetadata } from "./helpers/schemas";
import { algebraToString, queryToAlgebra } from "./helpers/sqlToAlgebra";
import validarConsulta from "./helpers/validador_query";

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

  function handleProcessar() {
    setErro(null);
    setResult(null);

    if (!query.trim()) {
      setErro("Digite uma consulta SQL.");
      return;
    }

    const validacao = validarConsulta(query, schemaMetadata);
    if (!validacao.valida) {
      setErro(validacao.erro ?? "Consulta inválida.");
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
      setErro(error instanceof Error ? error.message : "Erro ao processar a consulta.");
    }
  }

  const activeGraph =
    graphView === "original" ? result?.rawGraph : result?.optimizedGraph;

  return (
    <div className="app-shell">
      <div className="app-container">
        <header className="hero">
          <p className="eyebrow">Banco de Dados</p>
          <h1>Processador de Consultas</h1>
          <p className="hero-copy">
            Valide a consulta SQL, visualize a álgebra relacional, o grafo de
            operadores e o plano de execução otimizado.
          </p>
        </header>

        <section className="panel input-panel">
          <label htmlFor="sql-input">Consulta SQL</label>
          <textarea
            id="sql-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="SELECT Cliente.Nome, Pedido.DataPedido FROM Cliente JOIN Pedido ON Cliente.idCliente = Pedido.Cliente_idCliente WHERE Pedido.ValorTotalPedido > 100"
            rows={5}
          />
          <button type="button" onClick={handleProcessar}>
            Processar
          </button>
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
                    Alternar entre a estratégia original e a versão otimizada da execução.
                  </p>
                </div>
                <div className="graph-toggle" role="tablist" aria-label="Modo do grafo">
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
                <OperatorGraph nodes={activeGraph.nodes} edges={activeGraph.edges} />
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
                      {step.dependsOn.length > 0 ? step.dependsOn.join(", ") : "nenhuma"}
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
