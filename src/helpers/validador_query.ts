import type { Schema } from "./schemas";

/**
 * >> REQUISITOS <<
 * Suportar: SELECT, FROM, WHERE, JOIN, ON
 * Suportar: =,	>, <, <=, >=, <>, AND, (	)
 * Verificação	de	existência	de	tabelas	e atributos
 * suportar	múltiplos JOINs (0,	1, …, N)
 * Deve	ignorar	a diferença	entre palavras maiúsculas e minúsculas
 */

export default function validarConsulta(
	query: string,
	schema: Schema,
): { valida: boolean; erro?: string } {
	// 1 - Normalizar a query
	const queryNormalizada = normalizarQuery(query).toLowerCase();

	// 2 - Validar o balanço dos parênteses
	if (!validarParenteses(queryNormalizada)) {
		return {
			valida: false,
			erro: "Erro de sintaxe: parênteses desbalanceados",
		};
	}

	// 3 - Validar a query
	if (!validarQuery(queryNormalizada)) {
		return {
			valida: false,
			erro: "Sintaxe SQL básica inválida ou comandos não suportados",
		};
	}

	// 4 - Validar se tem tabelas inválidas
	const tabelasInvalidas = getTabelasInvalidas(queryNormalizada, schema);

	if (tabelasInvalidas.length > 0) {
		return {
			valida: false,
			erro: `Tabelas não encontradas: ${tabelasInvalidas.join(", ")}`,
		};
	}

	// 5 - Validar os atributos
	return validarAtributos(queryNormalizada, schema);
}

// ==========================================================================================
// ================================    FUNÇÕES DE AJUDA    ==================================
// ==========================================================================================

// 1 - Remove possíveis espaços extras e quebras de linha
function normalizarQuery(query: string): string {
	return query
		.replace(/\(/g, " ( ")
		.replace(/\)/g, " ) ")
		.replace(/(=|>|<|>=|<=|<>)/g, " $1 ")
		.replace(/\s+/g, " ")
		.trim();
}

// 2 - Verifica se os parênteses estão balanceados
function validarParenteses(query: string): boolean {
	const pilha = [];
	for (const caractere of query) {
		if (caractere === "(") {
			pilha.push("(");
		} else if (caractere === ")") {
			if (pilha.length === 0) return false;
			pilha.pop();
		}
	}
	return pilha.length === 0;
}

// 3 - Valida a estrutura básica da query usando regex
function validarQuery(query: string): boolean {
	const validadorRegex =
		/^select\s+[a-z0-9_.*,\s]+\s+from\s+[a-z0-9_.]+(?:\s+[a-z0-9_.]+)?(?:\s+join\s+[a-z0-9_.]+(?:\s+[a-z0-9_.]+)?\s+on\s+[a-z0-9_.]+\s*[=<>]{1,2}\s*[a-z0-9_.]+)*(?:\s+where\s+[a-z0-9_=><\s().']+)?$/i;

	return validadorRegex.test(query);
}

// 4 - Extrai as tabelas da query e verifica se existem no schema
function getTabelasInvalidas(query: string, schema: Schema): string[] {
	const tabelasInvalidas: string[] = [];
	const tabelas =
		query
			.match(/(?:from|join)\s+([a-z0-9_]+)/gi)
			?.map((t) => t.split(/\s+/)[1]) || [];

	for (const tabela of tabelas) {
		if (!schema[tabela]) {
			tabelasInvalidas.push(tabela);
		}
	}

	return tabelasInvalidas;
}

// 5 - Valida os atributos usados na query, verificando se existem no schema
function validarAtributos(
	query: string,
	schema: Schema,
): { valida: boolean; erro?: string } {
	const todosAtributosValidos = Object.values(schema).flat();
	const atributosNaQuery =
		query.match(
			/([a-z0-9_]+\.[a-z0-9_]+)|(?<=\bselect\s+|\bwhere\s+|\bon\s+)([a-z0-9_]+)/gi,
		) || [];

	for (const atributo of atributosNaQuery) {
		// Se for formato tabela.coluna
		if (atributo.includes(".")) {
			const [tab, col] = atributo.split(".");

			if (!schema[tab] || !schema[tab].includes(col)) {
				return {
					valida: false,
					erro: `Atributo ou referência inválida: ${atributo}`,
				};
			}
		} else {
			// Se for apenas a coluna
			if (
				!todosAtributosValidos.includes(atributo) &&
				!["*", "and", "on"].includes(atributo)
			) {
				if (!/^(and|or|join|on|where|select|from)$/.test(atributo)) {
					return {
						valida: false,
						erro: `Atributo não reconhecido: ${atributo}`,
					};
				}
			}
		}
	}

	return { valida: true };
}
