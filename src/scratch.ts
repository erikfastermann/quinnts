function error(): never {
    throw new Error("internal error");
}

type Ref = {
	kind: "ref";
	value: string;
};

type QSymbol = {
	kind: "symbol";
	value: string;
};

type QAtom = {
	kind: "atom";
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

type Token =
	| Ref
	| QSymbol
	| QAtom
	| QNumber
	| QString
	| OpenBracket
	| ClosedBracket
	| OpenCurly
	| ClosedCurly
	| OpenSquare
	| ClosedSquare
	| EndOfLine;

type TokenWithPosition = {
	path: string;
	line: number;
	column: number;
	token: Token;
};

// TODO: support non ascii

function isSpace(char: string): boolean {
	return /^\s$/.test(char);
}

function isIdentStart(char: string): boolean {
	return /^[a-zA-Z_]$/.test(char);
}

function isIdent(char: string): boolean {
	return /^[0-9a-zA-Z_]$/.test(char);
}

function isReservedSymbol(char: string): boolean {
	return ['"', "'", '(', ')', '{', '}', '[', ']', '#'].includes(char);
}

function isSymbol(char: string): boolean {
	if (isReservedSymbol(char) || (char == '_')) {
		return false;
	};
	return /^[\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E]$/.test(char);
}

function isNumberStart(char: string): boolean {
	return /^[0-9]$/.test(char);
}

function isNumber(char: string): boolean {
	return /^[0-9_]$/.test(char);
}

class Lexer implements Iterable<Token> {
	chars: Iterator<string>;
	lastChar: {char: string, use: boolean} | null = null;
	lastToken: {token: Token, use: boolean} | null = null;
	finished = false;

	constructor(byChar: Iterable<string>) {
		this.chars = byChar[Symbol.iterator]();
	}

	nextChar(): string | null {
		if (this.lastChar && this.lastChar.use) {
			this.lastChar.use = false;
			return this.lastChar.char;
		};
		let {done, value: char} = this.chars.next();
		if (done) {
			return null;
		};
		this.lastChar = {char, use: false};
		return char;
	};

	unreadChar(): void {
		if (!this.lastChar || this.lastChar.use) {
			error();
		};
		this.lastChar.use = true;
	};

	takeWhile(predicate: (char: string) => boolean): string {
		let str = "";
		while (true) {
			let char = this.nextChar();
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

	nextToken(): Token | null {
		if (this.lastToken && this.lastToken.use) {
			this.lastToken.use = false;
			return this.lastToken.token;
		};

		let char = this.nextChar();
		if (!char) {
			if (!this.finished) {
				this.finished = true;
				return {kind: "eol"};
			};
			return null;
		};

		if (isSpace(char)) {
			if (char == '\n') {
				return {kind: "eol"};
			};
			while (true) {
				char = this.nextChar();
				if (!char) {
					return {kind: "eol"};
				};
				if (!isSpace(char)) {
					break;
				};
				if (char == '\n') {
					return {kind: "eol"};
				};
			};
		};

		if (isReservedSymbol(char)) {
			switch (char) {
			case '"':
				let str = "";
				while (true) {
					let char = this.nextChar();
					if (!char) {
						throw new Error('string not closed with "')
					};
					if (char == '"') {
						return {kind: "string", value: str}
					};
					if (char != '\r') {
						str += char;
					};
				};
			case "'":
				let char = this.nextChar();
				if (!char || !isIdentStart(char)) {
					throw new Error("bare '")
				};
				this.unreadChar();
				return {kind: "atom", value: this.takeWhile(isIdent)};
			case '(':
				return {kind: "("};
			case ')':
				return {kind: ")"};
			case '{':
				return {kind: "{"};
			case '}':
				return {kind: "}"};
			case '[':
				return {kind: "["};
			case ']':
				return {kind: "]"};
			case '#':
				while (true) {
					let char = this.nextChar();
					if (!char || char == '\n') {
						return {kind: "eol"};
					};
				};
			default:
				error();
			};
		} else if (isIdentStart(char)) {
			this.unreadChar();
			return {kind: "ref", value: this.takeWhile(isIdent)};
		} else if (isNumberStart(char)) {
			this.unreadChar();
			let num = this.takeWhile(isNumber).replace("_", "");
			if ((num.length > 1) && num[0] == '0') {
				throw new Error(`zero padded number ${num}`)
			};
			return {kind: "number", value: BigInt(num)}
		} else if (isSymbol(char)) {
			this.unreadChar();
			return {kind: "symbol", value: this.takeWhile(isSymbol)}
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
	let lexer = new Lexer(code);
	for (let ch of lexer) {
		console.log(ch);
	};
};
