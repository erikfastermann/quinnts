function error(): never {
    throw new Error("internal error");
};

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

type Position = {
	path: string;
	line: number;
	column: number;
};

type Token = TokenKind & Position;

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
		};

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

function run() {
	let code = (document.getElementById("code") as HTMLInputElement).value;
	let lexer = new Lexer("textarea", code);
	for (let char of lexer) {
		console.log(char);
	};
};