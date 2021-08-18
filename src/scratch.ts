function error(): never {
    throw new Error("internal error");
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
			error();
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
				error();
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
			error();
		};
		this.lastToken.use = true;
	};

	peekToken(): Token | null {
		let token = this.nextToken();
		this.unreadToken();
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

interface PrecedenceTable { [key: string]: number; };

function newPrecedenceTable(table: string[][], offset: number): PrecedenceTable {
	let prec: PrecedenceTable = {};
	table.forEach((level, i) => level.forEach(symbol => prec[symbol] = i + offset));
	return prec;
}

class Parser {
	lexer: Lexer;
	precedenceTable: {
		lowerThanCall: PrecedenceTable;
		higherThanCall: PrecedenceTable;
	};

	constructor(lexer: Lexer, lowerThanCall: string[][], higherThanCall: string[][]) {
		this.lexer = lexer;
		this.precedenceTable = {
			lowerThanCall: newPrecedenceTable(lowerThanCall, 0),
			higherThanCall: newPrecedenceTable(higherThanCall, lowerThanCall.length),
		};
	}

	mustNextToken(tk?: TokenKind): Token {
		let token = this.lexer.nextToken();
		if (!token || (tk && token.kind !== tk.kind)) {
			error();
		}
		return token;
	}

	parse(): Expression[] {
		let expressions = [];
		while (true) {
			let start = this.lexer.peekToken();
			if (!start) {
				return expressions;
			}
			let exprs = this.expressions({kind: "eol"});
			if (exprs.length > 0) {
				expressions.push(collapseExpressions(start, exprs));
			}
			this.mustNextToken();
		}
	}

	callOrValue(): Expression {
		let openBracket = this.mustNextToken({kind: '('});
		let exprs = this.expressions({kind: ")"});
		this.mustNextToken();
		return collapseExpressions(openBracket, exprs);
	}

	list(): Expression {
		let openSquare = this.mustNextToken({kind: "["});
		let elements = this.expressions({kind: "]"});
		this.mustNextToken();
		return newExpression(openSquare, {kind: "list", elements});
	}

	block(): Expression {
		let openCurly = this.mustNextToken({kind: "{"});
		let expressions = [];
		while (true) {
			let start = this.lexer.peekToken();
			let exprs = this.expressions({kind: "eol"}, {kind: "}"});
			if (exprs.length > 0) {
				expressions.push(collapseExpressions(start!, exprs));
			}
			if (this.lexer.nextToken()!.kind === '}') {
				break;
			}
		}
		return newExpression(openCurly, {kind: "block", expressions});
	}

	expressions(...endAt: TokenKind[]): Expression[] {
		let exprs: Expression[] = [];
		while (true) {
			const token = this.lexer.nextToken();
			if (!token) {
				let expected = endAt.map(tk => `'${tk.kind}'`).join(", ");
				throw new Error(`unexpected eof, expected ${expected}`);
			} else if (endAt.some(tk => tk.kind === token.kind)) {
				this.lexer.unreadToken();
				return exprs;
			} else if ([')', ']', '}'].includes(token.kind)) {
				throw positionError(token, `unexpected ${token.kind}`)
			} else if (["string", "number", "ref", "atom"].includes(token.kind)) {
				exprs.push(token as Expression);
			} else {
				switch (token.kind) {
				case "symbol":
					error();
				case "eol":
					break;
				case '(':
					this.lexer.unreadToken();
					exprs.push(this.callOrValue());
					break;
				case '{':
					this.lexer.unreadToken();
					exprs.push(this.block());
					break;
				case '[':
					this.lexer.unreadToken();
					exprs.push(this.list());
					break;
				default:
					error();
				}
			}
		}
	}
}

function run() {
	let code = (document.getElementById("code") as HTMLInputElement).value;
	let lexer = new Lexer("textarea", code);
	for (let char of lexer) {
		console.log(char);
	};
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
	console.log(parser.parse());
};