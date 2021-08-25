function internal(): Error {
    return new Error("internal error");
}

function unreachable(): never {
	throw new Error("unreachable");
}

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

type Callable = (Ref | Block | Call) & Position;

type Call = {
	kind: "call";
	first: Callable;
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

function collapseExpressions(pos: Position, exprs: Expression[]): Expression {
	switch (exprs.length) {
		case 0:
			return newExpression(pos, {kind: "unit"});
		case 1:
			return newExpression(pos, exprs[0]!);
		default:
			let first = exprs[0]!;
			if (first.kind !== "ref"
				&& first.kind !== "block"
				&& first.kind !== "call"
			) {
				throw positionError(first, "can only call ident, block or call");
			}
			return newExpression(
				pos,
				{
					kind: "call",
					first,
					arguments: exprs.slice(1),
				}
			);
	}
}

type ValueOrSymbol = Expression | QSymbol&Position;

interface PrecedenceTable { [key: string]: number; };

class Parser {
	lexer: Lexer;
	precedenceTable: PrecedenceTable;

	// TODO: check duplicate symbols
	constructor(lexer: Lexer, lowerThanCall: string[][], higherThanCall: string[][]) {
		this.lexer = lexer;
		this.precedenceTable = {};
		let insertPrecedence = (table: string[][], factor: number) => {
			table.forEach((level, i) => level.forEach(symbol => {
				if (!stringAll(symbol, isSymbol) || this.precedenceTable.hasOwnProperty(symbol)) {
					throw internal();
				}
				this.precedenceTable[symbol] = (i + 1) * factor;
			}));
		};
		insertPrecedence(lowerThanCall, -1),
		this.precedenceTable["call"] = 0;
		insertPrecedence(higherThanCall, 1)
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
				if (!precedenceTable.hasOwnProperty(valOrSym.value)) {
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
		let first = newExpression(
			sym,
			{ kind: "ref", value: sym.value },
		) as Ref&Position;
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
		let first = newExpression(
			sym,
			{kind: "ref", value: sym.value},
		) as Ref&Position;
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

class Namespace<T> implements Iterable<[string, T]>{
	entry: NamespaceEntry<T> | null;

	constructor(entry: NamespaceEntry<T> | null = null) {
		this.entry = entry;
	}

	toString(): string {
		if (!this.entry) {
			return "";
		} else {
			return this.entry.toString();
		}
	}

	get(key: string): T | undefined {
		try {
			return this.mustGet(key);
		} catch {
			return undefined;
		}
	}

	mustGet(key: string): T {
		if (!this.entry) {
			throw new Error(`key ${key} not found`);
		}
		return this.entry.mustGet(key);
	}

	insert(key: string, value: T): Namespace<T> | undefined {
		try {
			return this.mustInsert(key, value);
		} catch {
			return undefined;
		}
	}

	mustInsert(key: string, value: T): Namespace<T> {
		if (!this.entry) {
			return new Namespace(new NamespaceEntry(key, value, null, null));
		}
		return new Namespace(this.entry.mustInsert(key, value));
	}

	*[Symbol.iterator](): Iterator<[string, T]> {
		if (!this.entry) {
			return;
		}
		yield* this.entry;
	}
}

class NamespaceEntry<T> implements Iterable<[string, T]>{
	key: string;
	value: T;
	left: NamespaceEntry<T> | null = null;
	right: NamespaceEntry<T> | null = null;

	constructor(
		key: string,
		value: T,
		left: NamespaceEntry<T> | null,
		right: NamespaceEntry<T> | null
	) {
		this.key = key;
		this.value = value;
		this.left = left;
		this.right = right;
	}

	toString(): string {
		let str = "";
		if (this.left) {
			str += this.left.toString() + ", ";
		}
		str += `${this.key}: ${this.value}`;
		if (this.right) {
			str += ", " + this.right.toString();
		}
		return str;
	}

	mustGet(key: string): T {
		let current: NamespaceEntry<T> = this;
		while (true) {
			if (key < current.key) {
				if (!current.left) {
					throw new Error(`key ${key} not found`);
				}
				current = current.left;
			} else if (key > current.key) {
				if (!current.right) {
					throw new Error(`key ${key} not found`);
				}
				current = current.right;
			} else {
				return current.value;
			}
		}
	}

	mustInsert(key: string, value: T): NamespaceEntry<T> {
		if (key < this.key) {
			if (!this.left) {
				return new NamespaceEntry(
					this.key,
					this.value,
					new NamespaceEntry(key, value, null, null),
					this.right,
				);
			}
			return new NamespaceEntry(
				this.key,
				this.value,
				this.left.mustInsert(key, value),
				this.right,
			);
		} else if (key > this.key) {
			if (!this.right) {
				return new NamespaceEntry(
					this.key,
					this.value,
					this.left,
					new NamespaceEntry(key, value, null, null),
				);
			}
			return new NamespaceEntry(
				this.key,
				this.value,
				this.left,
				this.right.mustInsert(key, value),
			);
		} else {
			throw new Error(`duplicate key ${key}`)
		}
	}

	*[Symbol.iterator](): Iterator<[string, T]> {
		if (this.left) {
			yield* this.left;
		}
		yield [this.key, this.value];
		if (this.right) {
			yield* this.right;
		}
	}
}

const ourNamespace = "ourNamespace";

const theirNamespace = "theirNamespace";

const internalNamespaceInsertMap = "namespaceInsertMap";

const unpackAndMaybeAddToOurs = "unpackAndMaybeAddToOurs";

const unpackAndMaybeAddToOursDefinition = `const ${unpackAndMaybeAddToOurs} = ([insertable, ret]) => {
	if (insertable) {
		${ourNamespace} = ${internalNamespaceInsertMap}(${ourNamespace}, insertable);
	}
	return ret;
};`

const internalNewAtom = "newAtom";

const internalNewList = "newList";

const internalNewBlock = "newBlock";

const internalMatch = "match";

const internalIsList = "isList";

const internalIsMap = "isMap";

function stringMap(str: string, predicate: (char: string) => string): string {
	let out = "";
	for (let char of str) {
		out += predicate(char);
	}
	return out;
}

function toJavascriptString(str: string): string {
	let esc = stringMap(str, char => {
		if (char === "\\") {
			return "\\\\";
		} else if (char === '"') {
			return '\\"';
		} else {
			return char;
		}
	});
	return `"${esc}"`;
}

const symbolAssign = "=";

const errorMessageAssignMatch = `${symbolAssign} pattern match failed`;

const throwAssignMatch = `throw new Error(${toJavascriptString(errorMessageAssignMatch)});`

function asAssignment(call: Call): {assignee: Expression, value: Expression} | null {
	if (call.first.kind !== "ref"
		|| call.first.value !== symbolAssign
		|| call.arguments.length !== 2) {
			return null;
	}
	return { assignee: call.arguments[0]!, value: call.arguments[1]! };
}

function newJavascriptNumber(n: number | bigint): string {
	return `${n}n`;
}

class Compiler {
	varNames: Namespace<string>;
	body: Expression[];
	temporariesIndex: number;
	code = "";

	constructor(varNames: Namespace<string>, body: Expression[], temporariesOffset = 0) {
		this.varNames = varNames;
		this.body = body;
		this.temporariesIndex = temporariesOffset;
	}

	compile(): string {
		if (this.body.length === 0) {
			this.code = "return [null, null];"
		}
		if (this.code !== "") {
			return this.code;
		}

		for (let i = 0; i < this.body.length-1; i++) {
			let expr = this.body[i]!;
			if (expr.kind !== "call") {
				continue;
			}
			let assign = asAssignment(expr);
			if (!assign) {
				this.code += this.expr(expr) + ";";
			} else {
				this.assignment(assign.assignee, this.expr(assign.value));
			}
		}
		let last = this.expr(this.body[this.body.length-1]!);
		this.code += `return [null, ${last}];`
		return this.code;
	}

	expr(expr: Expression): string {
		switch (expr.kind) {
		case "unit":
			return "null";
		case "number":
			return newJavascriptNumber(expr.value);
		case "string":
			return `${toJavascriptString(expr.value)}`
		case "atom":
			return `(${internalNewAtom}(${toJavascriptString(expr.value)}))`;
		case "ref":
			return this.varNames.get(expr.value)
				?? `(${ourNamespace}.mustGet(${toJavascriptString(expr.value)}))`;
		case "call":
			let first = this.expr(expr.first);
			let args = expr.arguments.map(arg => this.expr(arg)).join(", ");
			return `(${unpackAndMaybeAddToOurs}(${first}(${ourNamespace}, ${args})))`;
		case "list":
			let elements = expr.elements.map(e => this.expr(e)).join(", ");
			return `(${internalNewList}(${elements}))`;
		case "block":
			let content = new Compiler(this.varNames, expr.expressions).compile();
			return `(${internalNewBlock}(${ourNamespace}, function(${theirNamespace}, ...args) {\n`
				+ "if (args.length !== 0) {\n"
				+ "\tthrow new Error('cannot call basic block with arguments');\n"
				+ "}\n"
				+ `let ${ourNamespace} = this;\n`
				+ unpackAndMaybeAddToOursDefinition + '\n\n'
				+ content + "\n}))";
		}
	}

	assignment(assignee: Expression, value: string): void {
		if (assignee.kind === "unit"
			|| assignee.kind === "number"
			|| assignee.kind === "string"
		) {
			this.code += `if (${this.expr(assignee)} !== ${value}) {\n`
				+ `\t${throwAssignMatch}\n`
				+ "}\n";
		} else if (assignee.kind === "atom") {
			let varName = toJavascriptVarName(assignee.value);
			let next = this.varNames.insert(assignee.value, varName);
			let temp = this.addTemporaryWith(value);
			if (next !== undefined) {
				this.varNames = next;
				this.code += `const ${varName} = ${temp};\n`
			}
			this.code += `${ourNamespace} = ${ourNamespace}.mustInsert(`
				+ `${toJavascriptString(assignee.value)}, ${temp});\n`
		} else if (assignee.kind === "list") {
			let temp = this.addTemporaryWith(value);
			let expectedLength = newJavascriptNumber(assignee.elements.length);
			this.code += `if (!${internalIsList}(${temp}) || ${temp}.len() !== ${expectedLength}) {\n`
				+ `\t${throwAssignMatch}\n`
				+ "}\n";
			for (let i = 0; i < assignee.elements.length; i++) {
				let element = assignee.elements[i]!;
				this.assignment(element, `${temp}.at(${newJavascriptNumber(i)})`);
			}
		} else {
			let temp = this.newTemporary();
			this.code += `const ${temp} = `
				+ `${internalMatch}(${this.expr(assignee)}, ${value});\n`;
				+ `if (!${temp}) {\n`
				+ `\t${throwAssignMatch}\n`
				+ "}\n"
				+ `if (${internalIsMap}(${temp})) {\n`
				+ `\t${ourNamespace} = ${internalNamespaceInsertMap}(${ourNamespace}, ${temp});\n`
				+ "}\n";
		}
	}

	newTemporary(): string {
		let name = `_${this.temporariesIndex}`
		this.temporariesIndex++;
		return name;
	}

	addTemporaryWith(expr: string): string {
		let name = this.newTemporary();
		this.code += `const ${name} = ${expr};\n`;
		return name;
	}
}

type Value = 
	| null
	| boolean
	| bigint
	| string
	| Return
	| Mut
	| Unique
	| RuntimeBlock
	| RuntimeAtom
	| RuntimeList
	| RuntimeMap;

function valueString(v: Value): string {
	if (v === null) {
		return "()";
	} else if (typeof v === "function") {
		return "block";
	} else {
		return v.toString();
	}
}

function valueEquals(v1: Value, v2: Value): boolean {
	if (v1 === null
		|| typeof v1 === "boolean"
		|| typeof v1 === "bigint"
		|| typeof v1 === "string"
	) {
		return v1 === v2;
	} else if (typeof v1 === "function") {
		return false;
	} else {
		return v1.equals(v2);
	}
}

class Return {
	value: Value;

	constructor(value: Value) {
		this.value = value;
	}

	equals(other: Value): boolean {
		if (!(other instanceof Return)) {
			return false;
		}
		return valueEquals(this.value, other.value);
	}

	toString(): string {
		return `(return ${valueString(this.value)})`;
	}
}

class Mut {
	value: Value;

	constructor(value: Value) {
		this.value = value;
	}

	equals(other: Value): boolean {
		if (!(other instanceof Mut)) {
			return false;
		}
		return valueEquals(this.value, other.value);
	}

	toString(): string {
		return `(mut ${valueString(this.value)})`;
	}
}

class Unique {
	equals(other: Value): boolean {
		if (!(other instanceof Unique)) {
			return false;
		}
		return this === other;
	}

	toString(): string {
		return "unique";
	}
}

type RuntimeBlock = {
	namespace: Namespace<Value>;
	original: RuntimeBlockFunction;
	(ns: Namespace<Value>, ...args: (Value | undefined)[]):
		ReturnType<RuntimeBlockFunction>;
};

type RuntimeBlockFunction = (ns: Namespace<Value>, ...args: (Value | undefined)[])
	=> [RuntimeMap | null, Value];

class RuntimeAtom {
	value: string;

	constructor(value: string) {
		this.value = value;
	}

	equals(other: Value): boolean {
		if (!(other instanceof RuntimeAtom)) {
			return false;
		}
		return this.value === other.value;
	}

	toString(): string {
		return `(atom ${valueString(this.value)})`;
	}
}

// TODO: efficient list
class RuntimeList implements Iterable<Value> {
	elements: Value[];

	constructor(...elements: Value[]) {
		this.elements = elements;
	}

	equals(other: Value): boolean {
		if (!(other instanceof RuntimeList)) {
			return false;
		}
		if (this.elements.length !== other.elements.length) {
			return false;
		};
		for (let i = 0; i < this.elements.length; i++) {
			if (!valueEquals(this.elements[i]!, other.elements[i]!)) {
				return false;
			}
		}
		return true;
	}

	len(): bigint {
		return BigInt(this.elements.length);
	}

	at(idx: bigint): Value {
		if (idx < 0 || idx >= this.elements.length) {
			throw new Error(`
				list out of bounds (${idx} with length ${this.elements.length})`,
			);
		}
		return this.elements[Number(idx)]!;
	}

	append(value: Value): RuntimeList {
		let next = this.elements.slice();
		next.push(value);
		return new RuntimeList(...next);
	} 

	toString(): string {
		return "[" + this.elements.map(e => valueString(e)).join(" ") + "]";
	}

	*[Symbol.iterator]() {
		yield* this.elements;
	}
}

// TODO: efficient map
class RuntimeMap implements Iterable<RuntimeList> {
	elements: { key: Value, value: Value }[];
	
	constructor(elements: { key: Value, value: Value }[]) {
		this.elements = elements;
	}

	static fromRuntimeValues(ns: Namespace<Value>, ...values: Value[]): RuntimeMap {
		let elements = [];
		for (let v of values) {
			let key;
			let value;
			if (v instanceof RuntimeAtom) {
				key = v;
				value = ns.mustGet(v.value);
			} else if (v instanceof RuntimeList && v.len() == 2n) {
				key = v.at(0n);
				value = v.at(1n);
			} else {
				throw new Error(
					"can only create map from list of atoms or pairs of key and value",
				);
			}

			for (let { key: existingKey } of elements) {
				if (valueEquals(key, existingKey)) {
					throw new Error(`duplicate key ${valueString(key)} while creating map`);
				}
			}
			elements.push({ key, value });
		}
		return new RuntimeMap(elements);
	}

	tryGet(key: Value): Value | undefined {
		try {
			return this.get(key);
		} catch {
			return undefined;
		}
	}

	get(key: Value): Value {
		for (let { key: ourKey, value } of this.elements) {
			if (valueEquals(key, ourKey)) {
				return value;
			}
		}
		throw new Error(`map: failed getting value for key ${valueString(key)}`);
	}

	insert(key: Value, value: Value): RuntimeMap {
		for (let { key: ourKey } of this.elements) {
			if (valueEquals(key, ourKey)) {
				throw new Error(`map insert failed, duplicate key ${valueString(key)}`);
			}
		}
		let next = this.elements.slice();
		next.push({ key, value });
		return new RuntimeMap(next);
	}

	insertMany(other: RuntimeMap): RuntimeMap {
		for (let { key } of other.elements) {
			for (let { key: ourKey } of this.elements) {
				if (valueEquals(key, ourKey)) {
					throw new Error(`map insertMany failed, duplicate key ${valueString(key)}`);
				}
			}
		}
		let next = this.elements.slice();
		for (let { key, value } of other.elements) {
			next.push({ key, value });
		}
		return new RuntimeMap(next);
	}

	equals(other: Value): boolean {
		if (!(other instanceof RuntimeMap)) {
			return false;
		}
		if (this.elements.length !== other.elements.length) {
			return false;
		}
		for (let { key, value } of this.elements) {
			let found = false;
			for (let { key: otherKey, value: otherValue } of other.elements) {
				if (valueEquals(key, otherKey)) {
					if (valueEquals(value, otherValue)) {
						found = true;
						break
					} else {
						return false;
					}
				}
			}
			if (!found) {
				return false;
			}
		}
		return true;
	}

	toString(): string {
		let str = "map";
		for (let { key, value } of this.elements) {
			str += ` [(${valueString(key)}) (${valueString(value)})]`;
		}
		return str;
	}

	*[Symbol.iterator]() {
		for (let { key, value } of this.elements) {
			yield new RuntimeList(key, value);
		}
	}
}

function match(matcher: Value, value: Value): boolean | RuntimeMap {
	if (matcher === null
		|| typeof matcher === "boolean"
		|| typeof matcher === "bigint"
		|| typeof matcher === "string"
	) {
		return matcher === value;
	} else if (matcher instanceof RuntimeAtom) {
		return RuntimeMap.fromRuntimeValues(new Namespace(), new RuntimeList(matcher, value));
	} else if (typeof matcher === "function") {
		let result = matcher(new Namespace(), value)[1];
		if (typeof result === "boolean" || result instanceof RuntimeMap) {
			return result;
		} else {
			throw new Error("matcher block must return boolean or map");
		}
	} else if (matcher instanceof RuntimeList) {
		if (!(value instanceof RuntimeList) || matcher.len() != value.len()) {
			return false;
		}
		let results = RuntimeMap.fromRuntimeValues(new Namespace());
		for (let i = 0n; i < matcher.len(); i++) {
			let result = match(matcher.at(i), value.at(i));
			if (!result) {
				return false;
			}
			if (result instanceof RuntimeMap) {
				results = results.insertMany(result);
			}
		}
		return results;
	} else if (matcher instanceof RuntimeMap) {
		if (!(value instanceof RuntimeMap)) {
			return false;
		}
		let results = RuntimeMap.fromRuntimeValues(new Namespace());
		for (let kv of matcher) {
			let found = value.tryGet(kv.at(0n));
			if (found === undefined) {
				return false;
			}
			let result = match(kv.at(1n), found);
			if (!result) {
				return false;
			}
			if (result instanceof RuntimeMap) {
				results = results.insertMany(result);
			}
		}
		return results;
	} else if (matcher instanceof Mut) {
		if (!(value instanceof Mut)) {
			return false;
		}
		return match(matcher.value, value.value);
	} else if (matcher instanceof Return) {
		if (!(value instanceof Return)) {
			return false;
		}
		return match(matcher.value, value.value);
	} else if (matcher instanceof Unique) {
		return matcher.equals(value);
	} else {
		unreachable();
	}
}


function println(s: string) {
	console.log(s);
}

function checkArgumentLength(expected: number, got: { length: number }): void {
	if (expected !== got.length-1) {
		throw new Error(`expected ${expected} arguments, got ${got.length-1}`);
	}
}

// TODO: better error handling
function argumentError(): Error {
	return new Error("bad argument type(s)");
}

function doNamespaceInsertMap(namespace: Namespace<Value>, map: RuntimeMap): Namespace<Value> {
	for (let atomAndValue of map) {
		let atom = atomAndValue.at(0n);
		if (!(atom instanceof RuntimeAtom)) {
			throw new Error(`namespace insert: expected atom, got ${valueString(atom)}`);
		}
		namespace = namespace.mustInsert(atom.value, atomAndValue.at(1n));
	}
	return namespace;
}

function defineBlock(_: Namespace<Value>, matcher: Value|undefined, block: Value|undefined): [RuntimeMap|null, Value] {
	checkArgumentLength(2, arguments);
	if (typeof block !== "function") {
		throw argumentError();
	}
	let fn: RuntimeBlockFunction = (ns, ...args) => {
		let matchee = new RuntimeList(...args as Value[]);
		let result = match(matcher!, matchee);
		if (!result) {
			throw new Error("call with wrong arguments");
		}
		let callNamespace = block.namespace;
		if (result instanceof RuntimeMap) {
			callNamespace = doNamespaceInsertMap(callNamespace, result);
		}
		return block.original.call(callNamespace, ns);
	};
	return [null, createNewBlock(block.namespace, fn)];
}

const stopValue = new Unique();

const builtinBlocks: [string, RuntimeBlockFunction][] = [
	["call", function(ns, block, args) {
		if (arguments.length < 2 || arguments.length > 3) {
			throw argumentError();
		}
		if (typeof block !== "function") {
			throw argumentError();
		}
		if (arguments.length === 3) {
			if (!(args instanceof RuntimeList)) {
				throw argumentError();
			}
			return block(ns, ...args.elements)
		} else {
			return block(ns);
		}
	}],
	["insertCall", function(ns, block, atomsAndValues) {
		checkArgumentLength(2, arguments);
		if (typeof block !== "function" || !(atomsAndValues instanceof RuntimeMap)) {
			throw argumentError();
		}
		let callNamespace = doNamespaceInsertMap(block.namespace, atomsAndValues);
		return block.original.bind(callNamespace)(ns);
	}],
	["withArgs", function(_, argsAtom, block) {
		checkArgumentLength(2, arguments);
		if (!(argsAtom instanceof RuntimeAtom && typeof block === "function")) {
			throw argumentError();
		}
		let fn: RuntimeBlockFunction = (ns, ...args) => {
			return block.original.bind(
				block.namespace.mustInsert(
					argsAtom.value,
					new RuntimeList(...args as Value[])
				),
			)(ns);
		};
		return [null, createNewBlock(new Namespace(), fn)];
	}],
	[symbolAssign, function(_, assignee, value) {
		checkArgumentLength(2, arguments);
		let result = match(assignee!, value!);
		if (!result) {
			throw new Error(errorMessageAssignMatch);
		}
		if (result instanceof RuntimeMap) {
			return [result, null];
		} else {
			return [null, null];
		}
	}],
	["def", defineBlock],
	["->", defineBlock],
	["match", function(ns, value, matchersAndBlocks) {
		checkArgumentLength(2, arguments);
		if (!(matchersAndBlocks instanceof RuntimeList)
			|| matchersAndBlocks.len() % 2n !== 0n)
		{
			throw argumentError();
		}
		for (let i = 0n; i < matchersAndBlocks.len(); i += 2n) {
			let matcher = matchersAndBlocks.at(i);
			let block = matchersAndBlocks.at(i+1n);
			if (typeof block !== "function") {
				throw argumentError();
			}
			let result = match(matcher, value!);
			if (!result) {
				continue;
			}
			let callNamespace = block.namespace;
			if (result instanceof RuntimeMap) {
				callNamespace = doNamespaceInsertMap(callNamespace, result);
			}
			return block.original.call(callNamespace, ns);
		}
		throw new Error("match: no pattern matched");
	}],
	["return", function(_, value) {
		checkArgumentLength(1, arguments);
		throw new Return(value!);
	}],
	["returnv", function(_, value) {
		checkArgumentLength(1, arguments);
		return [null, new Return(value!)];
	}],
	["if", function(ns, cond, trueBlock, falseBlock) {
		checkArgumentLength(3, arguments);
		if (typeof trueBlock !== "function" || typeof falseBlock !== "function") {
			throw argumentError();
		}
		if (cond === null || cond === false) {
			return falseBlock(ns);
		} else {
			return trueBlock(ns);
		}
	}],
	["or", function(ns, condsAndBlocks) {
		checkArgumentLength(1, arguments);
		if (!(condsAndBlocks instanceof RuntimeList)
			|| condsAndBlocks.len() % 2n !== 0n)
		{
			throw argumentError();
		}
		for (let i = 0n; i < condsAndBlocks.len(); i += 2n) {
			let cond = condsAndBlocks.at(i);
			let block = condsAndBlocks.at(i+1n);
			if (typeof block !== "function") {
				throw argumentError();
			}
			if (typeof cond === "function") {
				cond = cond(ns)[1];
			}
			if (cond === null || cond === false) {
				continue;
			}
			return block(ns);
		}
		throw new Error("or: no truthy condition");
	}],
	["loop", function(ns, block) {
		checkArgumentLength(1, arguments);
		if (typeof block !== "function") {
			throw argumentError();
		}
		while(true) {
			try {
				block(ns)
			} catch (e) {
				if (e instanceof Return) {
					return [null, e.value];
				} else {
					throw e;
				}
			}
		}
	}],
	["==", function(_, x, y) {
		checkArgumentLength(2, arguments);
		return [null, valueEquals(x!, y!)];
	}],
	["!=", function(_, x, y) {
		checkArgumentLength(2, arguments);
		return [null, !valueEquals(x!, y!)];
	}],
	["<", function(_, x, y) {
		checkArgumentLength(2, arguments);
		if (typeof x !== "bigint" || typeof y !== "bigint") {
			throw argumentError();
		}
		return [null, x < y];
	}],
	["<=", function(_, x, y) {
		checkArgumentLength(2, arguments);
		if (typeof x !== "bigint" || typeof y !== "bigint") {
			throw argumentError();
		}
		return [null, x <= y];
	}],
	[">", function(_, x, y) {
		checkArgumentLength(2, arguments);
		if (typeof x !== "bigint" || typeof y !== "bigint") {
			throw argumentError();
		}
		return [null, x > y];
	}],
	[">=", function(_, x, y) {
		checkArgumentLength(2, arguments);
		if (typeof x !== "bigint" || typeof y !== "bigint") {
			throw argumentError();
		}
		return [null, x >= y];
	}],
	["+", function(_, x, y) {
		checkArgumentLength(2, arguments);
		if (typeof x !== "bigint" || typeof y !== "bigint") {
			throw argumentError();
		}
		return [null, x + y];
	}],
	["-", function(_, x, y) {
		checkArgumentLength(2, arguments);
		if (typeof x !== "bigint" || typeof y !== "bigint") {
			throw argumentError();
		}
		return [null, x - y];
	}],
	["*", function(_, x, y) {
		checkArgumentLength(2, arguments);
		if (typeof x !== "bigint" || typeof y !== "bigint") {
			throw argumentError();
		}
		return [null, x * y];
	}],
	["//", function(_, x, y) {
		checkArgumentLength(2, arguments);
		if (typeof x !== "bigint" || typeof y !== "bigint") {
			throw argumentError();
		}
		return [null, x / y];
	}],
	["%", function(_, x, y) {
		checkArgumentLength(2, arguments);
		if (typeof x !== "bigint" || typeof y !== "bigint") {
			throw argumentError();
		}
		return [null, x % y];
	}],
	["map", function(ns, ...elements) {
		return [null, RuntimeMap.fromRuntimeValues(ns, ...elements as Value[])];
	}],
	["append", function(_, list, value) {
		checkArgumentLength(2, arguments);
		if (!(list instanceof RuntimeList)) {
			throw argumentError();
		}
		return [null, list.append(value!)];
	}],
	["toList", function(ns, iterator) {
		checkArgumentLength(1, arguments);
		if (typeof iterator !== "function") {
			throw argumentError();
		}
		let next = iterator(ns)[1];
		if (typeof next !== "function") {
			throw argumentError();
		}
		let elements = [];
		while (true) {
			let element = next(ns)[1];
			if (element === stopValue) {
				return [null, new RuntimeList(...elements)];
			}
			elements.push(element);
		}

	}],
	[".", function(_, map, key) {
		checkArgumentLength(2, arguments);
		if (!(map instanceof RuntimeMap)) {
			throw argumentError();
		}
		return [null, map.get(key!)];
	}],
	["mut",  function(_, value) {
		checkArgumentLength(1, arguments);
		return [null, new Mut(value!)];
	}],
	["load",  function(_, mut) {
		checkArgumentLength(1, arguments);
		if (!(mut instanceof Mut)) {
			throw argumentError();
		}
		return [null, mut.value];
	}],
	["<-", function(_, mut, value) {
		checkArgumentLength(2, arguments);
		if (!(mut instanceof Mut)) {
			throw argumentError();
		}
		mut.value = value!;
		return [null, null];
	}],
	["|>", function(ns, input, receiver) {
		checkArgumentLength(2, arguments);
		if (typeof receiver !== "function") {
			throw argumentError();
		}
		return receiver(ns, input);
	}],
	["..", function(ns, start, end) {
		checkArgumentLength(2, arguments);
		if (typeof start !== "bigint" || typeof end !== "bigint") {
			throw argumentError();
		}
		if (start >= end) {
			throw new Error("range: start cannot be greater or equal");
		}
		return [null, RuntimeMap.fromRuntimeValues(
			ns,
			new RuntimeList(new RuntimeAtom("start"), start),
			new RuntimeList(new RuntimeAtom("end"), end),
		)];
	}],
	["unique",  function(_) {
		checkArgumentLength(0, arguments);
		return [null, new Unique()];
	}],
	["println", function(_, ...args) {
		println(args.map(v => valueString(v!)).join(" "));
		return [null, null];
	}],
];

const builtinOther: [string, Value][] = [
	["null", null],
	["false", false],
	["true", true],
	["stop", stopValue]
];

function createNewBlock(ns: Namespace<Value>, block: RuntimeBlockFunction): RuntimeBlock {
	return Object.assign(block.bind(ns), { namespace: ns, original: block });
}

const builtinNamespace = (() => {
	let ns = builtinBlocks.reduce(
		(ns, [str, block]) => {
			return ns.mustInsert(str, createNewBlock(new Namespace(), block));
		},
		new Namespace<Value>(),
	);
	return builtinOther.reduce((ns, [str, value]) => ns.mustInsert(str, value), ns);
})();

const internals: { [name: string]: Function } = {
	[internalNewAtom]: (value: string): RuntimeAtom => {
		return new RuntimeAtom(value);
	},
	[internalNewList]: (...elements: Value[]): RuntimeList => {
		return new RuntimeList(...elements);
	},
	[internalNewBlock]: createNewBlock,
	[internalNamespaceInsertMap]: doNamespaceInsertMap,
	[internalMatch]: match,
	[internalIsList]: (maybeList: unknown): boolean => {
		return maybeList instanceof RuntimeList;
	},
	[internalIsMap]: (maybeMap: unknown): boolean => {
		return maybeMap instanceof RuntimeMap;
	},
};

function stringAll(str: string, predicate: (char: string) => boolean): boolean {
	for (let char of str) {
		if (!predicate(char)) {
			return false;
		}
	}
	return true;
}

function mustStringFirst(str: string): string {
	for (let char of str) {
		return char;
	}
	throw new Error("empty string");
}

const escapedSymbols: { [key: string]: string } = {
	"!": "ExclamationMark",
	"$": "Dollar",
	"%": "Percent",
	"&": "Ampersand",
	"*": "Asterisk",
	"+": "Plus",
	",": "Comma",
	"-": "Minus",
	".": "Period",
	"/": "Slash",
	":": "Colon",
	";": "Semicolon",
	"<": "LessThan",
	"=": "EqualitySign",
	">": "GreaterThan",
	"?": "QuestionMark",
	"@": "AtSign",
	"\\": "Backslash",
	"^": "Caret",
	"`": "Accent",
	"|": "VerticalBar",
	"~": "Tilde",
};

function toJavascriptVarName(str: string): string {
	if (str.length === 0) {
		throw internal();
	}

	if (isIdentStart(mustStringFirst(str)) && stringAll(str, isIdent)) {
		// TODO: check still valid with non ascii idents
		return `ident_${str}`;
	} else if (stringAll(str, isSymbol)) {
		let escaped = stringMap(str, char => {
			let esc = escapedSymbols[char];
			if (esc === undefined) {
				return `U${char.codePointAt(0)}`;
			}
			return esc;
		})
		return `symbol_${escaped}`;
	} else {
		throw internal();
	}
}

const builtinNamespaceVarNames = (() => {
	let ns = new Namespace<string>();
	for (let [name, _] of builtinNamespace) {
		ns = ns.mustInsert(name, toJavascriptVarName(name));
	};
	return ns;
})();

function runExpressions(exprs: Expression[]): void {
	let code = "'use strict';\n\n";
	const internalsName = "internals";
	for (let name of Object.keys(internals)) {
		code += `const ${name} = ${internalsName}.${name};\n`;
	}
	code += "\n";

	for (let [name, varName] of builtinNamespaceVarNames) {
		code += `const ${varName} = ${ourNamespace}.mustGet(${toJavascriptString(name)});\n`;
	}
	code += `\n${unpackAndMaybeAddToOursDefinition}\n\n`;

	code += new Compiler(builtinNamespaceVarNames, exprs).compile();
	console.log(code);
	new Function(internalsName, ourNamespace, code)(internals, builtinNamespace);
}

function run(code: string) {
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
			[symbolAssign, "<-"],
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
			["*", "/", "//", "%"],
			["@"],
			["."],
		],
	);
	let exprs = parser.parse();
	for (let expr of exprs) {
		console.log(expressionString(expr));
	}

	runExpressions(exprs);
}