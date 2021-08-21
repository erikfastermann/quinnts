function internal(): Error {
    return new Error("internal error");
};

function positionError(pos: Position, message: string): Error {
	return new Error(`${pos.path}|${pos.line} col ${pos.column}| ${message}`);
}

type Ref = {
	kind: "ref";
	value: string;
};

type Atom = {
	kind: "atom";
	value: string;
};

type QSymbol = {
	kind: "symbol";
	value: string;
};

type QNumber = {
	kind: "number";
	value: bigint;
};

type QString = {
	kind: "string";
	value: string;
};

type OpenBracket = {
	kind: "(";
};

type ClosedBracket = {
	kind: ")";
};

type OpenCurly = {
	kind: "{";
};

type ClosedCurly = {
	kind: "}";
};

type OpenSquare = {
	kind: "[";
};

type ClosedSquare = {
	kind: "]";
};

type EndOfLine = {
	kind: "eol";
};

type Unit = {
	kind: "unit";
}

type Call = {
	kind: "call";
	first: Expression;
	arguments: Expression[];
}

type List = {
	kind: "list";
	elements: Expression[];
}

type Block = {
	kind: "block";
	expressions: Expression[];
}

type TokenKind =
	| Ref
	| Atom
	| QSymbol
	| QNumber
	| QString
	| OpenBracket
	| ClosedBracket
	| OpenCurly
	| ClosedCurly
	| OpenSquare
	| ClosedSquare
	| EndOfLine;

type ExpressionKind =
	| Ref
	| Atom
	| QNumber
	| QString
	| Unit
	| Call
	| List
	| Block;

type Position = {
	path: string;
	line: number;
	column: number;
};

type Token = TokenKind & Position;

type Expression = ExpressionKind & Position;

function newExpression(pos: Position, expr: ExpressionKind): Expression {
	return {...expr, path: pos.path, line: pos.line, column: pos.column};
}

// TODO: support non ascii

function isSpace(char: string): boolean {
	return /^\s$/.test(char);
};

function isIdentStart(char: string): boolean {
	return /^[a-zA-Z_]$/.test(char);
};

function isIdent(char: string): boolean {
	return /^[0-9a-zA-Z_]$/.test(char);
};

function isReservedSymbol(char: string): boolean {
	return ['"', "'", '(', ')', '{', '}', '[', ']', '#'].includes(char);
};

function isSymbol(char: string): boolean {
	if (isReservedSymbol(char) || (char == '_')) {
		return false;
	};
	return /^[\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E]$/.test(char);
};

function isNumberStart(char: string): boolean {
	return /^[0-9]$/.test(char);
};

function isNumber(char: string): boolean {
	return /^[0-9_]$/.test(char);
};

class Lexer implements Iterable<Token> {
	path: string;
	chars: Iterator<string>;
	lastChar: {char: string, use: boolean} | null = null;
	line = 1;
	column = 1;
	lastNewline = false;

	lastToken: {token: Token, use: boolean} | null = null;
	finished = false;

	constructor(path: string, byChar: Iterable<string>) {
		this.path = path;
		this.chars = byChar[Symbol.iterator]();
	}

	nextChar(): {char: string, line: number, column: number} | null {
		let char: string;
		if (this.lastChar && this.lastChar.use) {
			this.lastChar.use = false;
			char = this.lastChar.char;
		} else {
			let {done, value} = this.chars.next();
			if (done) {
				return null;
			};
			char = value;
		};
		this.lastChar = {char, use: false};

		if (char == '\n') {
			if (this.lastNewline) {
				this.column = 1;
				return {char, line: this.line++, column: this.column}; 
			} else {
				this.lastNewline = true;
				return {char, line: this.line++, column: this.column}; 
			};
		} else {
			if (this.lastNewline) {
				this.column = 2;
				this.lastNewline = false;
				return {char, line: this.line, column: 1}; 
			} else {
				return {char, line: this.line, column: this.column++}; 
			};
		};
	};

	unreadChar(): void {
		if (!this.lastChar || this.lastChar.use) {
			throw internal();
		};
		this.lastChar.use = true;
		if (this.lastNewline) {
			this.line--;
			this.lastNewline = false;
		} else {
			this.column--;
		};
	};

	takeWhile(predicate: (char: string) => boolean): string {
		let str = "";
		while (true) {
			let char = this.nextChar()?.char;
			if (!char) {
				return str;
			}
			if (!predicate(char)) {
				this.unreadChar();
				return str;
			};
			str += char;
		};
	};

	finishingEol(): Token {
		this.finished = true;
		return { path: this.path, line: this.line, column: this.column, kind: "eol" }
	};

	withPosition(position: {line: number, column: number}, kind: TokenKind): Token {
		return { path: this.path, line: position.line, column: position.column, ...kind }
	};

	nextToken(): Token | null {
		if (this.lastToken && this.lastToken.use) {
			this.lastToken.use = false;
			return this.lastToken.token;
		}
		let token = this.getNextToken();
		if (!token) {
			return null;
		}
		this.lastToken = {token, use: false};
		return token;
	}

	getNextToken(): Token | null {
		let char = this.nextChar();
		if (!char) {
			if (!this.finished) {
				return this.finishingEol();
			};
			return null;
		};

		if (isSpace(char.char)) {
			if (char.char == '\n') {
				return this.withPosition(char, {kind: "eol"});
			};
			while (true) {
				char = this.nextChar();
				if (!char) {
					return this.finishingEol();
				};
				if (!isSpace(char.char)) {
					break;
				};
				if (char.char == '\n') {
					return this.withPosition(char, {kind: "eol"});;
				};
			};
		};

		let start = char;
		if (isReservedSymbol(char.char)) {
			switch (char.char) {
			case '"':
				let str = "";
				while (true) {
					let char = this.nextChar();
					if (!char) {
						throw new Error('string not closed with "')
					};
					if (char.char == '"') {
						return this.withPosition(start, {kind: "string", value: str});
					};
					if (char.char != '\r') {
						str += char.char;
					};
				};
			case "'":
				let char = this.nextChar();
				if (!char || !isIdentStart(char.char)) {
					throw new Error("bare '")
				};
				this.unreadChar();
				return this.withPosition(start, {kind: "atom", value: this.takeWhile(isIdent)});
			case '(':
				return this.withPosition(start, {kind: "("});
			case ')':
				return this.withPosition(start, {kind: ")"});
			case '{':
				return this.withPosition(start, {kind: "{"});
			case '}':
				return this.withPosition(start, {kind: "}"});
			case '[':
				return this.withPosition(start, {kind: "["});
			case ']':
				return this.withPosition(start, {kind: "]"});
			case '#':
				while (true) {
					let char = this.nextChar();
					if (!char) {
						return this.finishingEol();
					};
					if (char.char == '\n') {
						return this.withPosition(char, {kind: "eol"});
					};
				};
			default:
				throw internal();
			};
		} else if (isIdentStart(char.char)) {
			this.unreadChar();
			return this.withPosition(start, {kind: "ref", value: this.takeWhile(isIdent)});
		} else if (isNumberStart(char.char)) {
			this.unreadChar();
			let num = this.takeWhile(isNumber).replace("_", "");
			if ((num.length > 1) && num[0] == '0') {
				throw new Error(`zero padded number ${num}`)
			};
			return this.withPosition(start, {kind: "number", value: BigInt(num)});
		} else if (isSymbol(char.char)) {
			this.unreadChar();
			return this.withPosition(start, {kind: "symbol", value: this.takeWhile(isSymbol)});
		} else {
			// TODO: quote char when necessary
			throw new Error(`unknown character ${char}`);
		};
	};

	unreadToken(): void {
		if (!this.lastToken || this.lastToken.use) {
			throw internal();
		};
		this.lastToken.use = true;
	};

	peekToken(): Token | null {
		let token = this.nextToken();
		this.unreadToken();
		return token;
	}

	mustNextToken(tk?: TokenKind): Token {
		let token = this.nextToken();
		if (!token || (tk && token.kind !== tk.kind)) {
			throw internal();
		}
		return token;
	}

	[Symbol.iterator](): Iterator<Token> {
		return new TokenIterator(this);
	};
};

class TokenIterator implements Iterator<Token> {
	lexer: Lexer;

	constructor(lexer: Lexer) {
		this.lexer = lexer;
	};

	next(): IteratorResult<Token> {
		let token = this.lexer.nextToken();
		if (!token) {
			// the type of Iterator requires that we always return a valid Token
			// so we return eol here
			return {done: true, value: {kind: "eol"}};
		};
		return {done: false, value: token};
	};
};

function collapseExpressions(pos: Position, exprs: Expression[]) {
	switch (exprs.length) {
		case 0:
			return newExpression(pos, {kind: "unit"});
		case 1:
			return newExpression(pos, exprs[0]!);
		default:
			return newExpression(
				pos,
				{
					kind: "call",
					first: exprs[0]!,
					arguments: exprs.slice(1),
				}
			);
	}
}

type ValueOrSymbol = Expression | QSymbol&Position;

interface PrecedenceTable { [key: string]: number; };

function newPrecedenceTable(table: string[][], factor: number): PrecedenceTable {
	let prec: PrecedenceTable = {};
	table.forEach((level, i) => level.forEach(symbol => prec[symbol] = (i + 1) * factor));
	return prec;
}

class Parser {
	lexer: Lexer;
	precedenceTable: PrecedenceTable;

	// TODO: check duplicate symbols
	constructor(lexer: Lexer, lowerThanCall: string[][], higherThanCall: string[][]) {
		this.lexer = lexer;
		this.precedenceTable = {
			...newPrecedenceTable(lowerThanCall, -1),
			"call": 0,
			...newPrecedenceTable(higherThanCall, 1)
		};
	}

	parse(): Expression[] {
		let expressions = [];
		while (true) {
			let start = this.lexer.peekToken();
			if (!start) {
				return expressions;
			}
			let valuesOrSymbols: ValueOrSymbol[] = [];
			while(true) {
				let next = this.lexer.nextToken();
				if (!next) {
					break;
				} else if (next.kind === "eol") {
					if (valuesOrSymbols[valuesOrSymbols.length-1]?.kind === "symbol") {
						continue;
					} else {
						break;
					}
				} else if (next.kind === "symbol") {
					valuesOrSymbols.push(next);
				} else {
					this.lexer.unreadToken();
					valuesOrSymbols.push(this.value());
				}
			}
			if (valuesOrSymbols.length > 0) {
				expressions.push(this.collapse(start, valuesOrSymbols));
			}
		}
	}

	callOrValue(): Expression {
		let openBracket = this.lexer.mustNextToken({kind: '('});
		let valuesOrSymbols: ValueOrSymbol[] = [];
		while (true) {
			let next = this.lexer.nextToken();
			if (!next) {
				throw new Error("expected ')', got eof");
			}
			if (next.kind === "eol") {
				continue;
			} else if (next.kind === ")") {
				break;
			} else if (next.kind === "symbol") {
				valuesOrSymbols.push(next);
			} else {
				this.lexer.unreadToken();
				valuesOrSymbols.push(this.value());
			}
		}
		return this.collapse(openBracket, valuesOrSymbols);
	}

	// TODO: allow symbols with higher precedence than call in lists
	list(): Expression {
		let openSquare = this.lexer.mustNextToken({kind: "["});
		let elements: Expression[] = [];
		while (true) {
			let next = this.lexer.nextToken();
			if (!next) {
				throw new Error("expected ']', got eof");
			}
			if (next.kind === "eol") {
				continue;
			} else if (next.kind === "]") {
				break;
			} else {
				this.lexer.unreadToken();
				elements.push(this.value());
			}
		}
		return newExpression(openSquare, {kind: "list", elements});
	}

	block(): Expression {
		let openCurly = this.lexer.mustNextToken({kind: "{"});
		let expressions = [];
		while (true) {
			let start = this.lexer.peekToken();
			let valuesOrSymbols: ValueOrSymbol[] = [];
			while(true) {
				let next = this.lexer.nextToken();
				if (!next) {
					throw new Error("expected '}', got eof");
				} else if (next.kind === "eol") {
					if (valuesOrSymbols[valuesOrSymbols.length-1]?.kind === "symbol") {
						continue;
					} else {
						this.lexer.unreadToken();
						break;
					}
				} else if (next.kind === "}") {
					this.lexer.unreadToken();
					break;
				} else if (next.kind === "symbol") {
					valuesOrSymbols.push(next);
				} else {
					this.lexer.unreadToken();
					valuesOrSymbols.push(this.value());
				}
			}
			if (valuesOrSymbols.length > 0) {
				expressions.push(this.collapse(start!, valuesOrSymbols));
			}
			if (this.lexer.mustNextToken().kind === '}') {
				return newExpression(openCurly, {kind: "block", expressions});
			}
		}
	}

	value(): Expression {
		const token = this.lexer.nextToken();
		if (!token) {
			throw new Error("unexpected eof");
		} else if ([')', ']', '}', "eol"].includes(token.kind)) {
			throw positionError(token, `unexpected ${token.kind}`)
		} else if (["string", "number", "ref", "atom"].includes(token.kind)) {
			return token as Expression;
		} else {
			switch (token.kind) {
			case "symbol":
				throw positionError(token, `unexpected symbol ${token.value}`);
			case '(':
				this.lexer.unreadToken();
				return this.callOrValue();
			case '{':
				this.lexer.unreadToken();
				return this.block();
			case '[':
				this.lexer.unreadToken();
				return this.list();
			default:
				throw internal();
			}
		}
	}

	collapse(start: Position, valsOrSyms: ValueOrSymbol[]): Expression {
		let parser = new OperatorParser(start, this.precedenceTable, valsOrSyms);
		return parser.parse();
	}
}

class OperatorParser {
	start: Position;
	precedenceTable: PrecedenceTable;
	valsOrSyms: ValueOrSymbol[];
	position = 0;

	constructor(start: Position, precedenceTable: PrecedenceTable, valsOrSyms: ValueOrSymbol[]) {
		if (valsOrSyms[0]?.kind === "symbol") {
			let sym = valsOrSyms[0];
			throw positionError(sym, `unexpected symbol ${sym.value}`);
		}
		let lastSym = false;
		for (let valOrSym of valsOrSyms) {
			if (valOrSym.kind === "symbol") {
				if (lastSym) {
					throw positionError(
						valOrSym,
						`symbol ${valOrSym.value} directly follows another symbol`,
					);
				}
				if (!(valOrSym.value in precedenceTable)) {
					throw positionError(
						valOrSym,
						`unknown operator ${valOrSym.value}`
					)
				}
				lastSym = true;
			} else {
				lastSym = false;
			}
		}
		if (valsOrSyms[valsOrSyms.length - 1]?.kind === "symbol") {
			let sym = valsOrSyms[valsOrSyms.length - 1] as (QSymbol&Position);
			throw positionError(sym, `unexpected symbol ${sym.value}`);
		}

		this.start = start;
		this.precedenceTable = precedenceTable;
		this.valsOrSyms = valsOrSyms;
	}

	precedence(sym: QSymbol): number {
		let prec = this.precedenceTable[sym.value];
		if (prec === undefined) {
			throw internal();
		}
		return prec;
	}

	next(): ValueOrSymbol | null {
		let position = this.position;
		this.position++;
		if (position >= this.valsOrSyms.length) {
			return null;
		} else {
			return this.valsOrSyms[position]!;
		}
	}

	peek(): ValueOrSymbol | null {
		if (this.position >= this.valsOrSyms.length) {
			return null;
		} else {
			return this.valsOrSyms[this.position]!;
		}
	}

	skip(n: number): void {
		let next = this.position + n;
		if (n === 0 || next > this.valsOrSyms.length || next < 0) {
			throw internal();
		}
		this.position = next;
	}

	parse(): Expression {
		let exprs = [];
		while (true) {
			let next = this.next();
			if (!next) {
				return collapseExpressions(this.start, exprs);
			} else if (next.kind === "symbol") {
				return this.operatorLower(
					next,
					collapseExpressions(exprs[0] ?? this.start, exprs),
				);
			} else {
				let op = this.operator(next);
				if (!op) {
					exprs.push(next);
				} else {
					exprs.push(op);
				}
			}
		}
	}

	operatorLower(sym: QSymbol&Position, left: Expression): Expression {
		const kind = "call";
		let first = newExpression(sym, { kind: "ref", value: sym.value });
		let right: Expression[] = [];
		const collapseRight = (): Expression => {
			let position = right[0];
			if (!position) {
				throw internal();
			}
			return collapseExpressions(position, right);
		};

		while (true) {
			let next = this.next();
			if (!next) {
				return newExpression(left, {
					kind,
					first,
					arguments: [left, collapseRight()],
				});
			} else if (next.kind === "symbol") {
				if (this.precedence(next) < this.precedence(sym)) {
					return newExpression(left, {
						kind,
						first,
						arguments: [
							left,
							this.operatorLower(
								next,
								collapseRight(),
							),
						],
					})
				} else {
					return this.operatorLower(next,
						newExpression(left, {
							kind,
							first,
							arguments: [left, collapseRight()],
						}),
					)
				}
			} else {
				let op = this.operator(next);
				if (!op) {
					right.push(next);
				} else {
					right.push(op);
				}
			}
		}
	}

	operator(left: Expression): Expression | null {
		let sym = this.next();
		if (!sym || sym.kind !== "symbol" || this.precedence(sym) < 0) {
			this.skip(-1);
			return null;
		}
		let right = this.next();
		if (!right || right.kind === "symbol") {
			throw internal();
		}
		const kind = "call";
		let first = newExpression(sym, {kind: "ref", value: sym.value});
		let current: Call = { kind, first, arguments: [left, right] };
		let currentExpr = newExpression(left, current);

		let nextSym = this.peek();
		if (!nextSym || nextSym.kind !== "symbol") {
			return currentExpr;
		}
		if (this.precedence(nextSym) > this.precedence(sym)) {
			let next = this.operator(right);
			if (!next) {
				return currentExpr;
			} else {
				return newExpression(left, {kind, first, arguments: [left, next]});
			}
		} else {
			let next = this.operator(currentExpr);
			if (!next) {
				return currentExpr;
			} else {
				return next;
			}
		}
	}
}

function expressionString(expr: Expression): string {
	switch (expr.kind) {
	case "unit":
		return "()";
	case "call":
		let first = expressionString(expr.first);
		if (expr.arguments.length < 1) {
			return `(${first} ())`;
		}
		let args = expr.arguments.map(arg => expressionString(arg)).join(" ");
		return `(${first} ${args})`;
	case "list":
		let elements = expr.elements.map(arg => expressionString(arg)).join(" ");
		return `[${elements}]`;
	case "block":
		let exprs = expr.expressions.map(arg => expressionString(arg)).join("\n");
		if (expr.expressions.length < 2) {
			return `{ ${exprs} }`;
		}
		return `{\n${exprs}\n}`;
	default:
		return expr.value.toString();
	}
}

function run() {
	let code = (document.getElementById("code") as HTMLInputElement).value;

	let tokens = [];
	for (let tok of new Lexer("textarea", code)) {
		if (tok.kind === "atom"
			|| tok.kind === "number"
			|| tok.kind === "ref"
			|| tok.kind === "string"
			|| tok.kind === "symbol"
		) {
			tokens.push(`${tok.kind} (${tok.value})`)
		} else {
			tokens.push(`${tok.kind}`);
		}
	};
	console.log(tokens.join(", "));

	let parser = new Parser(
		new Lexer("textarea", code),
		[
			["=", "->"],
			["|>"],
		],
		[
			["->"],
			["&&", "||"],
			["==", "!="],
			["<", "<=", ">", ">="],
			["..", "..<", "<..", "<..<"],
			["++"],
			["+", "-"],
			["*", "/", "//", "%%"],
			["@"],
			["."],
		],
	);
	let exprs = parser.parse();
	for (let expr of exprs) {
		console.log(expressionString(expr));
	}
};