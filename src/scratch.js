"use strict";
function internal() {
    return new Error("internal error");
}
;
function positionError(pos, message) {
    return new Error(`${pos.path}|${pos.line} col ${pos.column}| ${message}`);
}
function newExpression(pos, expr) {
    return { ...expr, path: pos.path, line: pos.line, column: pos.column };
}
// TODO: support non ascii
function isSpace(char) {
    return /^\s$/.test(char);
}
;
function isIdentStart(char) {
    return /^[a-zA-Z_]$/.test(char);
}
;
function isIdent(char) {
    return /^[0-9a-zA-Z_]$/.test(char);
}
;
function isReservedSymbol(char) {
    return ['"', "'", '(', ')', '{', '}', '[', ']', '#'].includes(char);
}
;
function isSymbol(char) {
    if (isReservedSymbol(char) || (char == '_')) {
        return false;
    }
    ;
    return /^[\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E]$/.test(char);
}
;
function isNumberStart(char) {
    return /^[0-9]$/.test(char);
}
;
function isNumber(char) {
    return /^[0-9_]$/.test(char);
}
;
class Lexer {
    constructor(path, byChar) {
        this.lastChar = null;
        this.line = 1;
        this.column = 1;
        this.lastNewline = false;
        this.lastToken = null;
        this.finished = false;
        this.path = path;
        this.chars = byChar[Symbol.iterator]();
    }
    nextChar() {
        let char;
        if (this.lastChar && this.lastChar.use) {
            this.lastChar.use = false;
            char = this.lastChar.char;
        }
        else {
            let { done, value } = this.chars.next();
            if (done) {
                return null;
            }
            ;
            char = value;
        }
        ;
        this.lastChar = { char, use: false };
        if (char == '\n') {
            if (this.lastNewline) {
                this.column = 1;
                return { char, line: this.line++, column: this.column };
            }
            else {
                this.lastNewline = true;
                return { char, line: this.line++, column: this.column };
            }
            ;
        }
        else {
            if (this.lastNewline) {
                this.column = 2;
                this.lastNewline = false;
                return { char, line: this.line, column: 1 };
            }
            else {
                return { char, line: this.line, column: this.column++ };
            }
            ;
        }
        ;
    }
    ;
    unreadChar() {
        if (!this.lastChar || this.lastChar.use) {
            throw internal();
        }
        ;
        this.lastChar.use = true;
        if (this.lastNewline) {
            this.line--;
            this.lastNewline = false;
        }
        else {
            this.column--;
        }
        ;
    }
    ;
    takeWhile(predicate) {
        let str = "";
        while (true) {
            let char = this.nextChar()?.char;
            if (!char) {
                return str;
            }
            if (!predicate(char)) {
                this.unreadChar();
                return str;
            }
            ;
            str += char;
        }
        ;
    }
    ;
    finishingEol() {
        this.finished = true;
        return { path: this.path, line: this.line, column: this.column, kind: "eol" };
    }
    ;
    withPosition(position, kind) {
        return { path: this.path, line: position.line, column: position.column, ...kind };
    }
    ;
    nextToken() {
        if (this.lastToken && this.lastToken.use) {
            this.lastToken.use = false;
            return this.lastToken.token;
        }
        let token = this.getNextToken();
        if (!token) {
            return null;
        }
        this.lastToken = { token, use: false };
        return token;
    }
    getNextToken() {
        let char = this.nextChar();
        if (!char) {
            if (!this.finished) {
                return this.finishingEol();
            }
            ;
            return null;
        }
        ;
        if (isSpace(char.char)) {
            if (char.char == '\n') {
                return this.withPosition(char, { kind: "eol" });
            }
            ;
            while (true) {
                char = this.nextChar();
                if (!char) {
                    return this.finishingEol();
                }
                ;
                if (!isSpace(char.char)) {
                    break;
                }
                ;
                if (char.char == '\n') {
                    return this.withPosition(char, { kind: "eol" });
                    ;
                }
                ;
            }
            ;
        }
        ;
        let start = char;
        if (isReservedSymbol(char.char)) {
            switch (char.char) {
                case '"':
                    let str = "";
                    while (true) {
                        let char = this.nextChar();
                        if (!char) {
                            throw new Error('string not closed with "');
                        }
                        ;
                        if (char.char == '"') {
                            return this.withPosition(start, { kind: "string", value: str });
                        }
                        ;
                        if (char.char != '\r') {
                            str += char.char;
                        }
                        ;
                    }
                    ;
                case "'":
                    let char = this.nextChar();
                    if (!char || !isIdentStart(char.char)) {
                        throw new Error("bare '");
                    }
                    ;
                    this.unreadChar();
                    return this.withPosition(start, { kind: "atom", value: this.takeWhile(isIdent) });
                case '(':
                    return this.withPosition(start, { kind: "(" });
                case ')':
                    return this.withPosition(start, { kind: ")" });
                case '{':
                    return this.withPosition(start, { kind: "{" });
                case '}':
                    return this.withPosition(start, { kind: "}" });
                case '[':
                    return this.withPosition(start, { kind: "[" });
                case ']':
                    return this.withPosition(start, { kind: "]" });
                case '#':
                    while (true) {
                        let char = this.nextChar();
                        if (!char) {
                            return this.finishingEol();
                        }
                        ;
                        if (char.char == '\n') {
                            return this.withPosition(char, { kind: "eol" });
                        }
                        ;
                    }
                    ;
                default:
                    throw internal();
            }
            ;
        }
        else if (isIdentStart(char.char)) {
            this.unreadChar();
            return this.withPosition(start, { kind: "ref", value: this.takeWhile(isIdent) });
        }
        else if (isNumberStart(char.char)) {
            this.unreadChar();
            let num = this.takeWhile(isNumber).replace("_", "");
            if ((num.length > 1) && num[0] == '0') {
                throw new Error(`zero padded number ${num}`);
            }
            ;
            return this.withPosition(start, { kind: "number", value: BigInt(num) });
        }
        else if (isSymbol(char.char)) {
            this.unreadChar();
            return this.withPosition(start, { kind: "symbol", value: this.takeWhile(isSymbol) });
        }
        else {
            // TODO: quote char when necessary
            throw new Error(`unknown character ${char}`);
        }
        ;
    }
    ;
    unreadToken() {
        if (!this.lastToken || this.lastToken.use) {
            throw internal();
        }
        ;
        this.lastToken.use = true;
    }
    ;
    peekToken() {
        let token = this.nextToken();
        this.unreadToken();
        return token;
    }
    mustNextToken(tk) {
        let token = this.nextToken();
        if (!token || (tk && token.kind !== tk.kind)) {
            throw internal();
        }
        return token;
    }
    [Symbol.iterator]() {
        return new TokenIterator(this);
    }
    ;
}
;
class TokenIterator {
    constructor(lexer) {
        this.lexer = lexer;
    }
    ;
    next() {
        let token = this.lexer.nextToken();
        if (!token) {
            // the type of Iterator requires that we always return a valid Token
            // so we return eol here
            return { done: true, value: { kind: "eol" } };
        }
        ;
        return { done: false, value: token };
    }
    ;
}
;
function collapseExpressions(pos, exprs) {
    switch (exprs.length) {
        case 0:
            return newExpression(pos, { kind: "unit" });
        case 1:
            return newExpression(pos, exprs[0]);
        default:
            let first = exprs[0];
            if (first.kind !== "ref"
                && first.kind !== "block"
                && first.kind !== "call") {
                throw positionError(first, "can only call ident, block or call");
            }
            return newExpression(pos, {
                kind: "call",
                first,
                arguments: exprs.slice(1),
            });
    }
}
;
class Parser {
    // TODO: check duplicate symbols
    constructor(lexer, lowerThanCall, higherThanCall) {
        this.lexer = lexer;
        this.precedenceTable = {};
        let insertPrecedence = (table, factor) => {
            table.forEach((level, i) => level.forEach(symbol => {
                if (!stringAll(symbol, isSymbol) || this.precedenceTable.hasOwnProperty(symbol)) {
                    throw internal();
                }
                this.precedenceTable[symbol] = (i + 1) * factor;
            }));
        };
        insertPrecedence(lowerThanCall, -1),
            this.precedenceTable["call"] = 0;
        insertPrecedence(higherThanCall, 1);
    }
    parse() {
        let expressions = [];
        while (true) {
            let start = this.lexer.peekToken();
            if (!start) {
                return expressions;
            }
            let valuesOrSymbols = [];
            while (true) {
                let next = this.lexer.nextToken();
                if (!next) {
                    break;
                }
                else if (next.kind === "eol") {
                    if (valuesOrSymbols[valuesOrSymbols.length - 1]?.kind === "symbol") {
                        continue;
                    }
                    else {
                        break;
                    }
                }
                else if (next.kind === "symbol") {
                    valuesOrSymbols.push(next);
                }
                else {
                    this.lexer.unreadToken();
                    valuesOrSymbols.push(this.value());
                }
            }
            if (valuesOrSymbols.length > 0) {
                expressions.push(this.collapse(start, valuesOrSymbols));
            }
        }
    }
    callOrValue() {
        let openBracket = this.lexer.mustNextToken({ kind: '(' });
        let valuesOrSymbols = [];
        while (true) {
            let next = this.lexer.nextToken();
            if (!next) {
                throw new Error("expected ')', got eof");
            }
            if (next.kind === "eol") {
                continue;
            }
            else if (next.kind === ")") {
                break;
            }
            else if (next.kind === "symbol") {
                valuesOrSymbols.push(next);
            }
            else {
                this.lexer.unreadToken();
                valuesOrSymbols.push(this.value());
            }
        }
        return this.collapse(openBracket, valuesOrSymbols);
    }
    // TODO: allow symbols with higher precedence than call in lists
    list() {
        let openSquare = this.lexer.mustNextToken({ kind: "[" });
        let elements = [];
        while (true) {
            let next = this.lexer.nextToken();
            if (!next) {
                throw new Error("expected ']', got eof");
            }
            if (next.kind === "eol") {
                continue;
            }
            else if (next.kind === "]") {
                break;
            }
            else {
                this.lexer.unreadToken();
                elements.push(this.value());
            }
        }
        return newExpression(openSquare, { kind: "list", elements });
    }
    block() {
        let openCurly = this.lexer.mustNextToken({ kind: "{" });
        let expressions = [];
        while (true) {
            let start = this.lexer.peekToken();
            let valuesOrSymbols = [];
            while (true) {
                let next = this.lexer.nextToken();
                if (!next) {
                    throw new Error("expected '}', got eof");
                }
                else if (next.kind === "eol") {
                    if (valuesOrSymbols[valuesOrSymbols.length - 1]?.kind === "symbol") {
                        continue;
                    }
                    else {
                        this.lexer.unreadToken();
                        break;
                    }
                }
                else if (next.kind === "}") {
                    this.lexer.unreadToken();
                    break;
                }
                else if (next.kind === "symbol") {
                    valuesOrSymbols.push(next);
                }
                else {
                    this.lexer.unreadToken();
                    valuesOrSymbols.push(this.value());
                }
            }
            if (valuesOrSymbols.length > 0) {
                expressions.push(this.collapse(start, valuesOrSymbols));
            }
            if (this.lexer.mustNextToken().kind === '}') {
                return newExpression(openCurly, { kind: "block", expressions });
            }
        }
    }
    value() {
        const token = this.lexer.nextToken();
        if (!token) {
            throw new Error("unexpected eof");
        }
        else if ([')', ']', '}', "eol"].includes(token.kind)) {
            throw positionError(token, `unexpected ${token.kind}`);
        }
        else if (["string", "number", "ref", "atom"].includes(token.kind)) {
            return token;
        }
        else {
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
    collapse(start, valsOrSyms) {
        let parser = new OperatorParser(start, this.precedenceTable, valsOrSyms);
        return parser.parse();
    }
}
class OperatorParser {
    constructor(start, precedenceTable, valsOrSyms) {
        this.position = 0;
        if (valsOrSyms[0]?.kind === "symbol") {
            let sym = valsOrSyms[0];
            throw positionError(sym, `unexpected symbol ${sym.value}`);
        }
        let lastSym = false;
        for (let valOrSym of valsOrSyms) {
            if (valOrSym.kind === "symbol") {
                if (lastSym) {
                    throw positionError(valOrSym, `symbol ${valOrSym.value} directly follows another symbol`);
                }
                if (!precedenceTable.hasOwnProperty(valOrSym.value)) {
                    throw positionError(valOrSym, `unknown operator ${valOrSym.value}`);
                }
                lastSym = true;
            }
            else {
                lastSym = false;
            }
        }
        if (valsOrSyms[valsOrSyms.length - 1]?.kind === "symbol") {
            let sym = valsOrSyms[valsOrSyms.length - 1];
            throw positionError(sym, `unexpected symbol ${sym.value}`);
        }
        this.start = start;
        this.precedenceTable = precedenceTable;
        this.valsOrSyms = valsOrSyms;
    }
    precedence(sym) {
        let prec = this.precedenceTable[sym.value];
        if (prec === undefined) {
            throw internal();
        }
        return prec;
    }
    next() {
        let position = this.position;
        this.position++;
        if (position >= this.valsOrSyms.length) {
            return null;
        }
        else {
            return this.valsOrSyms[position];
        }
    }
    peek() {
        if (this.position >= this.valsOrSyms.length) {
            return null;
        }
        else {
            return this.valsOrSyms[this.position];
        }
    }
    skip(n) {
        let next = this.position + n;
        if (n === 0 || next > this.valsOrSyms.length || next < 0) {
            throw internal();
        }
        this.position = next;
    }
    parse() {
        let exprs = [];
        while (true) {
            let next = this.next();
            if (!next) {
                return collapseExpressions(this.start, exprs);
            }
            else if (next.kind === "symbol") {
                return this.operatorLower(next, collapseExpressions(exprs[0] ?? this.start, exprs));
            }
            else {
                let op = this.operator(next);
                if (!op) {
                    exprs.push(next);
                }
                else {
                    exprs.push(op);
                }
            }
        }
    }
    operatorLower(sym, left) {
        const kind = "call";
        let first = newExpression(sym, { kind: "ref", value: sym.value });
        let right = [];
        const collapseRight = () => {
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
            }
            else if (next.kind === "symbol") {
                if (this.precedence(next) < this.precedence(sym)) {
                    return newExpression(left, {
                        kind,
                        first,
                        arguments: [
                            left,
                            this.operatorLower(next, collapseRight()),
                        ],
                    });
                }
                else {
                    return this.operatorLower(next, newExpression(left, {
                        kind,
                        first,
                        arguments: [left, collapseRight()],
                    }));
                }
            }
            else {
                let op = this.operator(next);
                if (!op) {
                    right.push(next);
                }
                else {
                    right.push(op);
                }
            }
        }
    }
    operator(left) {
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
        let first = newExpression(sym, { kind: "ref", value: sym.value });
        let current = { kind, first, arguments: [left, right] };
        let currentExpr = newExpression(left, current);
        let nextSym = this.peek();
        if (!nextSym || nextSym.kind !== "symbol") {
            return currentExpr;
        }
        if (this.precedence(nextSym) > this.precedence(sym)) {
            let next = this.operator(right);
            if (!next) {
                return currentExpr;
            }
            else {
                return newExpression(left, { kind, first, arguments: [left, next] });
            }
        }
        else {
            let next = this.operator(currentExpr);
            if (!next) {
                return currentExpr;
            }
            else {
                return next;
            }
        }
    }
}
function expressionString(expr) {
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
class Namespace {
    constructor(key, value, left, right) {
        this.left = null;
        this.right = null;
        this.key = key;
        this.value = value;
        this.left = left;
        this.right = right;
    }
    toString() {
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
    get(key) {
        try {
            return this.mustGet(key);
        }
        catch {
            return undefined;
        }
    }
    mustGet(key) {
        let current = this;
        while (true) {
            if (key < current.key) {
                if (!current.left) {
                    throw new Error(`key ${key} not found`);
                }
                current = current.left;
            }
            else if (key > current.key) {
                if (!current.right) {
                    throw new Error(`key ${key} not found`);
                }
                current = current.right;
            }
            else {
                return current.value;
            }
        }
    }
    insert(key, value) {
        try {
            return this.mustInsert(key, value);
        }
        catch {
            return undefined;
        }
    }
    mustInsert(key, value) {
        if (key < this.key) {
            if (!this.left) {
                return new Namespace(this.key, this.value, new Namespace(key, value, null, null), this.right);
            }
            return new Namespace(this.key, this.value, this.left.mustInsert(key, value), this.right);
        }
        else if (key > this.key) {
            if (!this.right) {
                return new Namespace(this.key, this.value, this.left, new Namespace(key, value, null, null));
            }
            return new Namespace(this.key, this.value, this.left, this.right.mustInsert(key, value));
        }
        else {
            throw new Error(`duplicate key ${key}`);
        }
    }
    *[Symbol.iterator]() {
        if (this.left) {
            yield* this.left;
        }
        yield [this.key, this.value];
        if (this.right) {
            yield* this.right;
        }
    }
}
class EmptyNamespace {
    constructor() {
        // dummy values to make the typechecker happy
        this.key = undefined;
        this.value = undefined;
        this.left = undefined;
        this.right = undefined;
    }
    toString() { return ""; }
    get(_key) { return undefined; }
    mustGet(key) { throw `key ${key} not found`; }
    insert(key, value) {
        return new Namespace(key, value, null, null);
    }
    mustInsert(key, value) {
        return new Namespace(key, value, null, null);
    }
    *[Symbol.iterator]() { }
}
const ourNamespace = "ourNamespace";
const theirNamespace = "theirNamespace";
const namespaceInsertMap = "namespaceInsertMap";
const unpackAndMaybeAddToOurs = "unpackAndMaybeAddToOurs";
const unpackAndMaybeAddToOursDefinition = `const ${unpackAndMaybeAddToOurs} = ([insertable, ret]) => {
	if (insertable) {
		${ourNamespace} = ${namespaceInsertMap}(${ourNamespace}, insertable);
	}
	return ret;
};`;
const newAtom = "newAtom";
const newList = "newList";
const newListFromArgs = "newListFromArgs";
const newBlock = "newBlock";
function stringMap(str, predicate) {
    let out = "";
    for (let char of str) {
        out += predicate(char);
    }
    return out;
}
function toJavascriptString(str) {
    let esc = stringMap(str, char => {
        if (char === "\\") {
            return "\\\\";
        }
        else if (char === '"') {
            return '\\"';
        }
        else {
            return char;
        }
    });
    return `"${esc}"`;
}
class Compiler {
    constructor(varNames, body, temporariesOffset = 0) {
        this.code = "";
        this.varNames = varNames;
        this.body = body;
        this.temporariesIndex = temporariesOffset;
    }
    compile() {
        if (this.body.length === 0) {
            this.code = "return [null, null];";
        }
        if (this.code !== "") {
            return this.code;
        }
        for (let i = 0; i < this.body.length - 1; i++) {
            let expr = this.body[i];
            if (expr.kind !== "call") {
                continue;
            }
            this.code += this.expr(expr) + ";";
        }
        let last = this.expr(this.body[this.body.length - 1]);
        this.code += `return [null, ${last}];`;
        return this.code;
    }
    expr(expr) {
        switch (expr.kind) {
            case "unit":
                return "null";
            case "number":
                return `${expr.value}n`;
            case "string":
                return `${toJavascriptString(expr.value)}`;
            case "atom":
                return `(${newAtom}(${toJavascriptString(expr.value)}))`;
            case "ref":
                return this.varNames.get(expr.value)
                    ?? `(${ourNamespace}.mustGet(${toJavascriptString(expr.value)}))`;
            case "call":
                let first = this.expr(expr.first);
                let args = expr.arguments.map(arg => this.expr(arg)).join(", ");
                return `(${unpackAndMaybeAddToOurs}(${first}(${ourNamespace}, ${args})))`;
            case "list":
                let elements = expr.elements.map(e => this.expr(e)).join(", ");
                return `(${newList}(${elements}))`;
            case "block":
                let content = new Compiler(this.varNames, expr.expressions).compile();
                return `(${newBlock}(${ourNamespace}, function(${theirNamespace}, ...args) {\n`
                    + "if (!(args.length === 0 || (args.length === 1 && args[0] === null))) {\n"
                    + "\tthrow new Error('cannot call basic block with arguments');\n"
                    + "}\n"
                    + `let ${ourNamespace} = this;\n`
                    + unpackAndMaybeAddToOursDefinition + '\n\n'
                    + content + "\n}))";
        }
    }
}
function valueString(v) {
    if (v === null) {
        return "()";
    }
    else if (typeof v === "function") {
        return "block";
    }
    else {
        return v.toString();
    }
}
function valueEquals(v1, v2) {
    if (v1 === null
        || typeof v1 === "boolean"
        || typeof v1 === "bigint"
        || typeof v1 === "string") {
        return v1 === v2;
    }
    else if (typeof v1 === "function") {
        return false;
    }
    else {
        return v1.equals(v2);
    }
}
class RuntimeAtom {
    constructor(value) {
        this.value = value;
    }
    equals(other) {
        if (!(other instanceof RuntimeAtom)) {
            return false;
        }
        return this.value === other.value;
    }
    toString() {
        return `(atom ${toJavascriptString(this.value)})`;
    }
}
// TODO: efficient list
class RuntimeList {
    constructor(...elements) {
        this.elements = elements;
    }
    equals(other) {
        if (!(other instanceof RuntimeList)) {
            return false;
        }
        if (this.elements.length !== other.elements.length) {
            return false;
        }
        ;
        for (let i = 0; i < this.elements.length; i++) {
            if (!valueEquals(this.elements[i], other.elements[i])) {
                return false;
            }
        }
        return true;
    }
    len() {
        return BigInt(this.elements.length);
    }
    at(idx) {
        if (idx < 0 || idx >= this.elements.length) {
            throw new Error(`
				list out of bounds (${idx} with length ${this.elements.length})`);
        }
        return this.elements[Number(idx)];
    }
    toString() {
        return "[" + this.elements.map(e => valueString(e)).join(" ") + "]";
    }
    *[Symbol.iterator]() {
        yield* this.elements;
    }
}
// TODO: efficient map
class RuntimeMap {
    constructor(elements) {
        this.elements = elements;
    }
    static fromRuntimeValues(ns, ...values) {
        let elements = [];
        for (let v of values) {
            let key;
            let value;
            if (v instanceof RuntimeAtom) {
                key = v;
                value = ns.mustGet(v.value);
            }
            else if (v instanceof RuntimeList && v.len() == 2n) {
                key = v.at(0n);
                value = v.at(1n);
            }
            else {
                throw new Error("can only create map from list of atoms or pairs of key and value");
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
    tryGet(key) {
        try {
            return this.get(key);
        }
        catch {
            return undefined;
        }
    }
    get(key) {
        for (let { key: ourKey, value } of this.elements) {
            if (valueEquals(key, ourKey)) {
                return value;
            }
        }
        throw new Error(`map: failed getting value for key ${valueString(key)}`);
    }
    insert(key, value) {
        for (let { key: ourKey } of this.elements) {
            if (valueEquals(key, ourKey)) {
                throw new Error(`map insert failed, duplicate key ${valueString(key)}`);
            }
        }
        let next = this.elements.slice();
        next.push({ key, value });
        return new RuntimeMap(next);
    }
    insertMany(other) {
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
    equals(other) {
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
                        break;
                    }
                    else {
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
    toString() {
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
function match(matcher, value) {
    if (matcher === null
        || typeof matcher === "boolean"
        || typeof matcher === "bigint"
        || typeof matcher === "string") {
        return matcher === value;
    }
    else if (matcher instanceof RuntimeAtom) {
        return RuntimeMap.fromRuntimeValues(new EmptyNamespace(), new RuntimeList(matcher, value));
    }
    else if (typeof matcher === "function") {
        let result = matcher(new EmptyNamespace(), value)[1];
        if (typeof result === "boolean" || result instanceof RuntimeMap) {
            return result;
        }
        else {
            throw new Error("matcher block must return boolean or map");
        }
    }
    else if (matcher instanceof RuntimeList) {
        if (!(value instanceof RuntimeList) || matcher.len() != value.len()) {
            return false;
        }
        let results = RuntimeMap.fromRuntimeValues(new EmptyNamespace());
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
    }
    else if (matcher instanceof RuntimeMap) {
        if (!(value instanceof RuntimeMap)) {
            return false;
        }
        let results = RuntimeMap.fromRuntimeValues(new EmptyNamespace());
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
    }
    else {
        throw internal();
    }
}
function println(s) {
    console.log(s);
}
function checkArgumentLength(expected, got) {
    if (expected !== got.length - 1) {
        throw new Error(`expected ${expected} arguments, got ${got.length - 1}`);
    }
}
// TODO: better error handling
function argumentError() {
    return new Error("bad argument type(s)");
}
function doNamespaceInsertMap(namespace, map) {
    for (let atomAndValue of map) {
        let atom = atomAndValue.at(0n);
        if (!(atom instanceof RuntimeAtom)) {
            throw new Error(`namespace insert: expected atom, got ${valueString(atom)}`);
        }
        namespace = namespace.mustInsert(atom.value, atomAndValue.at(1n));
    }
    return namespace;
}
const builtinBlocks = [
    ["=", function (_, assignee, value) {
            checkArgumentLength(2, arguments);
            let result = match(assignee, value);
            if (!result) {
                throw new Error("= pattern match failed");
            }
            if (result instanceof RuntimeMap) {
                return [result, null];
            }
            else {
                return [null, null];
            }
        }],
    ["def", function (_, matcher, block) {
            checkArgumentLength(2, arguments);
            if (typeof block !== "function") {
                throw argumentError();
            }
            let fn = (ns, ...args) => {
                let matchee = new RuntimeList(...args);
                let result = match(matcher, matchee);
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
        }],
    ["match", function (ns, value, matchersAndBlocks) {
            checkArgumentLength(2, arguments);
            if (!(matchersAndBlocks instanceof RuntimeList)
                || matchersAndBlocks.len() % 2n !== 0n) {
                throw argumentError();
            }
            for (let i = 0n; i < matchersAndBlocks.len(); i += 2n) {
                let matcher = matchersAndBlocks.at(i);
                let block = matchersAndBlocks.at(i + 1n);
                if (typeof block !== "function") {
                    throw argumentError();
                }
                let result = match(matcher, value);
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
    ["+", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x + y];
        }],
    ["map", function (ns, ...elements) {
            return [null, RuntimeMap.fromRuntimeValues(ns, ...elements)];
        }],
    ["insertCall", function (ns, block, atomsAndValues) {
            checkArgumentLength(2, arguments);
            if (typeof block !== "function" || !(atomsAndValues instanceof RuntimeMap)) {
                throw argumentError();
            }
            let callNamespace = doNamespaceInsertMap(block.namespace, atomsAndValues);
            return block.original.bind(callNamespace)(ns);
        }],
    ["withArgs", function (_, argsAtom, block) {
            checkArgumentLength(2, arguments);
            if (!(argsAtom instanceof RuntimeAtom && typeof block == "function")) {
                throw argumentError();
            }
            let fn = (ns, ...args) => {
                return block.original.bind(block.namespace.mustInsert(argsAtom.value, new RuntimeList(...args)))(ns);
            };
            return [null, createNewBlock(new EmptyNamespace(), fn)];
        }],
    ["println", function (_, ...args) {
            println(args.map(v => valueString(v)).join(" "));
            return [null, null];
        }],
];
const builtinOther = [
    ["null", null],
    ["false", false],
    ["true", true],
];
function createNewBlock(ns, block) {
    return Object.assign(block.bind(ns), { namespace: ns, original: block });
}
const builtinNamespace = (() => {
    let ns = builtinBlocks.reduce((ns, [str, block]) => {
        return ns.mustInsert(str, createNewBlock(new EmptyNamespace(), block));
    }, new EmptyNamespace());
    return builtinOther.reduce((ns, [str, value]) => ns.mustInsert(str, value), ns);
})();
const internals = {
    [newAtom]: (value) => {
        return new RuntimeAtom(value);
    },
    [newList]: (...elements) => {
        return new RuntimeList(...elements);
    },
    [newBlock]: createNewBlock,
    [namespaceInsertMap]: doNamespaceInsertMap,
};
function stringAll(str, predicate) {
    for (let char of str) {
        if (!predicate(char)) {
            return false;
        }
    }
    return true;
}
function mustStringFirst(str) {
    for (let char of str) {
        return char;
    }
    throw new Error("empty string");
}
const escapedSymbols = {
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
function toJavascriptVarName(str) {
    if (str.length === 0) {
        throw internal();
    }
    if (isIdentStart(mustStringFirst(str)) && stringAll(str, isIdent)) {
        // TODO: check still valid with non ascii idents
        return `ident_${str}`;
    }
    else if (stringAll(str, isSymbol)) {
        let escaped = stringMap(str, char => {
            let esc = escapedSymbols[char];
            if (esc === undefined) {
                return `U${char.codePointAt(0)}`;
            }
            return esc;
        });
        return `symbol_${escaped}`;
    }
    else {
        throw internal();
    }
}
const builtinNamespaceVarNames = (() => {
    let ns = new EmptyNamespace();
    for (let [name, _] of builtinNamespace) {
        ns = ns.mustInsert(name, toJavascriptVarName(name));
    }
    ;
    return ns;
})();
function runExpressions(exprs) {
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
function run() {
    let code = document.getElementById("code").value;
    let tokens = [];
    for (let tok of new Lexer("textarea", code)) {
        if (tok.kind === "atom"
            || tok.kind === "number"
            || tok.kind === "ref"
            || tok.kind === "string"
            || tok.kind === "symbol") {
            tokens.push(`${tok.kind} (${tok.value})`);
        }
        else {
            tokens.push(`${tok.kind}`);
        }
    }
    ;
    console.log(tokens.join(", "));
    let parser = new Parser(new Lexer("textarea", code), [
        ["=", "<-"],
        ["|>"],
    ], [
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
    ]);
    let exprs = parser.parse();
    for (let expr of exprs) {
        console.log(expressionString(expr));
    }
    runExpressions(exprs);
}
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyYXRjaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNjcmF0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLFNBQVMsUUFBUTtJQUNiLE9BQU8sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsYUFBYSxDQUFDLEdBQWEsRUFBRSxPQUFlO0lBQ3BELE9BQU8sSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLFFBQVEsR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUErR0QsU0FBUyxhQUFhLENBQUMsR0FBYSxFQUFFLElBQW9CO0lBQ3pELE9BQU8sRUFBQyxHQUFHLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBQyxDQUFDO0FBQ3RFLENBQUM7QUFFRCwwQkFBMEI7QUFFMUIsU0FBUyxPQUFPLENBQUMsSUFBWTtJQUM1QixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLFlBQVksQ0FBQyxJQUFZO0lBQ2pDLE9BQU8sYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsT0FBTyxDQUFDLElBQVk7SUFDNUIsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEMsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLGdCQUFnQixDQUFDLElBQVk7SUFDckMsT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFF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QUssQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLEVBQzNCO1FBQ0MsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDO1FBQ1gsQ0FBQyxJQUFJLENBQUM7S0FDTixFQUNEO1FBQ0MsQ0FBQyxJQUFJLENBQUM7UUFDTixDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7UUFDWixDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7UUFDWixDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQztRQUN0QixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQztRQUM1QixDQUFDLElBQUksQ0FBQztRQUNOLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztRQUNWLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ3RCLENBQUMsR0FBRyxDQUFDO1FBQ0wsQ0FBQyxHQUFHLENBQUM7S0FDTCxDQUNELENBQUM7SUFDRixJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDM0IsS0FBSyxJQUFJLElBQUksSUFBSSxLQUFLLEVBQUU7UUFDdkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0tBQ3BDO0lBRUQsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3ZCLENBQUM7QUFBQSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiZnVuY3Rpb24gaW50ZXJuYWwoKTogRXJyb3Ige1xuICAgIHJldHVybiBuZXcgRXJyb3IoXCJpbnRlcm5hbCBlcnJvclwiKTtcbn07XG5cbmZ1bmN0aW9uIHBvc2l0aW9uRXJyb3IocG9zOiBQb3NpdGlvbiwgbWVzc2FnZTogc3RyaW5nKTogRXJyb3Ige1xuXHRyZXR1cm4gbmV3IEVycm9yKGAke3Bvcy5wYXRofXwke3Bvcy5saW5lfSBjb2wgJHtwb3MuY29sdW1ufXwgJHttZXNzYWdlfWApO1xufVxuXG50eXBlIFJlZiA9IHtcblx0a2luZDogXCJyZWZcIjtcblx0dmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgQXRvbSA9IHtcblx0a2luZDogXCJhdG9tXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIFFTeW1ib2wgPSB7XG5cdGtpbmQ6IFwic3ltYm9sXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIFFOdW1iZXIgPSB7XG5cdGtpbmQ6IFwibnVtYmVyXCI7XG5cdHZhbHVlOiBiaWdpbnQ7XG59O1xuXG50eXBlIFFTdHJpbmcgPSB7XG5cdGtpbmQ6IFwic3RyaW5nXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIE9wZW5CcmFja2V0ID0ge1xuXHRraW5kOiBcIihcIjtcbn07XG5cbnR5cGUgQ2xvc2VkQnJhY2tldCA9IHtcblx0a2luZDogXCIpXCI7XG59O1xuXG50eXBlIE9wZW5DdXJseSA9IHtcblx0a2luZDogXCJ7XCI7XG59O1xuXG50eXBlIENsb3NlZEN1cmx5ID0ge1xuXHRraW5kOiBcIn1cIjtcbn07XG5cbnR5cGUgT3BlblNxdWFyZSA9IHtcblx0a2luZDogXCJbXCI7XG59O1xuXG50eXBlIENsb3NlZFNxdWFyZSA9IHtcblx0a2luZDogXCJdXCI7XG59O1xuXG50eXBlIEVuZE9mTGluZSA9IHtcblx0a2luZDogXCJlb2xcIjtcbn07XG5cbnR5cGUgVW5pdCA9IHtcblx0a2luZDogXCJ1bml0XCI7XG59XG5cbnR5cGUgQ2FsbGFibGUgPSAoUmVmIHwgQmxvY2sgfCBDYWxsKSAmIFBvc2l0aW9uO1xuXG50eXBlIENhbGwgPSB7XG5cdGtpbmQ6IFwiY2FsbFwiO1xuXHRmaXJzdDogQ2FsbGFibGU7XG5cdGFyZ3VtZW50czogRXhwcmVzc2lvbltdO1xufVxuXG50eXBlIExpc3QgPSB7XG5cdGtpbmQ6IFwibGlzdFwiO1xuXHRlbGVtZW50czogRXhwcmVzc2lvbltdO1xufVxuXG50eXBlIEJsb2NrID0ge1xuXHRraW5kOiBcImJsb2NrXCI7XG5cdGV4cHJlc3Npb25zOiBFeHByZXNzaW9uW107XG59XG5cbnR5cGUgVG9rZW5LaW5kID1cblx0fCBSZWZcblx0fCBBdG9tXG5cdHwgUVN5bWJvbFxuXHR8IFFOdW1iZXJcblx0fCBRU3RyaW5nXG5cdHwgT3BlbkJyYWNrZXRcblx0fCBDbG9zZWRCcmFja2V0XG5cdHwgT3BlbkN1cmx5XG5cdHwgQ2xvc2VkQ3VybHlcblx0fCBPcGVuU3F1YXJlXG5cdHwgQ2xvc2VkU3F1YXJlXG5cdHwgRW5kT2ZMaW5lO1xuXG50eXBlIEV4cHJlc3Npb25LaW5kID1cblx0fCBSZWZcblx0fCBBdG9tXG5cdHwgUU51bWJlclxuXHR8IFFTdHJpbmdcblx0fCBVbml0XG5cdHwgQ2FsbFxuXHR8IExpc3Rcblx0fCBCbG9jaztcblxudHlwZSBQb3NpdGlvbiA9IHtcblx0cGF0aDogc3RyaW5nO1xuXHRsaW5lOiBudW1iZXI7XG5cdGNvbHVtbjogbnVtYmVyO1xufTtcblxudHlwZSBUb2tlbiA9IFRva2VuS2luZCAmIFBvc2l0aW9uO1xuXG50eXBlIEV4cHJlc3Npb24gPSBFeHByZXNzaW9uS2luZCAmIFBvc2l0aW9uO1xuXG5mdW5jdGlvbiBuZXdFeHByZXNzaW9uKHBvczogUG9zaXRpb24sIGV4cHI6IEV4cHJlc3Npb25LaW5kKTogRXhwcmVzc2lvbiB7XG5cdHJldHVybiB7Li4uZXhwciwgcGF0aDogcG9zLnBhdGgsIGxpbmU6IHBvcy5saW5lLCBjb2x1bW46IHBvcy5jb2x1bW59O1xufVxuXG4vLyBUT0RPOiBzdXBwb3J0IG5vbiBhc2NpaVxuXG5mdW5jdGlvbiBpc1NwYWNlKGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15cXHMkLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNJZGVudFN0YXJ0KGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15bYS16QS1aX10kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNJZGVudChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eWzAtOWEtekEtWl9dJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzUmVzZXJ2ZWRTeW1ib2woY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBbJ1wiJywgXCInXCIsICcoJywgJyknLCAneycsICd9JywgJ1snLCAnXScsICcjJ10uaW5jbHVkZXMoY2hhcik7XG59O1xuXG5mdW5jdGlvbiBpc1N5bWJvbChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGlzUmVzZXJ2ZWRTeW1ib2woY2hhcikgfHwgKGNoYXIgPT0gJ18nKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fTtcblx0cmV0dXJuIC9eW1xcdTAwMjEtXFx1MDAyRlxcdTAwM0EtXFx1MDA0MFxcdTAwNUItXFx1MDA2MFxcdTAwN0ItXFx1MDA3RV0kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNOdW1iZXJTdGFydChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eWzAtOV0kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNOdW1iZXIoY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlswLTlfXSQvLnRlc3QoY2hhcik7XG59O1xuXG5jbGFzcyBMZXhlciBpbXBsZW1lbnRzIEl0ZXJhYmxlPFRva2VuPiB7XG5cdHBhdGg6IHN0cmluZztcblx0Y2hhcnM6IEl0ZXJhdG9yPHN0cmluZz47XG5cdGxhc3RDaGFyOiB7Y2hhcjogc3RyaW5nLCB1c2U6IGJvb2xlYW59IHwgbnVsbCA9IG51bGw7XG5cdGxpbmUgPSAxO1xuXHRjb2x1bW4gPSAxO1xuXHRsYXN0TmV3bGluZSA9IGZhbHNlO1xuXG5cdGxhc3RUb2tlbjoge3Rva2VuOiBUb2tlbiwgdXNlOiBib29sZWFufSB8IG51bGwgPSBudWxsO1xuXHRmaW5pc2hlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgYnlDaGFyOiBJdGVyYWJsZTxzdHJpbmc+KSB7XG5cdFx0dGhpcy5wYXRoID0gcGF0aDtcblx0XHR0aGlzLmNoYXJzID0gYnlDaGFyW1N5bWJvbC5pdGVyYXRvcl0oKTtcblx0fVxuXG5cdG5leHRDaGFyKCk6IHtjaGFyOiBzdHJpbmcsIGxpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXJ9IHwgbnVsbCB7XG5cdFx0bGV0IGNoYXI6IHN0cmluZztcblx0XHRpZiAodGhpcy5sYXN0Q2hhciAmJiB0aGlzLmxhc3RDaGFyLnVzZSkge1xuXHRcdFx0dGhpcy5sYXN0Q2hhci51c2UgPSBmYWxzZTtcblx0XHRcdGNoYXIgPSB0aGlzLmxhc3RDaGFyLmNoYXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCB7ZG9uZSwgdmFsdWV9ID0gdGhpcy5jaGFycy5uZXh0KCk7XG5cdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH07XG5cdFx0XHRjaGFyID0gdmFsdWU7XG5cdFx0fTtcblx0XHR0aGlzLmxhc3RDaGFyID0ge2NoYXIsIHVzZTogZmFsc2V9O1xuXG5cdFx0aWYgKGNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdGlmICh0aGlzLmxhc3ROZXdsaW5lKSB7XG5cdFx0XHRcdHRoaXMuY29sdW1uID0gMTtcblx0XHRcdFx0cmV0dXJuIHtjaGFyLCBsaW5lOiB0aGlzLmxpbmUrKywgY29sdW1uOiB0aGlzLmNvbHVtbn07IFxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7Y2hhciwgbGluZTogdGhpcy5saW5lKyssIGNvbHVtbjogdGhpcy5jb2x1bW59OyBcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLmxhc3ROZXdsaW5lKSB7XG5cdFx0XHRcdHRoaXMuY29sdW1uID0gMjtcblx0XHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSwgY29sdW1uOiAxfTsgXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSwgY29sdW1uOiB0aGlzLmNvbHVtbisrfTsgXG5cdFx0XHR9O1xuXHRcdH07XG5cdH07XG5cblx0dW5yZWFkQ2hhcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGFzdENoYXIgfHwgdGhpcy5sYXN0Q2hhci51c2UpIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fTtcblx0XHR0aGlzLmxhc3RDaGFyLnVzZSA9IHRydWU7XG5cdFx0aWYgKHRoaXMubGFzdE5ld2xpbmUpIHtcblx0XHRcdHRoaXMubGluZS0tO1xuXHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbHVtbi0tO1xuXHRcdH07XG5cdH07XG5cblx0dGFrZVdoaWxlKHByZWRpY2F0ZTogKGNoYXI6IHN0cmluZykgPT4gYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0bGV0IHN0ciA9IFwiXCI7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBjaGFyID0gdGhpcy5uZXh0Q2hhcigpPy5jaGFyO1xuXHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdHJldHVybiBzdHI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByZWRpY2F0ZShjaGFyKSkge1xuXHRcdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdFx0cmV0dXJuIHN0cjtcblx0XHRcdH07XG5cdFx0XHRzdHIgKz0gY2hhcjtcblx0XHR9O1xuXHR9O1xuXG5cdGZpbmlzaGluZ0VvbCgpOiBUb2tlbiB7XG5cdFx0dGhpcy5maW5pc2hlZCA9IHRydWU7XG5cdFx0cmV0dXJuIHsgcGF0aDogdGhpcy5wYXRoLCBsaW5lOiB0aGlzLmxpbmUsIGNvbHVtbjogdGhpcy5jb2x1bW4sIGtpbmQ6IFwiZW9sXCIgfVxuXHR9O1xuXG5cdHdpdGhQb3NpdGlvbihwb3NpdGlvbjoge2xpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXJ9LCBraW5kOiBUb2tlbktpbmQpOiBUb2tlbiB7XG5cdFx0cmV0dXJuIHsgcGF0aDogdGhpcy5wYXRoLCBsaW5lOiBwb3NpdGlvbi5saW5lLCBjb2x1bW46IHBvc2l0aW9uLmNvbHVtbiwgLi4ua2luZCB9XG5cdH07XG5cblx0bmV4dFRva2VuKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMubGFzdFRva2VuICYmIHRoaXMubGFzdFRva2VuLnVzZSkge1xuXHRcdFx0dGhpcy5sYXN0VG9rZW4udXNlID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4gdGhpcy5sYXN0VG9rZW4udG9rZW47XG5cdFx0fVxuXHRcdGxldCB0b2tlbiA9IHRoaXMuZ2V0TmV4dFRva2VuKCk7XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHRoaXMubGFzdFRva2VuID0ge3Rva2VuLCB1c2U6IGZhbHNlfTtcblx0XHRyZXR1cm4gdG9rZW47XG5cdH1cblxuXHRnZXROZXh0VG9rZW4oKTogVG9rZW4gfCBudWxsIHtcblx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdGlmICghdGhpcy5maW5pc2hlZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9O1xuXG5cdFx0aWYgKGlzU3BhY2UoY2hhci5jaGFyKSkge1xuXHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXFxuJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oY2hhciwge2tpbmQ6IFwiZW9sXCJ9KTtcblx0XHRcdH07XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjaGFyID0gdGhpcy5uZXh0Q2hhcigpO1xuXHRcdFx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKCFpc1NwYWNlKGNoYXIuY2hhcikpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXFxuJykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihjaGFyLCB7a2luZDogXCJlb2xcIn0pOztcblx0XHRcdFx0fTtcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGxldCBzdGFydCA9IGNoYXI7XG5cdFx0aWYgKGlzUmVzZXJ2ZWRTeW1ib2woY2hhci5jaGFyKSkge1xuXHRcdFx0c3dpdGNoIChjaGFyLmNoYXIpIHtcblx0XHRcdGNhc2UgJ1wiJzpcblx0XHRcdFx0bGV0IHN0ciA9IFwiXCI7XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3N0cmluZyBub3QgY2xvc2VkIHdpdGggXCInKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXCInKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcInN0cmluZ1wiLCB2YWx1ZTogc3RyfSk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAoY2hhci5jaGFyICE9ICdcXHInKSB7XG5cdFx0XHRcdFx0XHRzdHIgKz0gY2hhci5jaGFyO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIFwiJ1wiOlxuXHRcdFx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRcdFx0aWYgKCFjaGFyIHx8ICFpc0lkZW50U3RhcnQoY2hhci5jaGFyKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcImJhcmUgJ1wiKVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJhdG9tXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc0lkZW50KX0pO1xuXHRcdFx0Y2FzZSAnKCc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiKFwifSk7XG5cdFx0XHRjYXNlICcpJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCIpXCJ9KTtcblx0XHRcdGNhc2UgJ3snOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIntcIn0pO1xuXHRcdFx0Y2FzZSAnfSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwifVwifSk7XG5cdFx0XHRjYXNlICdbJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJbXCJ9KTtcblx0XHRcdGNhc2UgJ10nOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIl1cIn0pO1xuXHRcdFx0Y2FzZSAnIyc6XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGlmIChjaGFyLmNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihjaGFyLCB7a2luZDogXCJlb2xcIn0pO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKGlzSWRlbnRTdGFydChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwicmVmXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc0lkZW50KX0pO1xuXHRcdH0gZWxzZSBpZiAoaXNOdW1iZXJTdGFydChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdGxldCBudW0gPSB0aGlzLnRha2VXaGlsZShpc051bWJlcikucmVwbGFjZShcIl9cIiwgXCJcIik7XG5cdFx0XHRpZiAoKG51bS5sZW5ndGggPiAxKSAmJiBudW1bMF0gPT0gJzAnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgemVybyBwYWRkZWQgbnVtYmVyICR7bnVtfWApXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJudW1iZXJcIiwgdmFsdWU6IEJpZ0ludChudW0pfSk7XG5cdFx0fSBlbHNlIGlmIChpc1N5bWJvbChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwic3ltYm9sXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc1N5bWJvbCl9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVE9ETzogcXVvdGUgY2hhciB3aGVuIG5lY2Vzc2FyeVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGB1bmtub3duIGNoYXJhY3RlciAke2NoYXJ9YCk7XG5cdFx0fTtcblx0fTtcblxuXHR1bnJlYWRUb2tlbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGFzdFRva2VuIHx8IHRoaXMubGFzdFRva2VuLnVzZSkge1xuXHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHR9O1xuXHRcdHRoaXMubGFzdFRva2VuLnVzZSA9IHRydWU7XG5cdH07XG5cblx0cGVla1Rva2VuKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0bGV0IHRva2VuID0gdGhpcy5uZXh0VG9rZW4oKTtcblx0XHR0aGlzLnVucmVhZFRva2VuKCk7XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9XG5cblx0bXVzdE5leHRUb2tlbih0az86IFRva2VuS2luZCk6IFRva2VuIHtcblx0XHRsZXQgdG9rZW4gPSB0aGlzLm5leHRUb2tlbigpO1xuXHRcdGlmICghdG9rZW4gfHwgKHRrICYmIHRva2VuLmtpbmQgIT09IHRrLmtpbmQpKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9rZW47XG5cdH1cblxuXHRbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYXRvcjxUb2tlbj4ge1xuXHRcdHJldHVybiBuZXcgVG9rZW5JdGVyYXRvcih0aGlzKTtcblx0fTtcbn07XG5cbmNsYXNzIFRva2VuSXRlcmF0b3IgaW1wbGVtZW50cyBJdGVyYXRvcjxUb2tlbj4ge1xuXHRsZXhlcjogTGV4ZXI7XG5cblx0Y29uc3RydWN0b3IobGV4ZXI6IExleGVyKSB7XG5cdFx0dGhpcy5sZXhlciA9IGxleGVyO1xuXHR9O1xuXG5cdG5leHQoKTogSXRlcmF0b3JSZXN1bHQ8VG9rZW4+IHtcblx0XHRsZXQgdG9rZW4gPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdC8vIHRoZSB0eXBlIG9mIEl0ZXJhdG9yIHJlcXVpcmVzIHRoYXQgd2UgYWx3YXlzIHJldHVybiBhIHZhbGlkIFRva2VuXG5cdFx0XHQvLyBzbyB3ZSByZXR1cm4gZW9sIGhlcmVcblx0XHRcdHJldHVybiB7ZG9uZTogdHJ1ZSwgdmFsdWU6IHtraW5kOiBcImVvbFwifX07XG5cdFx0fTtcblx0XHRyZXR1cm4ge2RvbmU6IGZhbHNlLCB2YWx1ZTogdG9rZW59O1xuXHR9O1xufTtcblxuZnVuY3Rpb24gY29sbGFwc2VFeHByZXNzaW9ucyhwb3M6IFBvc2l0aW9uLCBleHByczogRXhwcmVzc2lvbltdKTogRXhwcmVzc2lvbiB7XG5cdHN3aXRjaCAoZXhwcnMubGVuZ3RoKSB7XG5cdFx0Y2FzZSAwOlxuXHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24ocG9zLCB7a2luZDogXCJ1bml0XCJ9KTtcblx0XHRjYXNlIDE6XG5cdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihwb3MsIGV4cHJzWzBdISk7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdGxldCBmaXJzdCA9IGV4cHJzWzBdITtcblx0XHRcdGlmIChmaXJzdC5raW5kICE9PSBcInJlZlwiXG5cdFx0XHRcdCYmIGZpcnN0LmtpbmQgIT09IFwiYmxvY2tcIlxuXHRcdFx0XHQmJiBmaXJzdC5raW5kICE9PSBcImNhbGxcIlxuXHRcdFx0KSB7XG5cdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IoZmlyc3QsIFwiY2FuIG9ubHkgY2FsbCBpZGVudCwgYmxvY2sgb3IgY2FsbFwiKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKFxuXHRcdFx0XHRwb3MsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiBcImNhbGxcIixcblx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRhcmd1bWVudHM6IGV4cHJzLnNsaWNlKDEpLFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHR9XG59XG5cbnR5cGUgVmFsdWVPclN5bWJvbCA9IEV4cHJlc3Npb24gfCBRU3ltYm9sJlBvc2l0aW9uO1xuXG5pbnRlcmZhY2UgUHJlY2VkZW5jZVRhYmxlIHsgW2tleTogc3RyaW5nXTogbnVtYmVyOyB9O1xuXG5jbGFzcyBQYXJzZXIge1xuXHRsZXhlcjogTGV4ZXI7XG5cdHByZWNlZGVuY2VUYWJsZTogUHJlY2VkZW5jZVRhYmxlO1xuXG5cdC8vIFRPRE86IGNoZWNrIGR1cGxpY2F0ZSBzeW1ib2xzXG5cdGNvbnN0cnVjdG9yKGxleGVyOiBMZXhlciwgbG93ZXJUaGFuQ2FsbDogc3RyaW5nW11bXSwgaGlnaGVyVGhhbkNhbGw6IHN0cmluZ1tdW10pIHtcblx0XHR0aGlzLmxleGVyID0gbGV4ZXI7XG5cdFx0dGhpcy5wcmVjZWRlbmNlVGFibGUgPSB7fTtcblx0XHRsZXQgaW5zZXJ0UHJlY2VkZW5jZSA9ICh0YWJsZTogc3RyaW5nW11bXSwgZmFjdG9yOiBudW1iZXIpID0+IHtcblx0XHRcdHRhYmxlLmZvckVhY2goKGxldmVsLCBpKSA9PiBsZXZlbC5mb3JFYWNoKHN5bWJvbCA9PiB7XG5cdFx0XHRcdGlmICghc3RyaW5nQWxsKHN5bWJvbCwgaXNTeW1ib2wpIHx8IHRoaXMucHJlY2VkZW5jZVRhYmxlLmhhc093blByb3BlcnR5KHN5bWJvbCkpIHtcblx0XHRcdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucHJlY2VkZW5jZVRhYmxlW3N5bWJvbF0gPSAoaSArIDEpICogZmFjdG9yO1xuXHRcdFx0fSkpO1xuXHRcdH07XG5cdFx0aW5zZXJ0UHJlY2VkZW5jZShsb3dlclRoYW5DYWxsLCAtMSksXG5cdFx0dGhpcy5wcmVjZWRlbmNlVGFibGVbXCJjYWxsXCJdID0gMDtcblx0XHRpbnNlcnRQcmVjZWRlbmNlKGhpZ2hlclRoYW5DYWxsLCAxKVxuXHR9XG5cblx0cGFyc2UoKTogRXhwcmVzc2lvbltdIHtcblx0XHRsZXQgZXhwcmVzc2lvbnMgPSBbXTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IHN0YXJ0ID0gdGhpcy5sZXhlci5wZWVrVG9rZW4oKTtcblx0XHRcdGlmICghc3RhcnQpIHtcblx0XHRcdFx0cmV0dXJuIGV4cHJlc3Npb25zO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHZhbHVlc09yU3ltYm9sczogVmFsdWVPclN5bWJvbFtdID0gW107XG5cdFx0XHR3aGlsZSh0cnVlKSB7XG5cdFx0XHRcdGxldCBuZXh0ID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlc09yU3ltYm9sc1t2YWx1ZXNPclN5bWJvbHMubGVuZ3RoLTFdPy5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKG5leHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0XHR2YWx1ZXNPclN5bWJvbHMucHVzaCh0aGlzLnZhbHVlKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWVzT3JTeW1ib2xzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZXhwcmVzc2lvbnMucHVzaCh0aGlzLmNvbGxhcHNlKHN0YXJ0LCB2YWx1ZXNPclN5bWJvbHMpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjYWxsT3JWYWx1ZSgpOiBFeHByZXNzaW9uIHtcblx0XHRsZXQgb3BlbkJyYWNrZXQgPSB0aGlzLmxleGVyLm11c3ROZXh0VG9rZW4oe2tpbmQ6ICcoJ30pO1xuXHRcdGxldCB2YWx1ZXNPclN5bWJvbHM6IFZhbHVlT3JTeW1ib2xbXSA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMubGV4ZXIubmV4dFRva2VuKCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiZXhwZWN0ZWQgJyknLCBnb3QgZW9mXCIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5leHQua2luZCA9PT0gXCJlb2xcIikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcIilcIikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKG5leHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHR2YWx1ZXNPclN5bWJvbHMucHVzaCh0aGlzLnZhbHVlKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jb2xsYXBzZShvcGVuQnJhY2tldCwgdmFsdWVzT3JTeW1ib2xzKTtcblx0fVxuXG5cdC8vIFRPRE86IGFsbG93IHN5bWJvbHMgd2l0aCBoaWdoZXIgcHJlY2VkZW5jZSB0aGFuIGNhbGwgaW4gbGlzdHNcblx0bGlzdCgpOiBFeHByZXNzaW9uIHtcblx0XHRsZXQgb3BlblNxdWFyZSA9IHRoaXMubGV4ZXIubXVzdE5leHRUb2tlbih7a2luZDogXCJbXCJ9KTtcblx0XHRsZXQgZWxlbWVudHM6IEV4cHJlc3Npb25bXSA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMubGV4ZXIubmV4dFRva2VuKCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiZXhwZWN0ZWQgJ10nLCBnb3QgZW9mXCIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5leHQua2luZCA9PT0gXCJlb2xcIikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcIl1cIikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0ZWxlbWVudHMucHVzaCh0aGlzLnZhbHVlKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihvcGVuU3F1YXJlLCB7a2luZDogXCJsaXN0XCIsIGVsZW1lbnRzfSk7XG5cdH1cblxuXHRibG9jaygpOiBFeHByZXNzaW9uIHtcblx0XHRsZXQgb3BlbkN1cmx5ID0gdGhpcy5sZXhlci5tdXN0TmV4dFRva2VuKHtraW5kOiBcIntcIn0pO1xuXHRcdGxldCBleHByZXNzaW9ucyA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgc3RhcnQgPSB0aGlzLmxleGVyLnBlZWtUb2tlbigpO1xuXHRcdFx0bGV0IHZhbHVlc09yU3ltYm9sczogVmFsdWVPclN5bWJvbFtdID0gW107XG5cdFx0XHR3aGlsZSh0cnVlKSB7XG5cdFx0XHRcdGxldCBuZXh0ID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiZXhwZWN0ZWQgJ30nLCBnb3QgZW9mXCIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJlb2xcIikge1xuXHRcdFx0XHRcdGlmICh2YWx1ZXNPclN5bWJvbHNbdmFsdWVzT3JTeW1ib2xzLmxlbmd0aC0xXT8ua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwifVwiKSB7XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKG5leHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0XHR2YWx1ZXNPclN5bWJvbHMucHVzaCh0aGlzLnZhbHVlKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWVzT3JTeW1ib2xzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZXhwcmVzc2lvbnMucHVzaCh0aGlzLmNvbGxhcHNlKHN0YXJ0ISwgdmFsdWVzT3JTeW1ib2xzKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5sZXhlci5tdXN0TmV4dFRva2VuKCkua2luZCA9PT0gJ30nKSB7XG5cdFx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKG9wZW5DdXJseSwge2tpbmQ6IFwiYmxvY2tcIiwgZXhwcmVzc2lvbnN9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR2YWx1ZSgpOiBFeHByZXNzaW9uIHtcblx0XHRjb25zdCB0b2tlbiA9IHRoaXMubGV4ZXIubmV4dFRva2VuKCk7XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwidW5leHBlY3RlZCBlb2ZcIik7XG5cdFx0fSBlbHNlIGlmIChbJyknLCAnXScsICd9JywgXCJlb2xcIl0uaW5jbHVkZXModG9rZW4ua2luZCkpIHtcblx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IodG9rZW4sIGB1bmV4cGVjdGVkICR7dG9rZW4ua2luZH1gKVxuXHRcdH0gZWxzZSBpZiAoW1wic3RyaW5nXCIsIFwibnVtYmVyXCIsIFwicmVmXCIsIFwiYXRvbVwiXS5pbmNsdWRlcyh0b2tlbi5raW5kKSkge1xuXHRcdFx0cmV0dXJuIHRva2VuIGFzIEV4cHJlc3Npb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN3aXRjaCAodG9rZW4ua2luZCkge1xuXHRcdFx0Y2FzZSBcInN5bWJvbFwiOlxuXHRcdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKHRva2VuLCBgdW5leHBlY3RlZCBzeW1ib2wgJHt0b2tlbi52YWx1ZX1gKTtcblx0XHRcdGNhc2UgJygnOlxuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNhbGxPclZhbHVlKCk7XG5cdFx0XHRjYXNlICd7Jzpcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5ibG9jaygpO1xuXHRcdFx0Y2FzZSAnWyc6XG5cdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMubGlzdCgpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjb2xsYXBzZShzdGFydDogUG9zaXRpb24sIHZhbHNPclN5bXM6IFZhbHVlT3JTeW1ib2xbXSk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBwYXJzZXIgPSBuZXcgT3BlcmF0b3JQYXJzZXIoc3RhcnQsIHRoaXMucHJlY2VkZW5jZVRhYmxlLCB2YWxzT3JTeW1zKTtcblx0XHRyZXR1cm4gcGFyc2VyLnBhcnNlKCk7XG5cdH1cbn1cblxuY2xhc3MgT3BlcmF0b3JQYXJzZXIge1xuXHRzdGFydDogUG9zaXRpb247XG5cdHByZWNlZGVuY2VUYWJsZTogUHJlY2VkZW5jZVRhYmxlO1xuXHR2YWxzT3JTeW1zOiBWYWx1ZU9yU3ltYm9sW107XG5cdHBvc2l0aW9uID0gMDtcblxuXHRjb25zdHJ1Y3RvcihzdGFydDogUG9zaXRpb24sIHByZWNlZGVuY2VUYWJsZTogUHJlY2VkZW5jZVRhYmxlLCB2YWxzT3JTeW1zOiBWYWx1ZU9yU3ltYm9sW10pIHtcblx0XHRpZiAodmFsc09yU3ltc1swXT8ua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0bGV0IHN5bSA9IHZhbHNPclN5bXNbMF07XG5cdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKHN5bSwgYHVuZXhwZWN0ZWQgc3ltYm9sICR7c3ltLnZhbHVlfWApO1xuXHRcdH1cblx0XHRsZXQgbGFzdFN5bSA9IGZhbHNlO1xuXHRcdGZvciAobGV0IHZhbE9yU3ltIG9mIHZhbHNPclN5bXMpIHtcblx0XHRcdGlmICh2YWxPclN5bS5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdGlmIChsYXN0U3ltKSB7XG5cdFx0XHRcdFx0dGhyb3cgcG9zaXRpb25FcnJvcihcblx0XHRcdFx0XHRcdHZhbE9yU3ltLFxuXHRcdFx0XHRcdFx0YHN5bWJvbCAke3ZhbE9yU3ltLnZhbHVlfSBkaXJlY3RseSBmb2xsb3dzIGFub3RoZXIgc3ltYm9sYCxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcHJlY2VkZW5jZVRhYmxlLmhhc093blByb3BlcnR5KHZhbE9yU3ltLnZhbHVlKSkge1xuXHRcdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IoXG5cdFx0XHRcdFx0XHR2YWxPclN5bSxcblx0XHRcdFx0XHRcdGB1bmtub3duIG9wZXJhdG9yICR7dmFsT3JTeW0udmFsdWV9YFxuXHRcdFx0XHRcdClcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0U3ltID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhc3RTeW0gPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHZhbHNPclN5bXNbdmFsc09yU3ltcy5sZW5ndGggLSAxXT8ua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0bGV0IHN5bSA9IHZhbHNPclN5bXNbdmFsc09yU3ltcy5sZW5ndGggLSAxXSBhcyAoUVN5bWJvbCZQb3NpdGlvbik7XG5cdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKHN5bSwgYHVuZXhwZWN0ZWQgc3ltYm9sICR7c3ltLnZhbHVlfWApO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhcnQgPSBzdGFydDtcblx0XHR0aGlzLnByZWNlZGVuY2VUYWJsZSA9IHByZWNlZGVuY2VUYWJsZTtcblx0XHR0aGlzLnZhbHNPclN5bXMgPSB2YWxzT3JTeW1zO1xuXHR9XG5cblx0cHJlY2VkZW5jZShzeW06IFFTeW1ib2wpOiBudW1iZXIge1xuXHRcdGxldCBwcmVjID0gdGhpcy5wcmVjZWRlbmNlVGFibGVbc3ltLnZhbHVlXTtcblx0XHRpZiAocHJlYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJlYztcblx0fVxuXG5cdG5leHQoKTogVmFsdWVPclN5bWJvbCB8IG51bGwge1xuXHRcdGxldCBwb3NpdGlvbiA9IHRoaXMucG9zaXRpb247XG5cdFx0dGhpcy5wb3NpdGlvbisrO1xuXHRcdGlmIChwb3NpdGlvbiA+PSB0aGlzLnZhbHNPclN5bXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMudmFsc09yU3ltc1twb3NpdGlvbl0hO1xuXHRcdH1cblx0fVxuXG5cdHBlZWsoKTogVmFsdWVPclN5bWJvbCB8IG51bGwge1xuXHRcdGlmICh0aGlzLnBvc2l0aW9uID49IHRoaXMudmFsc09yU3ltcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy52YWxzT3JTeW1zW3RoaXMucG9zaXRpb25dITtcblx0XHR9XG5cdH1cblxuXHRza2lwKG46IG51bWJlcik6IHZvaWQge1xuXHRcdGxldCBuZXh0ID0gdGhpcy5wb3NpdGlvbiArIG47XG5cdFx0aWYgKG4gPT09IDAgfHwgbmV4dCA+IHRoaXMudmFsc09yU3ltcy5sZW5ndGggfHwgbmV4dCA8IDApIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fVxuXHRcdHRoaXMucG9zaXRpb24gPSBuZXh0O1xuXHR9XG5cblx0cGFyc2UoKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IGV4cHJzID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5uZXh0KCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbGxhcHNlRXhwcmVzc2lvbnModGhpcy5zdGFydCwgZXhwcnMpO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMub3BlcmF0b3JMb3dlcihcblx0XHRcdFx0XHRuZXh0LFxuXHRcdFx0XHRcdGNvbGxhcHNlRXhwcmVzc2lvbnMoZXhwcnNbMF0gPz8gdGhpcy5zdGFydCwgZXhwcnMpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IG9wID0gdGhpcy5vcGVyYXRvcihuZXh0KTtcblx0XHRcdFx0aWYgKCFvcCkge1xuXHRcdFx0XHRcdGV4cHJzLnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZXhwcnMucHVzaChvcCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvcGVyYXRvckxvd2VyKHN5bTogUVN5bWJvbCZQb3NpdGlvbiwgbGVmdDogRXhwcmVzc2lvbik6IEV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IGtpbmQgPSBcImNhbGxcIjtcblx0XHRsZXQgZmlyc3QgPSBuZXdFeHByZXNzaW9uKFxuXHRcdFx0c3ltLFxuXHRcdFx0eyBraW5kOiBcInJlZlwiLCB2YWx1ZTogc3ltLnZhbHVlIH0sXG5cdFx0KSBhcyBSZWYmUG9zaXRpb247XG5cdFx0bGV0IHJpZ2h0OiBFeHByZXNzaW9uW10gPSBbXTtcblx0XHRjb25zdCBjb2xsYXBzZVJpZ2h0ID0gKCk6IEV4cHJlc3Npb24gPT4ge1xuXHRcdFx0bGV0IHBvc2l0aW9uID0gcmlnaHRbMF07XG5cdFx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29sbGFwc2VFeHByZXNzaW9ucyhwb3NpdGlvbiwgcmlnaHQpO1xuXHRcdH07XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLm5leHQoKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihsZWZ0LCB7XG5cdFx0XHRcdFx0a2luZCxcblx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRhcmd1bWVudHM6IFtsZWZ0LCBjb2xsYXBzZVJpZ2h0KCldLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdGlmICh0aGlzLnByZWNlZGVuY2UobmV4dCkgPCB0aGlzLnByZWNlZGVuY2Uoc3ltKSkge1xuXHRcdFx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKGxlZnQsIHtcblx0XHRcdFx0XHRcdGtpbmQsXG5cdFx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW1xuXHRcdFx0XHRcdFx0XHRsZWZ0LFxuXHRcdFx0XHRcdFx0XHR0aGlzLm9wZXJhdG9yTG93ZXIoXG5cdFx0XHRcdFx0XHRcdFx0bmV4dCxcblx0XHRcdFx0XHRcdFx0XHRjb2xsYXBzZVJpZ2h0KCksXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMub3BlcmF0b3JMb3dlcihuZXh0LFxuXHRcdFx0XHRcdFx0bmV3RXhwcmVzc2lvbihsZWZ0LCB7XG5cdFx0XHRcdFx0XHRcdGtpbmQsXG5cdFx0XHRcdFx0XHRcdGZpcnN0LFxuXHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtsZWZ0LCBjb2xsYXBzZVJpZ2h0KCldLFxuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgb3AgPSB0aGlzLm9wZXJhdG9yKG5leHQpO1xuXHRcdFx0XHRpZiAoIW9wKSB7XG5cdFx0XHRcdFx0cmlnaHQucHVzaChuZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyaWdodC5wdXNoKG9wKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG9wZXJhdG9yKGxlZnQ6IEV4cHJlc3Npb24pOiBFeHByZXNzaW9uIHwgbnVsbCB7XG5cdFx0bGV0IHN5bSA9IHRoaXMubmV4dCgpO1xuXHRcdGlmICghc3ltIHx8IHN5bS5raW5kICE9PSBcInN5bWJvbFwiIHx8IHRoaXMucHJlY2VkZW5jZShzeW0pIDwgMCkge1xuXHRcdFx0dGhpcy5za2lwKC0xKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRsZXQgcmlnaHQgPSB0aGlzLm5leHQoKTtcblx0XHRpZiAoIXJpZ2h0IHx8IHJpZ2h0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGtpbmQgPSBcImNhbGxcIjtcblx0XHRsZXQgZmlyc3QgPSBuZXdFeHByZXNzaW9uKFxuXHRcdFx0c3ltLFxuXHRcdFx0e2tpbmQ6IFwicmVmXCIsIHZhbHVlOiBzeW0udmFsdWV9LFxuXHRcdCkgYXMgUmVmJlBvc2l0aW9uO1xuXHRcdGxldCBjdXJyZW50OiBDYWxsID0geyBraW5kLCBmaXJzdCwgYXJndW1lbnRzOiBbbGVmdCwgcmlnaHRdIH07XG5cdFx0bGV0IGN1cnJlbnRFeHByID0gbmV3RXhwcmVzc2lvbihsZWZ0LCBjdXJyZW50KTtcblxuXHRcdGxldCBuZXh0U3ltID0gdGhpcy5wZWVrKCk7XG5cdFx0aWYgKCFuZXh0U3ltIHx8IG5leHRTeW0ua2luZCAhPT0gXCJzeW1ib2xcIikge1xuXHRcdFx0cmV0dXJuIGN1cnJlbnRFeHByO1xuXHRcdH1cblx0XHRpZiAodGhpcy5wcmVjZWRlbmNlKG5leHRTeW0pID4gdGhpcy5wcmVjZWRlbmNlKHN5bSkpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5vcGVyYXRvcihyaWdodCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnRFeHByO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24obGVmdCwge2tpbmQsIGZpcnN0LCBhcmd1bWVudHM6IFtsZWZ0LCBuZXh0XX0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMub3BlcmF0b3IoY3VycmVudEV4cHIpO1xuXHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdHJldHVybiBjdXJyZW50RXhwcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXh0O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBleHByZXNzaW9uU3RyaW5nKGV4cHI6IEV4cHJlc3Npb24pOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGV4cHIua2luZCkge1xuXHRjYXNlIFwidW5pdFwiOlxuXHRcdHJldHVybiBcIigpXCI7XG5cdGNhc2UgXCJjYWxsXCI6XG5cdFx0bGV0IGZpcnN0ID0gZXhwcmVzc2lvblN0cmluZyhleHByLmZpcnN0KTtcblx0XHRpZiAoZXhwci5hcmd1bWVudHMubGVuZ3RoIDwgMSkge1xuXHRcdFx0cmV0dXJuIGAoJHtmaXJzdH0gKCkpYDtcblx0XHR9XG5cdFx0bGV0IGFyZ3MgPSBleHByLmFyZ3VtZW50cy5tYXAoYXJnID0+IGV4cHJlc3Npb25TdHJpbmcoYXJnKSkuam9pbihcIiBcIik7XG5cdFx0cmV0dXJuIGAoJHtmaXJzdH0gJHthcmdzfSlgO1xuXHRjYXNlIFwibGlzdFwiOlxuXHRcdGxldCBlbGVtZW50cyA9IGV4cHIuZWxlbWVudHMubWFwKGFyZyA9PiBleHByZXNzaW9uU3RyaW5nKGFyZykpLmpvaW4oXCIgXCIpO1xuXHRcdHJldHVybiBgWyR7ZWxlbWVudHN9XWA7XG5cdGNhc2UgXCJibG9ja1wiOlxuXHRcdGxldCBleHBycyA9IGV4cHIuZXhwcmVzc2lvbnMubWFwKGFyZyA9PiBleHByZXNzaW9uU3RyaW5nKGFyZykpLmpvaW4oXCJcXG5cIik7XG5cdFx0aWYgKGV4cHIuZXhwcmVzc2lvbnMubGVuZ3RoIDwgMikge1xuXHRcdFx0cmV0dXJuIGB7ICR7ZXhwcnN9IH1gO1xuXHRcdH1cblx0XHRyZXR1cm4gYHtcXG4ke2V4cHJzfVxcbn1gO1xuXHRkZWZhdWx0OlxuXHRcdHJldHVybiBleHByLnZhbHVlLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuY2xhc3MgTmFtZXNwYWNlPFQ+IGltcGxlbWVudHMgSXRlcmFibGU8W3N0cmluZywgVF0+e1xuXHRrZXk6IHN0cmluZztcblx0dmFsdWU6IFQ7XG5cdGxlZnQ6IE5hbWVzcGFjZTxUPiB8IG51bGwgPSBudWxsO1xuXHRyaWdodDogTmFtZXNwYWNlPFQ+IHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0a2V5OiBzdHJpbmcsXG5cdFx0dmFsdWU6IFQsXG5cdFx0bGVmdDogTmFtZXNwYWNlPFQ+IHwgbnVsbCxcblx0XHRyaWdodDogTmFtZXNwYWNlPFQ+IHwgbnVsbFxuXHQpIHtcblx0XHR0aGlzLmtleSA9IGtleTtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy5sZWZ0ID0gbGVmdDtcblx0XHR0aGlzLnJpZ2h0ID0gcmlnaHQ7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdGxldCBzdHIgPSBcIlwiO1xuXHRcdGlmICh0aGlzLmxlZnQpIHtcblx0XHRcdHN0ciArPSB0aGlzLmxlZnQudG9TdHJpbmcoKSArIFwiLCBcIjtcblx0XHR9XG5cdFx0c3RyICs9IGAke3RoaXMua2V5fTogJHt0aGlzLnZhbHVlfWA7XG5cdFx0aWYgKHRoaXMucmlnaHQpIHtcblx0XHRcdHN0ciArPSBcIiwgXCIgKyB0aGlzLnJpZ2h0LnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdHI7XG5cdH1cblxuXHRnZXQoa2V5OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMubXVzdEdldChrZXkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRtdXN0R2V0KGtleTogc3RyaW5nKTogVCB7XG5cdFx0bGV0IGN1cnJlbnQ6IE5hbWVzcGFjZTxUPiA9IHRoaXM7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGlmIChrZXkgPCBjdXJyZW50LmtleSkge1xuXHRcdFx0XHRpZiAoIWN1cnJlbnQubGVmdCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihga2V5ICR7a2V5fSBub3QgZm91bmRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXJyZW50ID0gY3VycmVudC5sZWZ0O1xuXHRcdFx0fSBlbHNlIGlmIChrZXkgPiBjdXJyZW50LmtleSkge1xuXHRcdFx0XHRpZiAoIWN1cnJlbnQucmlnaHQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGtleSAke2tleX0gbm90IGZvdW5kYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VycmVudCA9IGN1cnJlbnQucmlnaHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gY3VycmVudC52YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpbnNlcnQoa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogTmFtZXNwYWNlPFQ+IHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMubXVzdEluc2VydChrZXksIHZhbHVlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0bXVzdEluc2VydChrZXk6IHN0cmluZywgdmFsdWU6IFQpOiBOYW1lc3BhY2U8VD4ge1xuXHRcdGlmIChrZXkgPCB0aGlzLmtleSkge1xuXHRcdFx0aWYgKCF0aGlzLmxlZnQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2UoXG5cdFx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdFx0dGhpcy52YWx1ZSxcblx0XHRcdFx0XHRuZXcgTmFtZXNwYWNlKGtleSwgdmFsdWUsIG51bGwsIG51bGwpLFxuXHRcdFx0XHRcdHRoaXMucmlnaHQsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IE5hbWVzcGFjZShcblx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdHRoaXMudmFsdWUsXG5cdFx0XHRcdHRoaXMubGVmdC5tdXN0SW5zZXJ0KGtleSwgdmFsdWUpLFxuXHRcdFx0XHR0aGlzLnJpZ2h0LFxuXHRcdFx0KTtcblx0XHR9IGVsc2UgaWYgKGtleSA+IHRoaXMua2V5KSB7XG5cdFx0XHRpZiAoIXRoaXMucmlnaHQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2UoXG5cdFx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdFx0dGhpcy52YWx1ZSxcblx0XHRcdFx0XHR0aGlzLmxlZnQsXG5cdFx0XHRcdFx0bmV3IE5hbWVzcGFjZShrZXksIHZhbHVlLCBudWxsLCBudWxsKSxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgTmFtZXNwYWNlKFxuXHRcdFx0XHR0aGlzLmtleSxcblx0XHRcdFx0dGhpcy52YWx1ZSxcblx0XHRcdFx0dGhpcy5sZWZ0LFxuXHRcdFx0XHR0aGlzLnJpZ2h0Lm11c3RJbnNlcnQoa2V5LCB2YWx1ZSksXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGR1cGxpY2F0ZSBrZXkgJHtrZXl9YClcblx0XHR9XG5cdH1cblxuXHQqW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmF0b3I8W3N0cmluZywgVF0+IHtcblx0XHRpZiAodGhpcy5sZWZ0KSB7XG5cdFx0XHR5aWVsZCogdGhpcy5sZWZ0O1xuXHRcdH1cblx0XHR5aWVsZCBbdGhpcy5rZXksIHRoaXMudmFsdWVdO1xuXHRcdGlmICh0aGlzLnJpZ2h0KSB7XG5cdFx0XHR5aWVsZCogdGhpcy5yaWdodDtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgRW1wdHlOYW1lc3BhY2U8VD4gaW1wbGVtZW50cyBJdGVyYWJsZTxbc3RyaW5nLCBUXT4ge1xuXHQvLyBkdW1teSB2YWx1ZXMgdG8gbWFrZSB0aGUgdHlwZWNoZWNrZXIgaGFwcHlcblx0a2V5OiBzdHJpbmcgPSB1bmRlZmluZWQgYXMgYW55IGFzIHN0cmluZztcblx0dmFsdWU6IFQgPSB1bmRlZmluZWQgYXMgYW55IGFzIFQ7XG5cdGxlZnQ6IE5hbWVzcGFjZTxUPiB8IG51bGwgPSB1bmRlZmluZWQgYXMgYW55IGFzIG51bGw7XG5cdHJpZ2h0OiBOYW1lc3BhY2U8VD4gfCBudWxsID0gdW5kZWZpbmVkIGFzIGFueSBhcyBudWxsO1xuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7IHJldHVybiBcIlwiOyB9XG5cdGdldChfa2V5OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRtdXN0R2V0KGtleTogc3RyaW5nKTogVCB7IHRocm93IGBrZXkgJHtrZXl9IG5vdCBmb3VuZGA7IH1cblx0aW5zZXJ0KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IE5hbWVzcGFjZTxUPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2Uoa2V5LCB2YWx1ZSwgbnVsbCwgbnVsbCk7XG5cdH1cblx0bXVzdEluc2VydChrZXk6IHN0cmluZywgdmFsdWU6IFQpOiBOYW1lc3BhY2U8VD4ge1xuXHRcdHJldHVybiBuZXcgTmFtZXNwYWNlKGtleSwgdmFsdWUsIG51bGwsIG51bGwpO1xuXHR9XG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYXRvcjxbc3RyaW5nLCBUXT4ge31cbn1cblxuY29uc3Qgb3VyTmFtZXNwYWNlID0gXCJvdXJOYW1lc3BhY2VcIjtcblxuY29uc3QgdGhlaXJOYW1lc3BhY2UgPSBcInRoZWlyTmFtZXNwYWNlXCI7XG5cbmNvbnN0IG5hbWVzcGFjZUluc2VydE1hcCA9IFwibmFtZXNwYWNlSW5zZXJ0TWFwXCI7XG5cbmNvbnN0IHVucGFja0FuZE1heWJlQWRkVG9PdXJzID0gXCJ1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc1wiO1xuXG5jb25zdCB1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc0RlZmluaXRpb24gPSBgY29uc3QgJHt1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc30gPSAoW2luc2VydGFibGUsIHJldF0pID0+IHtcblx0aWYgKGluc2VydGFibGUpIHtcblx0XHQke291ck5hbWVzcGFjZX0gPSAke25hbWVzcGFjZUluc2VydE1hcH0oJHtvdXJOYW1lc3BhY2V9LCBpbnNlcnRhYmxlKTtcblx0fVxuXHRyZXR1cm4gcmV0O1xufTtgXG5cbmNvbnN0IG5ld0F0b20gPSBcIm5ld0F0b21cIjtcblxuY29uc3QgbmV3TGlzdCA9IFwibmV3TGlzdFwiO1xuXG5jb25zdCBuZXdMaXN0RnJvbUFyZ3MgPSBcIm5ld0xpc3RGcm9tQXJnc1wiO1xuXG5jb25zdCBuZXdCbG9jayA9IFwibmV3QmxvY2tcIjtcblxuZnVuY3Rpb24gc3RyaW5nTWFwKHN0cjogc3RyaW5nLCBwcmVkaWNhdGU6IChjaGFyOiBzdHJpbmcpID0+IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBvdXQgPSBcIlwiO1xuXHRmb3IgKGxldCBjaGFyIG9mIHN0cikge1xuXHRcdG91dCArPSBwcmVkaWNhdGUoY2hhcik7XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gdG9KYXZhc2NyaXB0U3RyaW5nKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGVzYyA9IHN0cmluZ01hcChzdHIsIGNoYXIgPT4ge1xuXHRcdGlmIChjaGFyID09PSBcIlxcXFxcIikge1xuXHRcdFx0cmV0dXJuIFwiXFxcXFxcXFxcIjtcblx0XHR9IGVsc2UgaWYgKGNoYXIgPT09ICdcIicpIHtcblx0XHRcdHJldHVybiAnXFxcXFwiJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGNoYXI7XG5cdFx0fVxuXHR9KTtcblx0cmV0dXJuIGBcIiR7ZXNjfVwiYDtcbn1cblxuY2xhc3MgQ29tcGlsZXIge1xuXHR2YXJOYW1lczogTmFtZXNwYWNlPHN0cmluZz47XG5cdGJvZHk6IEV4cHJlc3Npb25bXTtcblx0dGVtcG9yYXJpZXNJbmRleDogbnVtYmVyO1xuXHRjb2RlID0gXCJcIjtcblxuXHRjb25zdHJ1Y3Rvcih2YXJOYW1lczogTmFtZXNwYWNlPHN0cmluZz4sIGJvZHk6IEV4cHJlc3Npb25bXSwgdGVtcG9yYXJpZXNPZmZzZXQgPSAwKSB7XG5cdFx0dGhpcy52YXJOYW1lcyA9IHZhck5hbWVzO1xuXHRcdHRoaXMuYm9keSA9IGJvZHk7XG5cdFx0dGhpcy50ZW1wb3Jhcmllc0luZGV4ID0gdGVtcG9yYXJpZXNPZmZzZXQ7XG5cdH1cblxuXHRjb21waWxlKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuYm9keS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuY29kZSA9IFwicmV0dXJuIFtudWxsLCBudWxsXTtcIlxuXHRcdH1cblx0XHRpZiAodGhpcy5jb2RlICE9PSBcIlwiKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb2RlO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5ib2R5Lmxlbmd0aC0xOyBpKyspIHtcblx0XHRcdGxldCBleHByID0gdGhpcy5ib2R5W2ldITtcblx0XHRcdGlmIChleHByLmtpbmQgIT09IFwiY2FsbFwiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb2RlICs9IHRoaXMuZXhwcihleHByKSArIFwiO1wiO1xuXHRcdH1cblx0XHRsZXQgbGFzdCA9IHRoaXMuZXhwcih0aGlzLmJvZHlbdGhpcy5ib2R5Lmxlbmd0aC0xXSEpO1xuXHRcdHRoaXMuY29kZSArPSBgcmV0dXJuIFtudWxsLCAke2xhc3R9XTtgXG5cdFx0cmV0dXJuIHRoaXMuY29kZTtcblx0fVxuXG5cdGV4cHIoZXhwcjogRXhwcmVzc2lvbik6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChleHByLmtpbmQpIHtcblx0XHRjYXNlIFwidW5pdFwiOlxuXHRcdFx0cmV0dXJuIFwibnVsbFwiO1xuXHRcdGNhc2UgXCJudW1iZXJcIjpcblx0XHRcdHJldHVybiBgJHtleHByLnZhbHVlfW5gO1xuXHRcdGNhc2UgXCJzdHJpbmdcIjpcblx0XHRcdHJldHVybiBgJHt0b0phdmFzY3JpcHRTdHJpbmcoZXhwci52YWx1ZSl9YFxuXHRcdGNhc2UgXCJhdG9tXCI6XG5cdFx0XHRyZXR1cm4gYCgke25ld0F0b219KCR7dG9KYXZhc2NyaXB0U3RyaW5nKGV4cHIudmFsdWUpfSkpYDtcblx0XHRjYXNlIFwicmVmXCI6XG5cdFx0XHRyZXR1cm4gdGhpcy52YXJOYW1lcy5nZXQoZXhwci52YWx1ZSlcblx0XHRcdFx0Pz8gYCgke291ck5hbWVzcGFjZX0ubXVzdEdldCgke3RvSmF2YXNjcmlwdFN0cmluZyhleHByLnZhbHVlKX0pKWA7XG5cdFx0Y2FzZSBcImNhbGxcIjpcblx0XHRcdGxldCBmaXJzdCA9IHRoaXMuZXhwcihleHByLmZpcnN0KTtcblx0XHRcdGxldCBhcmdzID0gZXhwci5hcmd1bWVudHMubWFwKGFyZyA9PiB0aGlzLmV4cHIoYXJnKSkuam9pbihcIiwgXCIpO1xuXHRcdFx0cmV0dXJuIGAoJHt1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc30oJHtmaXJzdH0oJHtvdXJOYW1lc3BhY2V9LCAke2FyZ3N9KSkpYDtcblx0XHRjYXNlIFwibGlzdFwiOlxuXHRcdFx0bGV0IGVsZW1lbnRzID0gZXhwci5lbGVtZW50cy5tYXAoZSA9PiB0aGlzLmV4cHIoZSkpLmpvaW4oXCIsIFwiKTtcblx0XHRcdHJldHVybiBgKCR7bmV3TGlzdH0oJHtlbGVtZW50c30pKWA7XG5cdFx0Y2FzZSBcImJsb2NrXCI6XG5cdFx0XHRsZXQgY29udGVudCA9IG5ldyBDb21waWxlcih0aGlzLnZhck5hbWVzLCBleHByLmV4cHJlc3Npb25zKS5jb21waWxlKCk7XG5cdFx0XHRyZXR1cm4gYCgke25ld0Jsb2NrfSgke291ck5hbWVzcGFjZX0sIGZ1bmN0aW9uKCR7dGhlaXJOYW1lc3BhY2V9LCAuLi5hcmdzKSB7XFxuYFxuXHRcdFx0XHQrIFwiaWYgKCEoYXJncy5sZW5ndGggPT09IDAgfHwgKGFyZ3MubGVuZ3RoID09PSAxICYmIGFyZ3NbMF0gPT09IG51bGwpKSkge1xcblwiXG5cdFx0XHRcdCsgXCJcXHR0aHJvdyBuZXcgRXJyb3IoJ2Nhbm5vdCBjYWxsIGJhc2ljIGJsb2NrIHdpdGggYXJndW1lbnRzJyk7XFxuXCJcblx0XHRcdFx0KyBcIn1cXG5cIlxuXHRcdFx0XHQrIGBsZXQgJHtvdXJOYW1lc3BhY2V9ID0gdGhpcztcXG5gXG5cdFx0XHRcdCsgdW5wYWNrQW5kTWF5YmVBZGRUb091cnNEZWZpbml0aW9uICsgJ1xcblxcbidcblx0XHRcdFx0KyBjb250ZW50ICsgXCJcXG59KSlcIjtcblx0XHR9XG5cdH1cbn1cblxudHlwZSBWYWx1ZSA9IG51bGwgfCBib29sZWFuIHwgYmlnaW50IHwgc3RyaW5nIHwgUnVudGltZUJsb2NrIHwgUnVudGltZUF0b20gfCBSdW50aW1lTGlzdCB8IFJ1bnRpbWVNYXA7XG5cbnR5cGUgUnVudGltZUJsb2NrID0ge1xuXHRuYW1lc3BhY2U6IE5hbWVzcGFjZTxWYWx1ZT47XG5cdG9yaWdpbmFsOiBSdW50aW1lQmxvY2tGdW5jdGlvbjtcblx0KG5zOiBOYW1lc3BhY2U8VmFsdWU+LCAuLi5hcmdzOiAoVmFsdWUgfCB1bmRlZmluZWQpW10pOlxuXHRcdFJldHVyblR5cGU8UnVudGltZUJsb2NrRnVuY3Rpb24+O1xufTtcblxudHlwZSBSdW50aW1lQmxvY2tGdW5jdGlvbiA9IChuczogTmFtZXNwYWNlPFZhbHVlPiwgLi4uYXJnczogKFZhbHVlIHwgdW5kZWZpbmVkKVtdKVxuXHQ9PiBbUnVudGltZU1hcCB8IG51bGwsIFZhbHVlXTtcblxuZnVuY3Rpb24gdmFsdWVTdHJpbmcodjogVmFsdWUpOiBzdHJpbmcge1xuXHRpZiAodiA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBcIigpXCI7XG5cdH0gZWxzZSBpZiAodHlwZW9mIHYgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdHJldHVybiBcImJsb2NrXCI7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHYudG9TdHJpbmcoKTtcblx0fVxufVxuXG5mdW5jdGlvbiB2YWx1ZUVxdWFscyh2MTogVmFsdWUsIHYyOiBWYWx1ZSk6IGJvb2xlYW4ge1xuXHRpZiAodjEgPT09IG51bGxcblx0XHR8fCB0eXBlb2YgdjEgPT09IFwiYm9vbGVhblwiXG5cdFx0fHwgdHlwZW9mIHYxID09PSBcImJpZ2ludFwiXG5cdFx0fHwgdHlwZW9mIHYxID09PSBcInN0cmluZ1wiXG5cdCkge1xuXHRcdHJldHVybiB2MSA9PT0gdjI7XG5cdH0gZWxzZSBpZiAodHlwZW9mIHYxID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHYxLmVxdWFscyh2Mik7XG5cdH1cbn1cblxuY2xhc3MgUnVudGltZUF0b20ge1xuXHR2YWx1ZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IFZhbHVlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBSdW50aW1lQXRvbSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUgPT09IG90aGVyLnZhbHVlO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYChhdG9tICR7dG9KYXZhc2NyaXB0U3RyaW5nKHRoaXMudmFsdWUpfSlgO1xuXHR9XG59XG5cbi8vIFRPRE86IGVmZmljaWVudCBsaXN0XG5jbGFzcyBSdW50aW1lTGlzdCBpbXBsZW1lbnRzIEl0ZXJhYmxlPFZhbHVlPiB7XG5cdGVsZW1lbnRzOiBWYWx1ZVtdO1xuXG5cdGNvbnN0cnVjdG9yKC4uLmVsZW1lbnRzOiBWYWx1ZVtdKSB7XG5cdFx0dGhpcy5lbGVtZW50cyA9IGVsZW1lbnRzO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBWYWx1ZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghKG90aGVyIGluc3RhbmNlb2YgUnVudGltZUxpc3QpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmVsZW1lbnRzLmxlbmd0aCAhPT0gb3RoZXIuZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICghdmFsdWVFcXVhbHModGhpcy5lbGVtZW50c1tpXSEsIG90aGVyLmVsZW1lbnRzW2ldISkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGxlbigpOiBiaWdpbnQge1xuXHRcdHJldHVybiBCaWdJbnQodGhpcy5lbGVtZW50cy5sZW5ndGgpO1xuXHR9XG5cblx0YXQoaWR4OiBiaWdpbnQpOiBWYWx1ZSB7XG5cdFx0aWYgKGlkeCA8IDAgfHwgaWR4ID49IHRoaXMuZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFxuXHRcdFx0XHRsaXN0IG91dCBvZiBib3VuZHMgKCR7aWR4fSB3aXRoIGxlbmd0aCAke3RoaXMuZWxlbWVudHMubGVuZ3RofSlgLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudHNbTnVtYmVyKGlkeCldITtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFwiW1wiICsgdGhpcy5lbGVtZW50cy5tYXAoZSA9PiB2YWx1ZVN0cmluZyhlKSkuam9pbihcIiBcIikgKyBcIl1cIjtcblx0fVxuXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpIHtcblx0XHR5aWVsZCogdGhpcy5lbGVtZW50cztcblx0fVxufVxuXG4vLyBUT0RPOiBlZmZpY2llbnQgbWFwXG5jbGFzcyBSdW50aW1lTWFwIGltcGxlbWVudHMgSXRlcmFibGU8UnVudGltZUxpc3Q+IHtcblx0ZWxlbWVudHM6IHsga2V5OiBWYWx1ZSwgdmFsdWU6IFZhbHVlIH1bXTtcblx0XG5cdGNvbnN0cnVjdG9yKGVsZW1lbnRzOiB7IGtleTogVmFsdWUsIHZhbHVlOiBWYWx1ZSB9W10pIHtcblx0XHR0aGlzLmVsZW1lbnRzID0gZWxlbWVudHM7XG5cdH1cblxuXHRzdGF0aWMgZnJvbVJ1bnRpbWVWYWx1ZXMobnM6IE5hbWVzcGFjZTxWYWx1ZT4sIC4uLnZhbHVlczogVmFsdWVbXSk6IFJ1bnRpbWVNYXAge1xuXHRcdGxldCBlbGVtZW50cyA9IFtdO1xuXHRcdGZvciAobGV0IHYgb2YgdmFsdWVzKSB7XG5cdFx0XHRsZXQga2V5O1xuXHRcdFx0bGV0IHZhbHVlO1xuXHRcdFx0aWYgKHYgaW5zdGFuY2VvZiBSdW50aW1lQXRvbSkge1xuXHRcdFx0XHRrZXkgPSB2O1xuXHRcdFx0XHR2YWx1ZSA9IG5zLm11c3RHZXQodi52YWx1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHYgaW5zdGFuY2VvZiBSdW50aW1lTGlzdCAmJiB2LmxlbigpID09IDJuKSB7XG5cdFx0XHRcdGtleSA9IHYuYXQoMG4pO1xuXHRcdFx0XHR2YWx1ZSA9IHYuYXQoMW4pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHRcdFwiY2FuIG9ubHkgY3JlYXRlIG1hcCBmcm9tIGxpc3Qgb2YgYXRvbXMgb3IgcGFpcnMgb2Yga2V5IGFuZCB2YWx1ZVwiLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCB7IGtleTogZXhpc3RpbmdLZXkgfSBvZiBlbGVtZW50cykge1xuXHRcdFx0XHRpZiAodmFsdWVFcXVhbHMoa2V5LCBleGlzdGluZ0tleSkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGR1cGxpY2F0ZSBrZXkgJHt2YWx1ZVN0cmluZyhrZXkpfSB3aGlsZSBjcmVhdGluZyBtYXBgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWxlbWVudHMucHVzaCh7IGtleSwgdmFsdWUgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUnVudGltZU1hcChlbGVtZW50cyk7XG5cdH1cblxuXHR0cnlHZXQoa2V5OiBWYWx1ZSk6IFZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0KGtleSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGdldChrZXk6IFZhbHVlKTogVmFsdWUge1xuXHRcdGZvciAobGV0IHsga2V5OiBvdXJLZXksIHZhbHVlIH0gb2YgdGhpcy5lbGVtZW50cykge1xuXHRcdFx0aWYgKHZhbHVlRXF1YWxzKGtleSwgb3VyS2V5KSkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihgbWFwOiBmYWlsZWQgZ2V0dGluZyB2YWx1ZSBmb3Iga2V5ICR7dmFsdWVTdHJpbmcoa2V5KX1gKTtcblx0fVxuXG5cdGluc2VydChrZXk6IFZhbHVlLCB2YWx1ZTogVmFsdWUpOiBSdW50aW1lTWFwIHtcblx0XHRmb3IgKGxldCB7IGtleTogb3VyS2V5IH0gb2YgdGhpcy5lbGVtZW50cykge1xuXHRcdFx0aWYgKHZhbHVlRXF1YWxzKGtleSwgb3VyS2V5KSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG1hcCBpbnNlcnQgZmFpbGVkLCBkdXBsaWNhdGUga2V5ICR7dmFsdWVTdHJpbmcoa2V5KX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0bGV0IG5leHQgPSB0aGlzLmVsZW1lbnRzLnNsaWNlKCk7XG5cdFx0bmV4dC5wdXNoKHsga2V5LCB2YWx1ZSB9KTtcblx0XHRyZXR1cm4gbmV3IFJ1bnRpbWVNYXAobmV4dCk7XG5cdH1cblxuXHRpbnNlcnRNYW55KG90aGVyOiBSdW50aW1lTWFwKTogUnVudGltZU1hcCB7XG5cdFx0Zm9yIChsZXQgeyBrZXkgfSBvZiBvdGhlci5lbGVtZW50cykge1xuXHRcdFx0Zm9yIChsZXQgeyBrZXk6IG91cktleSB9IG9mIHRoaXMuZWxlbWVudHMpIHtcblx0XHRcdFx0aWYgKHZhbHVlRXF1YWxzKGtleSwgb3VyS2V5KSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgbWFwIGluc2VydE1hbnkgZmFpbGVkLCBkdXBsaWNhdGUga2V5ICR7dmFsdWVTdHJpbmcoa2V5KX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRsZXQgbmV4dCA9IHRoaXMuZWxlbWVudHMuc2xpY2UoKTtcblx0XHRmb3IgKGxldCB7IGtleSwgdmFsdWUgfSBvZiBvdGhlci5lbGVtZW50cykge1xuXHRcdFx0bmV4dC5wdXNoKHsga2V5LCB2YWx1ZSB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSdW50aW1lTWFwKG5leHQpO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBWYWx1ZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghKG90aGVyIGluc3RhbmNlb2YgUnVudGltZU1hcCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZWxlbWVudHMubGVuZ3RoICE9PSBvdGhlci5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgeyBrZXksIHZhbHVlIH0gb2YgdGhpcy5lbGVtZW50cykge1xuXHRcdFx0bGV0IGZvdW5kID0gZmFsc2U7XG5cdFx0XHRmb3IgKGxldCB7IGtleTogb3RoZXJLZXksIHZhbHVlOiBvdGhlclZhbHVlIH0gb2Ygb3RoZXIuZWxlbWVudHMpIHtcblx0XHRcdFx0aWYgKHZhbHVlRXF1YWxzKGtleSwgb3RoZXJLZXkpKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlRXF1YWxzKHZhbHVlLCBvdGhlclZhbHVlKSkge1xuXHRcdFx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFmb3VuZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRsZXQgc3RyID0gXCJtYXBcIjtcblx0XHRmb3IgKGxldCB7IGtleSwgdmFsdWUgfSBvZiB0aGlzLmVsZW1lbnRzKSB7XG5cdFx0XHRzdHIgKz0gYCBbKCR7dmFsdWVTdHJpbmcoa2V5KX0pICgke3ZhbHVlU3RyaW5nKHZhbHVlKX0pXWA7XG5cdFx0fVxuXHRcdHJldHVybiBzdHI7XG5cdH1cblxuXHQqW1N5bWJvbC5pdGVyYXRvcl0oKSB7XG5cdFx0Zm9yIChsZXQgeyBrZXksIHZhbHVlIH0gb2YgdGhpcy5lbGVtZW50cykge1xuXHRcdFx0eWllbGQgbmV3IFJ1bnRpbWVMaXN0KGtleSwgdmFsdWUpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBtYXRjaChtYXRjaGVyOiBWYWx1ZSwgdmFsdWU6IFZhbHVlKTogYm9vbGVhbiB8IFJ1bnRpbWVNYXAge1xuXHRpZiAobWF0Y2hlciA9PT0gbnVsbFxuXHRcdHx8IHR5cGVvZiBtYXRjaGVyID09PSBcImJvb2xlYW5cIlxuXHRcdHx8IHR5cGVvZiBtYXRjaGVyID09PSBcImJpZ2ludFwiXG5cdFx0fHwgdHlwZW9mIG1hdGNoZXIgPT09IFwic3RyaW5nXCJcblx0KSB7XG5cdFx0cmV0dXJuIG1hdGNoZXIgPT09IHZhbHVlO1xuXHR9IGVsc2UgaWYgKG1hdGNoZXIgaW5zdGFuY2VvZiBSdW50aW1lQXRvbSkge1xuXHRcdHJldHVybiBSdW50aW1lTWFwLmZyb21SdW50aW1lVmFsdWVzKG5ldyBFbXB0eU5hbWVzcGFjZTxWYWx1ZT4oKSwgbmV3IFJ1bnRpbWVMaXN0KG1hdGNoZXIsIHZhbHVlKSk7XG5cdH0gZWxzZSBpZiAodHlwZW9mIG1hdGNoZXIgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdGxldCByZXN1bHQgPSBtYXRjaGVyKG5ldyBFbXB0eU5hbWVzcGFjZTxWYWx1ZT4oKSwgdmFsdWUpWzFdO1xuXHRcdGlmICh0eXBlb2YgcmVzdWx0ID09PSBcImJvb2xlYW5cIiB8fCByZXN1bHQgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJtYXRjaGVyIGJsb2NrIG11c3QgcmV0dXJuIGJvb2xlYW4gb3IgbWFwXCIpO1xuXHRcdH1cblx0fSBlbHNlIGlmIChtYXRjaGVyIGluc3RhbmNlb2YgUnVudGltZUxpc3QpIHtcblx0XHRpZiAoISh2YWx1ZSBpbnN0YW5jZW9mIFJ1bnRpbWVMaXN0KSB8fCBtYXRjaGVyLmxlbigpICE9IHZhbHVlLmxlbigpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGxldCByZXN1bHRzID0gUnVudGltZU1hcC5mcm9tUnVudGltZVZhbHVlcyhuZXcgRW1wdHlOYW1lc3BhY2U8VmFsdWU+KCkpO1xuXHRcdGZvciAobGV0IGkgPSAwbjsgaSA8IG1hdGNoZXIubGVuKCk7IGkrKykge1xuXHRcdFx0bGV0IHJlc3VsdCA9IG1hdGNoKG1hdGNoZXIuYXQoaSksIHZhbHVlLmF0KGkpKTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSB7XG5cdFx0XHRcdHJlc3VsdHMgPSByZXN1bHRzLmluc2VydE1hbnkocmVzdWx0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH0gZWxzZSBpZiAobWF0Y2hlciBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApIHtcblx0XHRpZiAoISh2YWx1ZSBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGxldCByZXN1bHRzID0gUnVudGltZU1hcC5mcm9tUnVudGltZVZhbHVlcyhuZXcgRW1wdHlOYW1lc3BhY2U8VmFsdWU+KCkpO1xuXHRcdGZvciAobGV0IGt2IG9mIG1hdGNoZXIpIHtcblx0XHRcdGxldCBmb3VuZCA9IHZhbHVlLnRyeUdldChrdi5hdCgwbikpO1xuXHRcdFx0aWYgKGZvdW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHJlc3VsdCA9IG1hdGNoKGt2LmF0KDFuKSwgZm91bmQpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdCBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApIHtcblx0XHRcdFx0cmVzdWx0cyA9IHJlc3VsdHMuaW5zZXJ0TWFueShyZXN1bHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHByaW50bG4oczogc3RyaW5nKSB7XG5cdGNvbnNvbGUubG9nKHMpO1xufVxuXG5mdW5jdGlvbiBjaGVja0FyZ3VtZW50TGVuZ3RoKGV4cGVjdGVkOiBudW1iZXIsIGdvdDogeyBsZW5ndGg6IG51bWJlciB9KTogdm9pZCB7XG5cdGlmIChleHBlY3RlZCAhPT0gZ290Lmxlbmd0aC0xKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBleHBlY3RlZCAke2V4cGVjdGVkfSBhcmd1bWVudHMsIGdvdCAke2dvdC5sZW5ndGgtMX1gKTtcblx0fVxufVxuXG4vLyBUT0RPOiBiZXR0ZXIgZXJyb3IgaGFuZGxpbmdcbmZ1bmN0aW9uIGFyZ3VtZW50RXJyb3IoKTogRXJyb3Ige1xuXHRyZXR1cm4gbmV3IEVycm9yKFwiYmFkIGFyZ3VtZW50IHR5cGUocylcIik7XG59XG5cbmZ1bmN0aW9uIGRvTmFtZXNwYWNlSW5zZXJ0TWFwKG5hbWVzcGFjZTogTmFtZXNwYWNlPFZhbHVlPiwgbWFwOiBSdW50aW1lTWFwKTogTmFtZXNwYWNlPFZhbHVlPiB7XG5cdGZvciAobGV0IGF0b21BbmRWYWx1ZSBvZiBtYXApIHtcblx0XHRsZXQgYXRvbSA9IGF0b21BbmRWYWx1ZS5hdCgwbik7XG5cdFx0aWYgKCEoYXRvbSBpbnN0YW5jZW9mIFJ1bnRpbWVBdG9tKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBuYW1lc3BhY2UgaW5zZXJ0OiBleHBlY3RlZCBhdG9tLCBnb3QgJHt2YWx1ZVN0cmluZyhhdG9tKX1gKTtcblx0XHR9XG5cdFx0bmFtZXNwYWNlID0gbmFtZXNwYWNlLm11c3RJbnNlcnQoYXRvbS52YWx1ZSwgYXRvbUFuZFZhbHVlLmF0KDFuKSk7XG5cdH1cblx0cmV0dXJuIG5hbWVzcGFjZTtcbn1cblxuY29uc3QgYnVpbHRpbkJsb2NrczogW3N0cmluZywgUnVudGltZUJsb2NrRnVuY3Rpb25dW10gPSBbXG5cdFtcIj1cIiwgZnVuY3Rpb24oXywgYXNzaWduZWUsIHZhbHVlKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGxldCByZXN1bHQgPSBtYXRjaChhc3NpZ25lZSEsIHZhbHVlISk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIj0gcGF0dGVybiBtYXRjaCBmYWlsZWRcIik7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSB7XG5cdFx0XHRyZXR1cm4gW3Jlc3VsdCwgbnVsbF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBbbnVsbCwgbnVsbF07XG5cdFx0fVxuXHR9XSxcblx0W1wiZGVmXCIsIGZ1bmN0aW9uKF8sIG1hdGNoZXIsIGJsb2NrKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgYmxvY2sgIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRsZXQgZm46IFJ1bnRpbWVCbG9ja0Z1bmN0aW9uID0gKG5zLCAuLi5hcmdzKSA9PiB7XG5cdFx0XHRsZXQgbWF0Y2hlZSA9IG5ldyBSdW50aW1lTGlzdCguLi5hcmdzIGFzIFZhbHVlW10pO1xuXHRcdFx0bGV0IHJlc3VsdCA9IG1hdGNoKG1hdGNoZXIhLCBtYXRjaGVlKTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcImNhbGwgd2l0aCB3cm9uZyBhcmd1bWVudHNcIik7XG5cdFx0XHR9XG5cdFx0XHRsZXQgY2FsbE5hbWVzcGFjZSA9IGJsb2NrLm5hbWVzcGFjZTtcblx0XHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSB7XG5cdFx0XHRcdGNhbGxOYW1lc3BhY2UgPSBkb05hbWVzcGFjZUluc2VydE1hcChjYWxsTmFtZXNwYWNlLCByZXN1bHQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJsb2NrLm9yaWdpbmFsLmNhbGwoY2FsbE5hbWVzcGFjZSwgbnMpO1xuXHRcdH07XG5cdFx0cmV0dXJuIFtudWxsLCBjcmVhdGVOZXdCbG9jayhibG9jay5uYW1lc3BhY2UsIGZuKV07XG5cdH1dLFxuXHRbXCJtYXRjaFwiLCBmdW5jdGlvbihucywgdmFsdWUsIG1hdGNoZXJzQW5kQmxvY2tzKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICghKG1hdGNoZXJzQW5kQmxvY2tzIGluc3RhbmNlb2YgUnVudGltZUxpc3QpXG5cdFx0XHR8fCBtYXRjaGVyc0FuZEJsb2Nrcy5sZW4oKSAlIDJuICE9PSAwbilcblx0XHR7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwbjsgaSA8IG1hdGNoZXJzQW5kQmxvY2tzLmxlbigpOyBpICs9IDJuKSB7XG5cdFx0XHRsZXQgbWF0Y2hlciA9IG1hdGNoZXJzQW5kQmxvY2tzLmF0KGkpO1xuXHRcdFx0bGV0IGJsb2NrID0gbWF0Y2hlcnNBbmRCbG9ja3MuYXQoaSsxbik7XG5cdFx0XHRpZiAodHlwZW9mIGJsb2NrICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHJlc3VsdCA9IG1hdGNoKG1hdGNoZXIsIHZhbHVlISk7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCBjYWxsTmFtZXNwYWNlID0gYmxvY2submFtZXNwYWNlO1xuXHRcdFx0aWYgKHJlc3VsdCBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApIHtcblx0XHRcdFx0Y2FsbE5hbWVzcGFjZSA9IGRvTmFtZXNwYWNlSW5zZXJ0TWFwKGNhbGxOYW1lc3BhY2UsIHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYmxvY2sub3JpZ2luYWwuY2FsbChjYWxsTmFtZXNwYWNlLCBucyk7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihcIm1hdGNoOiBubyBwYXR0ZXJuIG1hdGNoZWRcIik7XG5cdH1dLFxuXHRbXCIrXCIsIGZ1bmN0aW9uKF8sIHgsIHkpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiB4ICE9PSBcImJpZ2ludFwiIHx8IHR5cGVvZiB5ICE9PSBcImJpZ2ludFwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBbbnVsbCwgeCt5XTtcblx0fV0sXG5cdFtcIm1hcFwiLCBmdW5jdGlvbihucywgLi4uZWxlbWVudHMpIHtcblx0XHRyZXR1cm4gW251bGwsIFJ1bnRpbWVNYXAuZnJvbVJ1bnRpbWVWYWx1ZXMobnMsIC4uLmVsZW1lbnRzIGFzIFZhbHVlW10pXTtcblx0fV0sXG5cdFtcImluc2VydENhbGxcIiwgZnVuY3Rpb24obnMsIGJsb2NrLCBhdG9tc0FuZFZhbHVlcykge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIGJsb2NrICE9PSBcImZ1bmN0aW9uXCIgfHwgIShhdG9tc0FuZFZhbHVlcyBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdGxldCBjYWxsTmFtZXNwYWNlID0gZG9OYW1lc3BhY2VJbnNlcnRNYXAoYmxvY2submFtZXNwYWNlLCBhdG9tc0FuZFZhbHVlcyk7XG5cdFx0cmV0dXJuIGJsb2NrLm9yaWdpbmFsLmJpbmQoY2FsbE5hbWVzcGFjZSkobnMpO1xuXHR9XSxcblx0W1wid2l0aEFyZ3NcIiwgZnVuY3Rpb24oXywgYXJnc0F0b20sIGJsb2NrKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICghKGFyZ3NBdG9tIGluc3RhbmNlb2YgUnVudGltZUF0b20gJiYgdHlwZW9mIGJsb2NrID09IFwiZnVuY3Rpb25cIikpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0bGV0IGZuOiBSdW50aW1lQmxvY2tGdW5jdGlvbiA9IChucywgLi4uYXJncykgPT4ge1xuXHRcdFx0cmV0dXJuIGJsb2NrLm9yaWdpbmFsLmJpbmQoXG5cdFx0XHRcdGJsb2NrLm5hbWVzcGFjZS5tdXN0SW5zZXJ0KFxuXHRcdFx0XHRcdGFyZ3NBdG9tLnZhbHVlLFxuXHRcdFx0XHRcdG5ldyBSdW50aW1lTGlzdCguLi5hcmdzIGFzIFZhbHVlW10pXG5cdFx0XHRcdCksXG5cdFx0XHQpKG5zKTtcblx0XHR9O1xuXHRcdHJldHVybiBbbnVsbCwgY3JlYXRlTmV3QmxvY2sobmV3IEVtcHR5TmFtZXNwYWNlPFZhbHVlPigpLCBmbildO1xuXHR9XSxcblx0W1wicHJpbnRsblwiLCBmdW5jdGlvbihfLCAuLi5hcmdzKSB7XG5cdFx0cHJpbnRsbihhcmdzLm1hcCh2ID0+IHZhbHVlU3RyaW5nKHYhKSkuam9pbihcIiBcIikpO1xuXHRcdHJldHVybiBbbnVsbCwgbnVsbF07XG5cdH1dLFxuXTtcblxuY29uc3QgYnVpbHRpbk90aGVyOiBbc3RyaW5nLCBWYWx1ZV1bXSA9IFtcblx0W1wibnVsbFwiLCBudWxsXSxcblx0W1wiZmFsc2VcIiwgZmFsc2VdLFxuXHRbXCJ0cnVlXCIsIHRydWVdLFxuXTtcblxuZnVuY3Rpb24gY3JlYXRlTmV3QmxvY2sobnM6IE5hbWVzcGFjZTxWYWx1ZT4sIGJsb2NrOiBSdW50aW1lQmxvY2tGdW5jdGlvbik6IFJ1bnRpbWVCbG9jayB7XG5cdHJldHVybiBPYmplY3QuYXNzaWduKGJsb2NrLmJpbmQobnMpLCB7IG5hbWVzcGFjZTogbnMsIG9yaWdpbmFsOiBibG9jayB9KTtcbn1cblxuY29uc3QgYnVpbHRpbk5hbWVzcGFjZSA9ICgoKSA9PiB7XG5cdGxldCBucyA9IGJ1aWx0aW5CbG9ja3MucmVkdWNlKFxuXHRcdChuczogTmFtZXNwYWNlPFZhbHVlPiwgW3N0ciwgYmxvY2tdKSA9PiB7XG5cdFx0XHRyZXR1cm4gbnMubXVzdEluc2VydChzdHIsIGNyZWF0ZU5ld0Jsb2NrKG5ldyBFbXB0eU5hbWVzcGFjZTxWYWx1ZT4oKSwgYmxvY2spKTtcblx0XHR9LFxuXHRcdG5ldyBFbXB0eU5hbWVzcGFjZTxWYWx1ZT4oKSxcblx0KTtcblx0cmV0dXJuIGJ1aWx0aW5PdGhlci5yZWR1Y2UoKG5zLCBbc3RyLCB2YWx1ZV0pID0+IG5zLm11c3RJbnNlcnQoc3RyLCB2YWx1ZSksIG5zKTtcbn0pKCk7XG5cbmNvbnN0IGludGVybmFsczogeyBbbmFtZTogc3RyaW5nXTogRnVuY3Rpb24gfSA9IHtcblx0W25ld0F0b21dOiAodmFsdWU6IHN0cmluZyk6IFJ1bnRpbWVBdG9tID0+IHtcblx0XHRyZXR1cm4gbmV3IFJ1bnRpbWVBdG9tKHZhbHVlKTtcblx0fSxcblx0W25ld0xpc3RdOiAoLi4uZWxlbWVudHM6IFZhbHVlW10pOiBSdW50aW1lTGlzdCA9PiB7XG5cdFx0cmV0dXJuIG5ldyBSdW50aW1lTGlzdCguLi5lbGVtZW50cyk7XG5cdH0sXG5cdFtuZXdCbG9ja106IGNyZWF0ZU5ld0Jsb2NrLFxuXHRbbmFtZXNwYWNlSW5zZXJ0TWFwXTogZG9OYW1lc3BhY2VJbnNlcnRNYXAsXG59O1xuXG5mdW5jdGlvbiBzdHJpbmdBbGwoc3RyOiBzdHJpbmcsIHByZWRpY2F0ZTogKGNoYXI6IHN0cmluZykgPT4gYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRmb3IgKGxldCBjaGFyIG9mIHN0cikge1xuXHRcdGlmICghcHJlZGljYXRlKGNoYXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBtdXN0U3RyaW5nRmlyc3Qoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRmb3IgKGxldCBjaGFyIG9mIHN0cikge1xuXHRcdHJldHVybiBjaGFyO1xuXHR9XG5cdHRocm93IG5ldyBFcnJvcihcImVtcHR5IHN0cmluZ1wiKTtcbn1cblxuY29uc3QgZXNjYXBlZFN5bWJvbHM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XG5cdFwiIVwiOiBcIkV4Y2xhbWF0aW9uTWFya1wiLFxuXHRcIiRcIjogXCJEb2xsYXJcIixcblx0XCIlXCI6IFwiUGVyY2VudFwiLFxuXHRcIiZcIjogXCJBbXBlcnNhbmRcIixcblx0XCIqXCI6IFwiQXN0ZXJpc2tcIixcblx0XCIrXCI6IFwiUGx1c1wiLFxuXHRcIixcIjogXCJDb21tYVwiLFxuXHRcIi1cIjogXCJNaW51c1wiLFxuXHRcIi5cIjogXCJQZXJpb2RcIixcblx0XCIvXCI6IFwiU2xhc2hcIixcblx0XCI6XCI6IFwiQ29sb25cIixcblx0XCI7XCI6IFwiU2VtaWNvbG9uXCIsXG5cdFwiPFwiOiBcIkxlc3NUaGFuXCIsXG5cdFwiPVwiOiBcIkVxdWFsaXR5U2lnblwiLFxuXHRcIj5cIjogXCJHcmVhdGVyVGhhblwiLFxuXHRcIj9cIjogXCJRdWVzdGlvbk1hcmtcIixcblx0XCJAXCI6IFwiQXRTaWduXCIsXG5cdFwiXFxcXFwiOiBcIkJhY2tzbGFzaFwiLFxuXHRcIl5cIjogXCJDYXJldFwiLFxuXHRcImBcIjogXCJBY2NlbnRcIixcblx0XCJ8XCI6IFwiVmVydGljYWxCYXJcIixcblx0XCJ+XCI6IFwiVGlsZGVcIixcbn07XG5cbmZ1bmN0aW9uIHRvSmF2YXNjcmlwdFZhck5hbWUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IGludGVybmFsKCk7XG5cdH1cblxuXHRpZiAoaXNJZGVudFN0YXJ0KG11c3RTdHJpbmdGaXJzdChzdHIpKSAmJiBzdHJpbmdBbGwoc3RyLCBpc0lkZW50KSkge1xuXHRcdC8vIFRPRE86IGNoZWNrIHN0aWxsIHZhbGlkIHdpdGggbm9uIGFzY2lpIGlkZW50c1xuXHRcdHJldHVybiBgaWRlbnRfJHtzdHJ9YDtcblx0fSBlbHNlIGlmIChzdHJpbmdBbGwoc3RyLCBpc1N5bWJvbCkpIHtcblx0XHRsZXQgZXNjYXBlZCA9IHN0cmluZ01hcChzdHIsIGNoYXIgPT4ge1xuXHRcdFx0bGV0IGVzYyA9IGVzY2FwZWRTeW1ib2xzW2NoYXJdO1xuXHRcdFx0aWYgKGVzYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBgVSR7Y2hhci5jb2RlUG9pbnRBdCgwKX1gO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGVzYztcblx0XHR9KVxuXHRcdHJldHVybiBgc3ltYm9sXyR7ZXNjYXBlZH1gO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IGludGVybmFsKCk7XG5cdH1cbn1cblxuY29uc3QgYnVpbHRpbk5hbWVzcGFjZVZhck5hbWVzID0gKCgpID0+IHtcblx0bGV0IG5zOiBOYW1lc3BhY2U8c3RyaW5nPiA9IG5ldyBFbXB0eU5hbWVzcGFjZTxzdHJpbmc+KCk7XG5cdGZvciAobGV0IFtuYW1lLCBfXSBvZiBidWlsdGluTmFtZXNwYWNlKSB7XG5cdFx0bnMgPSBucy5tdXN0SW5zZXJ0KG5hbWUsIHRvSmF2YXNjcmlwdFZhck5hbWUobmFtZSkpO1xuXHR9O1xuXHRyZXR1cm4gbnM7XG59KSgpO1xuXG5mdW5jdGlvbiBydW5FeHByZXNzaW9ucyhleHByczogRXhwcmVzc2lvbltdKTogdm9pZCB7XG5cdGxldCBjb2RlID0gXCIndXNlIHN0cmljdCc7XFxuXFxuXCI7XG5cdGNvbnN0IGludGVybmFsc05hbWUgPSBcImludGVybmFsc1wiO1xuXHRmb3IgKGxldCBuYW1lIG9mIE9iamVjdC5rZXlzKGludGVybmFscykpIHtcblx0XHRjb2RlICs9IGBjb25zdCAke25hbWV9ID0gJHtpbnRlcm5hbHNOYW1lfS4ke25hbWV9O1xcbmA7XG5cdH1cblx0Y29kZSArPSBcIlxcblwiO1xuXG5cdGZvciAobGV0IFtuYW1lLCB2YXJOYW1lXSBvZiBidWlsdGluTmFtZXNwYWNlVmFyTmFtZXMpIHtcblx0XHRjb2RlICs9IGBjb25zdCAke3Zhck5hbWV9ID0gJHtvdXJOYW1lc3BhY2V9Lm11c3RHZXQoJHt0b0phdmFzY3JpcHRTdHJpbmcobmFtZSl9KTtcXG5gO1xuXHR9XG5cdGNvZGUgKz0gYFxcbiR7dW5wYWNrQW5kTWF5YmVBZGRUb091cnNEZWZpbml0aW9ufVxcblxcbmA7XG5cblx0Y29kZSArPSBuZXcgQ29tcGlsZXIoYnVpbHRpbk5hbWVzcGFjZVZhck5hbWVzLCBleHBycykuY29tcGlsZSgpO1xuXHRjb25zb2xlLmxvZyhjb2RlKTtcblx0bmV3IEZ1bmN0aW9uKGludGVybmFsc05hbWUsIG91ck5hbWVzcGFjZSwgY29kZSkoaW50ZXJuYWxzLCBidWlsdGluTmFtZXNwYWNlKTtcbn1cblxuZnVuY3Rpb24gcnVuKCkge1xuXHRsZXQgY29kZSA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvZGVcIikgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG5cblx0bGV0IHRva2VucyA9IFtdO1xuXHRmb3IgKGxldCB0b2sgb2YgbmV3IExleGVyKFwidGV4dGFyZWFcIiwgY29kZSkpIHtcblx0XHRpZiAodG9rLmtpbmQgPT09IFwiYXRvbVwiXG5cdFx0XHR8fCB0b2sua2luZCA9PT0gXCJudW1iZXJcIlxuXHRcdFx0fHwgdG9rLmtpbmQgPT09IFwicmVmXCJcblx0XHRcdHx8IHRvay5raW5kID09PSBcInN0cmluZ1wiXG5cdFx0XHR8fCB0b2sua2luZCA9PT0gXCJzeW1ib2xcIlxuXHRcdCkge1xuXHRcdFx0dG9rZW5zLnB1c2goYCR7dG9rLmtpbmR9ICgke3Rvay52YWx1ZX0pYClcblx0XHR9IGVsc2Uge1xuXHRcdFx0dG9rZW5zLnB1c2goYCR7dG9rLmtpbmR9YCk7XG5cdFx0fVxuXHR9O1xuXHRjb25zb2xlLmxvZyh0b2tlbnMuam9pbihcIiwgXCIpKTtcblxuXHRsZXQgcGFyc2VyID0gbmV3IFBhcnNlcihcblx0XHRuZXcgTGV4ZXIoXCJ0ZXh0YXJlYVwiLCBjb2RlKSxcblx0XHRbXG5cdFx0XHRbXCI9XCIsIFwiPC1cIl0sXG5cdFx0XHRbXCJ8PlwiXSxcblx0XHRdLFxuXHRcdFtcblx0XHRcdFtcIi0+XCJdLFxuXHRcdFx0W1wiJiZcIiwgXCJ8fFwiXSxcblx0XHRcdFtcIj09XCIsIFwiIT1cIl0sXG5cdFx0XHRbXCI8XCIsIFwiPD1cIiwgXCI+XCIsIFwiPj1cIl0sXG5cdFx0XHRbXCIuLlwiLCBcIi4uPFwiLCBcIjwuLlwiLCBcIjwuLjxcIl0sXG5cdFx0XHRbXCIrK1wiXSxcblx0XHRcdFtcIitcIiwgXCItXCJdLFxuXHRcdFx0W1wiKlwiLCBcIi9cIiwgXCIvL1wiLCBcIiUlXCJdLFxuXHRcdFx0W1wiQFwiXSxcblx0XHRcdFtcIi5cIl0sXG5cdFx0XSxcblx0KTtcblx0bGV0IGV4cHJzID0gcGFyc2VyLnBhcnNlKCk7XG5cdGZvciAobGV0IGV4cHIgb2YgZXhwcnMpIHtcblx0XHRjb25zb2xlLmxvZyhleHByZXNzaW9uU3RyaW5nKGV4cHIpKTtcblx0fVxuXG5cdHJ1bkV4cHJlc3Npb25zKGV4cHJzKTtcbn07Il19