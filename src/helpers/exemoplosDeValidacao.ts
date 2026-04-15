import { schemaMetadata } from "./schemas";
import validarConsulta from "./validador_query";

const testesValidos: string[] = [
	// Simples e Projeção Total
	"SELECT * FROM Categoria",

	// Filtros e Case Insensitivity
	"select nome, preco from produto where preco > 50",

	// Operadores Relacionais permitidos (<>)
	"SELECT idCliente, Nome FROM Cliente WHERE TipoCliente_idTipoCliente <> 2",

	// JOIN Simples
	"SELECT Produto.Nome, Categoria.Descricao FROM Produto JOIN Categoria ON Produto.Categoria_idCategoria = Categoria.idCategoria",

	// Múltiplos JOINs (Regra 0, 1, ..., N)
	"SELECT Cliente.Nome, Pedido.DataPedido FROM Cliente JOIN Pedido ON Cliente.idCliente = Pedido.Cliente_idCliente JOIN Status ON Pedido.Status_idStatus = Status.idStatus",

	// Precedência com Parênteses e Operador AND
	"SELECT * FROM Produto WHERE ( Preco >= 10 AND QuantEstoque < 100 ) AND Categoria_idCategoria = 1",

	// Atributos Snake Case (conforme Modelo Imagem 01)
	"SELECT idEndereco, Logradouro FROM Endereco WHERE TipoEndereco_idTipoEndereco = 1",

	// Consultas em tabelas menores
	"SELECT Numero FROM Telefone WHERE Cliente_idCliente = 5",

	// Tabelas intermediárias e nomes longos
	"SELECT idPedido, idProduto, Quantidade FROM Pedido_has_Produto JOIN Produto ON Pedido_has_Produto.Produto_idProduto = Produto.idProduto WHERE Quantidade <= 5",

	// Strings e nomes compostos (Tabela.Coluna)
	"SELECT Cliente.Nome, Endereco.Cidade FROM Cliente JOIN Endereco ON Cliente.idCliente = Endereco.Cliente_idCliente WHERE Endereco.UF = 'CE'",
];

export const testesInvalidos: string[] = [
	// --- Comandos Proibidos (Regra: Apenas SELECT) ---
	"DELETE FROM Cliente WHERE idCliente = 1",
	"UPDATE Produto SET Preco = 10",
	"INSERT INTO Categoria (Descricao) VALUES ('Alimentos')",

	// --- Operadores Não Suportados (Regra: Apenas os listados no PDF) ---
	"SELECT Nome FROM Produto WHERE Preco != 50", // != deve ser <>
	"SELECT * FROM Produto WHERE Preco > 10 OR Nome = 'Suco'", // OR não é permitido, apenas AND
	"SELECT Nome FROM Cliente WHERE idCliente # 5", // Caractere # é inválido

	// --- Metadados Inexistentes (Regra: Apenas tabelas/atributos do Modelo) ---
	"SELECT Salario FROM Funcionario", // Tabela e atributo não existem
	"SELECT CPF FROM Cliente", // Atributo inexistente na tabela Cliente
	"SELECT Produto.Nascimento FROM Produto", // Nascimento pertence a Cliente, não a Produto
	"SELECT idPedido FROM Compra", // Tabela Compra não existe no modelo

	// --- Erros de Sintaxe e Estrutura ---
	"SELECT Nome FROM Cliente JOIN Pedido", // JOIN sem a cláusula ON
	"SELECT Nome FROM Cliente WHERE ( Nascimento > '1990-01-01'", // Parêntese não fechado
	"SELECT FROM Cliente", // Falta a lista de atributos (projeção)
	"SELECT Nome, FROM Cliente", // Erro de sintaxe (vírgula sobrando)
	"SELECT * FROM Categoria WHERE idCategoria = ", // Filtro incompleto
	"SELECT Nome FROM Produto WHERE Nascimento > '2000'", // Nascimento existe no schema, mas não na tabela Produto
];

export function rodarExemplosDeValidacao() {
	console.log(
		" =========================================\n",
		"VÁLIDOS\n",
		"=========================================",
	);
	for (const consulta of testesValidos) {
		const resultado = validarConsulta(consulta, schemaMetadata);
		console.log(consulta);
		console.log(resultado);
	}

	console.log(
		" =========================================\n",
		"INVÁLIDOS\n",
		"=========================================",
	);
	for (const consulta of testesInvalidos) {
		const resultado = validarConsulta(consulta, schemaMetadata);
		console.log(consulta);
		console.log(resultado);
	}
}
