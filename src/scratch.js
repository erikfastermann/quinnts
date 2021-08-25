"use strict";
function internal() {
    return new Error("internal error");
}
function unreachable() {
    throw new Error("unreachable");
}
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
    constructor(entry = null) {
        this.entry = entry;
    }
    toString() {
        if (!this.entry) {
            return "";
        }
        else {
            return this.entry.toString();
        }
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
        if (!this.entry) {
            throw new Error(`key ${key} not found`);
        }
        return this.entry.mustGet(key);
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
        if (!this.entry) {
            return new Namespace(new NamespaceEntry(key, value, null, null));
        }
        return new Namespace(this.entry.mustInsert(key, value));
    }
    *[Symbol.iterator]() {
        if (!this.entry) {
            return;
        }
        yield* this.entry;
    }
}
class NamespaceEntry {
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
    mustInsert(key, value) {
        if (key < this.key) {
            if (!this.left) {
                return new NamespaceEntry(this.key, this.value, new NamespaceEntry(key, value, null, null), this.right);
            }
            return new NamespaceEntry(this.key, this.value, this.left.mustInsert(key, value), this.right);
        }
        else if (key > this.key) {
            if (!this.right) {
                return new NamespaceEntry(this.key, this.value, this.left, new NamespaceEntry(key, value, null, null));
            }
            return new NamespaceEntry(this.key, this.value, this.left, this.right.mustInsert(key, value));
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
                    + "if (args.length !== 0) {\n"
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
class Return {
    constructor(value) {
        this.value = value;
    }
    equals(other) {
        if (!(other instanceof Return)) {
            return false;
        }
        return valueEquals(this.value, other.value);
    }
    toString() {
        return `(return ${valueString(this.value)})`;
    }
}
class Mut {
    constructor(value) {
        this.value = value;
    }
    equals(other) {
        if (!(other instanceof Mut)) {
            return false;
        }
        return valueEquals(this.value, other.value);
    }
    toString() {
        return `(mut ${valueString(this.value)})`;
    }
}
class Unique {
    equals(other) {
        if (!(other instanceof Unique)) {
            return false;
        }
        return this === other;
    }
    toString() {
        return "unique";
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
        return `(atom ${valueString(this.value)})`;
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
    append(value) {
        let next = this.elements.slice();
        next.push(value);
        return new RuntimeList(...next);
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
        return RuntimeMap.fromRuntimeValues(new Namespace(), new RuntimeList(matcher, value));
    }
    else if (typeof matcher === "function") {
        let result = matcher(new Namespace(), value)[1];
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
    }
    else if (matcher instanceof RuntimeMap) {
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
    }
    else if (matcher instanceof Mut) {
        if (!(value instanceof Mut)) {
            return false;
        }
        return match(matcher.value, value.value);
    }
    else if (matcher instanceof Return) {
        if (!(value instanceof Return)) {
            return false;
        }
        return match(matcher.value, value.value);
    }
    else if (matcher instanceof Unique) {
        return matcher.equals(value);
    }
    else {
        unreachable();
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
function defBlock(_, matcher, block) {
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
}
const builtinBlocks = [
    ["call", function (ns, block, args) {
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
                return block(ns, ...args.elements);
            }
            else {
                return block(ns);
            }
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
            if (!(argsAtom instanceof RuntimeAtom && typeof block === "function")) {
                throw argumentError();
            }
            let fn = (ns, ...args) => {
                return block.original.bind(block.namespace.mustInsert(argsAtom.value, new RuntimeList(...args)))(ns);
            };
            return [null, createNewBlock(new Namespace(), fn)];
        }],
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
    ["def", defBlock],
    ["->", defBlock],
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
    ["return", function (_, value) {
            checkArgumentLength(1, arguments);
            throw new Return(value);
        }],
    ["returnv", function (_, value) {
            checkArgumentLength(1, arguments);
            return [null, new Return(value)];
        }],
    ["if", function (ns, cond, trueBlock, falseBlock) {
            checkArgumentLength(3, arguments);
            if (typeof trueBlock !== "function" || typeof falseBlock !== "function") {
                throw argumentError();
            }
            if (cond === null || cond === false) {
                return falseBlock(ns);
            }
            else {
                return trueBlock(ns);
            }
        }],
    ["or", function (ns, condsAndBlocks) {
            checkArgumentLength(1, arguments);
            if (!(condsAndBlocks instanceof RuntimeList)
                || condsAndBlocks.len() % 2n !== 0n) {
                throw argumentError();
            }
            for (let i = 0n; i < condsAndBlocks.len(); i += 2n) {
                let cond = condsAndBlocks.at(i);
                let block = condsAndBlocks.at(i + 1n);
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
    ["loop", function (ns, block) {
            checkArgumentLength(1, arguments);
            if (typeof block !== "function") {
                throw argumentError();
            }
            while (true) {
                try {
                    block(ns);
                }
                catch (e) {
                    if (e instanceof Return) {
                        return [null, e.value];
                    }
                    else {
                        throw e;
                    }
                }
            }
        }],
    ["==", function (_, x, y) {
            checkArgumentLength(2, arguments);
            return [null, valueEquals(x, y)];
        }],
    ["!=", function (_, x, y) {
            checkArgumentLength(2, arguments);
            return [null, !valueEquals(x, y)];
        }],
    ["<", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x < y];
        }],
    ["<=", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x <= y];
        }],
    [">", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x > y];
        }],
    [">=", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x >= y];
        }],
    ["+", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x + y];
        }],
    ["-", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x - y];
        }],
    ["*", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x * y];
        }],
    ["//", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x / y];
        }],
    ["%", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x % y];
        }],
    ["map", function (ns, ...elements) {
            return [null, RuntimeMap.fromRuntimeValues(ns, ...elements)];
        }],
    [".", function (_, map, key) {
            checkArgumentLength(2, arguments);
            if (!(map instanceof RuntimeMap)) {
                throw argumentError();
            }
            return [null, map.get(key)];
        }],
    ["append", function (_, list, value) {
            checkArgumentLength(2, arguments);
            if (!(list instanceof RuntimeList)) {
                throw argumentError();
            }
            return [null, list.append(value)];
        }],
    ["mut", function (_, value) {
            checkArgumentLength(1, arguments);
            return [null, new Mut(value)];
        }],
    ["load", function (_, mut) {
            checkArgumentLength(1, arguments);
            if (!(mut instanceof Mut)) {
                throw argumentError();
            }
            return [null, mut.value];
        }],
    ["<-", function (_, mut, value) {
            checkArgumentLength(2, arguments);
            if (!(mut instanceof Mut)) {
                throw argumentError();
            }
            mut.value = value;
            return [null, null];
        }],
    ["|>", function (ns, input, receiver) {
            checkArgumentLength(2, arguments);
            if (typeof receiver !== "function") {
                throw argumentError();
            }
            return receiver(ns, input);
        }],
    ["..", function (ns, start, end) {
            checkArgumentLength(2, arguments);
            if (typeof start !== "bigint" || typeof end !== "bigint") {
                throw argumentError();
            }
            if (start >= end) {
                throw new Error("range: start cannot be greater or equal");
            }
            return [null, RuntimeMap.fromRuntimeValues(ns, new RuntimeList(new RuntimeAtom("start"), start), new RuntimeList(new RuntimeAtom("end"), end))];
        }],
    ["unique", function (_) {
            checkArgumentLength(0, arguments);
            return [null, new Unique()];
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
        return ns.mustInsert(str, createNewBlock(new Namespace(), block));
    }, new Namespace());
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
    let ns = new Namespace();
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
function run(code) {
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
        ["*", "/", "//", "%"],
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyYXRjaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNjcmF0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLFNBQVMsUUFBUTtJQUNiLE9BQU8sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBRUQsU0FBUyxXQUFXO0lBQ25CLE1BQU0sSUFBSSxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDaEMsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLEdBQWEsRUFBRSxPQUFlO0lBQ3BELE9BQU8sSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLFFBQVEsR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUErR0QsU0FBUyxhQUFhLENBQUMsR0FBYSxFQUFFLElBQW9CO0lBQ3pELE9BQU8sRUFBQyxHQUFHLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBQyxDQUFDO0FBQ3RFLENBQUM7QUFFRCwwQkFBMEI7QUFFMUIsU0FBUyxPQUFPLENBQUMsSUFBWTtJQUM1QixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLFlBQVksQ0FBQyxJQUFZO0lBQ2pDLE9BQU8sYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsT0FBTyxDQUFDLElBQVk7SUFDNUIsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEMsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLGdCQUFnQixDQUFDLElBQVk7SUFDckMsT0FBTyxDQUFDLEdB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ZnVuY3Rpb24gaW50ZXJuYWwoKTogRXJyb3Ige1xuICAgIHJldHVybiBuZXcgRXJyb3IoXCJpbnRlcm5hbCBlcnJvclwiKTtcbn1cblxuZnVuY3Rpb24gdW5yZWFjaGFibGUoKTogbmV2ZXIge1xuXHR0aHJvdyBuZXcgRXJyb3IoXCJ1bnJlYWNoYWJsZVwiKTtcbn1cblxuZnVuY3Rpb24gcG9zaXRpb25FcnJvcihwb3M6IFBvc2l0aW9uLCBtZXNzYWdlOiBzdHJpbmcpOiBFcnJvciB7XG5cdHJldHVybiBuZXcgRXJyb3IoYCR7cG9zLnBhdGh9fCR7cG9zLmxpbmV9IGNvbCAke3Bvcy5jb2x1bW59fCAke21lc3NhZ2V9YCk7XG59XG5cbnR5cGUgUmVmID0ge1xuXHRraW5kOiBcInJlZlwiO1xuXHR2YWx1ZTogc3RyaW5nO1xufTtcblxudHlwZSBBdG9tID0ge1xuXHRraW5kOiBcImF0b21cIjtcblx0dmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgUVN5bWJvbCA9IHtcblx0a2luZDogXCJzeW1ib2xcIjtcblx0dmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgUU51bWJlciA9IHtcblx0a2luZDogXCJudW1iZXJcIjtcblx0dmFsdWU6IGJpZ2ludDtcbn07XG5cbnR5cGUgUVN0cmluZyA9IHtcblx0a2luZDogXCJzdHJpbmdcIjtcblx0dmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgT3BlbkJyYWNrZXQgPSB7XG5cdGtpbmQ6IFwiKFwiO1xufTtcblxudHlwZSBDbG9zZWRCcmFja2V0ID0ge1xuXHRraW5kOiBcIilcIjtcbn07XG5cbnR5cGUgT3BlbkN1cmx5ID0ge1xuXHRraW5kOiBcIntcIjtcbn07XG5cbnR5cGUgQ2xvc2VkQ3VybHkgPSB7XG5cdGtpbmQ6IFwifVwiO1xufTtcblxudHlwZSBPcGVuU3F1YXJlID0ge1xuXHRraW5kOiBcIltcIjtcbn07XG5cbnR5cGUgQ2xvc2VkU3F1YXJlID0ge1xuXHRraW5kOiBcIl1cIjtcbn07XG5cbnR5cGUgRW5kT2ZMaW5lID0ge1xuXHRraW5kOiBcImVvbFwiO1xufTtcblxudHlwZSBVbml0ID0ge1xuXHRraW5kOiBcInVuaXRcIjtcbn1cblxudHlwZSBDYWxsYWJsZSA9IChSZWYgfCBCbG9jayB8IENhbGwpICYgUG9zaXRpb247XG5cbnR5cGUgQ2FsbCA9IHtcblx0a2luZDogXCJjYWxsXCI7XG5cdGZpcnN0OiBDYWxsYWJsZTtcblx0YXJndW1lbnRzOiBFeHByZXNzaW9uW107XG59XG5cbnR5cGUgTGlzdCA9IHtcblx0a2luZDogXCJsaXN0XCI7XG5cdGVsZW1lbnRzOiBFeHByZXNzaW9uW107XG59XG5cbnR5cGUgQmxvY2sgPSB7XG5cdGtpbmQ6IFwiYmxvY2tcIjtcblx0ZXhwcmVzc2lvbnM6IEV4cHJlc3Npb25bXTtcbn1cblxudHlwZSBUb2tlbktpbmQgPVxuXHR8IFJlZlxuXHR8IEF0b21cblx0fCBRU3ltYm9sXG5cdHwgUU51bWJlclxuXHR8IFFTdHJpbmdcblx0fCBPcGVuQnJhY2tldFxuXHR8IENsb3NlZEJyYWNrZXRcblx0fCBPcGVuQ3VybHlcblx0fCBDbG9zZWRDdXJseVxuXHR8IE9wZW5TcXVhcmVcblx0fCBDbG9zZWRTcXVhcmVcblx0fCBFbmRPZkxpbmU7XG5cbnR5cGUgRXhwcmVzc2lvbktpbmQgPVxuXHR8IFJlZlxuXHR8IEF0b21cblx0fCBRTnVtYmVyXG5cdHwgUVN0cmluZ1xuXHR8IFVuaXRcblx0fCBDYWxsXG5cdHwgTGlzdFxuXHR8IEJsb2NrO1xuXG50eXBlIFBvc2l0aW9uID0ge1xuXHRwYXRoOiBzdHJpbmc7XG5cdGxpbmU6IG51bWJlcjtcblx0Y29sdW1uOiBudW1iZXI7XG59O1xuXG50eXBlIFRva2VuID0gVG9rZW5LaW5kICYgUG9zaXRpb247XG5cbnR5cGUgRXhwcmVzc2lvbiA9IEV4cHJlc3Npb25LaW5kICYgUG9zaXRpb247XG5cbmZ1bmN0aW9uIG5ld0V4cHJlc3Npb24ocG9zOiBQb3NpdGlvbiwgZXhwcjogRXhwcmVzc2lvbktpbmQpOiBFeHByZXNzaW9uIHtcblx0cmV0dXJuIHsuLi5leHByLCBwYXRoOiBwb3MucGF0aCwgbGluZTogcG9zLmxpbmUsIGNvbHVtbjogcG9zLmNvbHVtbn07XG59XG5cbi8vIFRPRE86IHN1cHBvcnQgbm9uIGFzY2lpXG5cbmZ1bmN0aW9uIGlzU3BhY2UoY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlxccyQvLnRlc3QoY2hhcik7XG59O1xuXG5mdW5jdGlvbiBpc0lkZW50U3RhcnQoY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlthLXpBLVpfXSQvLnRlc3QoY2hhcik7XG59O1xuXG5mdW5jdGlvbiBpc0lkZW50KGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15bMC05YS16QS1aX10kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNSZXNlcnZlZFN5bWJvbChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIFsnXCInLCBcIidcIiwgJygnLCAnKScsICd7JywgJ30nLCAnWycsICddJywgJyMnXS5pbmNsdWRlcyhjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzU3ltYm9sKGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoaXNSZXNlcnZlZFN5bWJvbChjaGFyKSB8fCAoY2hhciA9PSAnXycpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9O1xuXHRyZXR1cm4gL15bXFx1MDAyMS1cXHUwMDJGXFx1MDAzQS1cXHUwMDQwXFx1MDA1Qi1cXHUwMDYwXFx1MDA3Qi1cXHUwMDdFXSQvLnRlc3QoY2hhcik7XG59O1xuXG5mdW5jdGlvbiBpc051bWJlclN0YXJ0KGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15bMC05XSQvLnRlc3QoY2hhcik7XG59O1xuXG5mdW5jdGlvbiBpc051bWJlcihjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eWzAtOV9dJC8udGVzdChjaGFyKTtcbn07XG5cbmNsYXNzIExleGVyIGltcGxlbWVudHMgSXRlcmFibGU8VG9rZW4+IHtcblx0cGF0aDogc3RyaW5nO1xuXHRjaGFyczogSXRlcmF0b3I8c3RyaW5nPjtcblx0bGFzdENoYXI6IHtjaGFyOiBzdHJpbmcsIHVzZTogYm9vbGVhbn0gfCBudWxsID0gbnVsbDtcblx0bGluZSA9IDE7XG5cdGNvbHVtbiA9IDE7XG5cdGxhc3ROZXdsaW5lID0gZmFsc2U7XG5cblx0bGFzdFRva2VuOiB7dG9rZW46IFRva2VuLCB1c2U6IGJvb2xlYW59IHwgbnVsbCA9IG51bGw7XG5cdGZpbmlzaGVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IocGF0aDogc3RyaW5nLCBieUNoYXI6IEl0ZXJhYmxlPHN0cmluZz4pIHtcblx0XHR0aGlzLnBhdGggPSBwYXRoO1xuXHRcdHRoaXMuY2hhcnMgPSBieUNoYXJbU3ltYm9sLml0ZXJhdG9yXSgpO1xuXHR9XG5cblx0bmV4dENoYXIoKToge2NoYXI6IHN0cmluZywgbGluZTogbnVtYmVyLCBjb2x1bW46IG51bWJlcn0gfCBudWxsIHtcblx0XHRsZXQgY2hhcjogc3RyaW5nO1xuXHRcdGlmICh0aGlzLmxhc3RDaGFyICYmIHRoaXMubGFzdENoYXIudXNlKSB7XG5cdFx0XHR0aGlzLmxhc3RDaGFyLnVzZSA9IGZhbHNlO1xuXHRcdFx0Y2hhciA9IHRoaXMubGFzdENoYXIuY2hhcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHtkb25lLCB2YWx1ZX0gPSB0aGlzLmNoYXJzLm5leHQoKTtcblx0XHRcdGlmIChkb25lKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fTtcblx0XHRcdGNoYXIgPSB2YWx1ZTtcblx0XHR9O1xuXHRcdHRoaXMubGFzdENoYXIgPSB7Y2hhciwgdXNlOiBmYWxzZX07XG5cblx0XHRpZiAoY2hhciA9PSAnXFxuJykge1xuXHRcdFx0aWYgKHRoaXMubGFzdE5ld2xpbmUpIHtcblx0XHRcdFx0dGhpcy5jb2x1bW4gPSAxO1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSsrLCBjb2x1bW46IHRoaXMuY29sdW1ufTsgXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxhc3ROZXdsaW5lID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHtjaGFyLCBsaW5lOiB0aGlzLmxpbmUrKywgY29sdW1uOiB0aGlzLmNvbHVtbn07IFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMubGFzdE5ld2xpbmUpIHtcblx0XHRcdFx0dGhpcy5jb2x1bW4gPSAyO1xuXHRcdFx0XHR0aGlzLmxhc3ROZXdsaW5lID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybiB7Y2hhciwgbGluZTogdGhpcy5saW5lLCBjb2x1bW46IDF9OyBcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7Y2hhciwgbGluZTogdGhpcy5saW5lLCBjb2x1bW46IHRoaXMuY29sdW1uKyt9OyBcblx0XHRcdH07XG5cdFx0fTtcblx0fTtcblxuXHR1bnJlYWRDaGFyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5sYXN0Q2hhciB8fCB0aGlzLmxhc3RDaGFyLnVzZSkge1xuXHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHR9O1xuXHRcdHRoaXMubGFzdENoYXIudXNlID0gdHJ1ZTtcblx0XHRpZiAodGhpcy5sYXN0TmV3bGluZSkge1xuXHRcdFx0dGhpcy5saW5lLS07XG5cdFx0XHR0aGlzLmxhc3ROZXdsaW5lID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29sdW1uLS07XG5cdFx0fTtcblx0fTtcblxuXHR0YWtlV2hpbGUocHJlZGljYXRlOiAoY2hhcjogc3RyaW5nKSA9PiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRsZXQgc3RyID0gXCJcIjtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk/LmNoYXI7XG5cdFx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdFx0cmV0dXJuIHN0cjtcblx0XHRcdH1cblx0XHRcdGlmICghcHJlZGljYXRlKGNoYXIpKSB7XG5cdFx0XHRcdHRoaXMudW5yZWFkQ2hhcigpO1xuXHRcdFx0XHRyZXR1cm4gc3RyO1xuXHRcdFx0fTtcblx0XHRcdHN0ciArPSBjaGFyO1xuXHRcdH07XG5cdH07XG5cblx0ZmluaXNoaW5nRW9sKCk6IFRva2VuIHtcblx0XHR0aGlzLmZpbmlzaGVkID0gdHJ1ZTtcblx0XHRyZXR1cm4geyBwYXRoOiB0aGlzLnBhdGgsIGxpbmU6IHRoaXMubGluZSwgY29sdW1uOiB0aGlzLmNvbHVtbiwga2luZDogXCJlb2xcIiB9XG5cdH07XG5cblx0d2l0aFBvc2l0aW9uKHBvc2l0aW9uOiB7bGluZTogbnVtYmVyLCBjb2x1bW46IG51bWJlcn0sIGtpbmQ6IFRva2VuS2luZCk6IFRva2VuIHtcblx0XHRyZXR1cm4geyBwYXRoOiB0aGlzLnBhdGgsIGxpbmU6IHBvc2l0aW9uLmxpbmUsIGNvbHVtbjogcG9zaXRpb24uY29sdW1uLCAuLi5raW5kIH1cblx0fTtcblxuXHRuZXh0VG9rZW4oKTogVG9rZW4gfCBudWxsIHtcblx0XHRpZiAodGhpcy5sYXN0VG9rZW4gJiYgdGhpcy5sYXN0VG9rZW4udXNlKSB7XG5cdFx0XHR0aGlzLmxhc3RUb2tlbi51c2UgPSBmYWxzZTtcblx0XHRcdHJldHVybiB0aGlzLmxhc3RUb2tlbi50b2tlbjtcblx0XHR9XG5cdFx0bGV0IHRva2VuID0gdGhpcy5nZXROZXh0VG9rZW4oKTtcblx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5sYXN0VG9rZW4gPSB7dG9rZW4sIHVzZTogZmFsc2V9O1xuXHRcdHJldHVybiB0b2tlbjtcblx0fVxuXG5cdGdldE5leHRUb2tlbigpOiBUb2tlbiB8IG51bGwge1xuXHRcdGxldCBjaGFyID0gdGhpcy5uZXh0Q2hhcigpO1xuXHRcdGlmICghY2hhcikge1xuXHRcdFx0aWYgKCF0aGlzLmZpbmlzaGVkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmZpbmlzaGluZ0VvbCgpO1xuXHRcdFx0fTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH07XG5cblx0XHRpZiAoaXNTcGFjZShjaGFyLmNoYXIpKSB7XG5cdFx0XHRpZiAoY2hhci5jaGFyID09ICdcXG4nKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihjaGFyLCB7a2luZDogXCJlb2xcIn0pO1xuXHRcdFx0fTtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdGlmICghY2hhcikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmZpbmlzaGluZ0VvbCgpO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAoIWlzU3BhY2UoY2hhci5jaGFyKSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAoY2hhci5jaGFyID09ICdcXG4nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKGNoYXIsIHtraW5kOiBcImVvbFwifSk7O1xuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0bGV0IHN0YXJ0ID0gY2hhcjtcblx0XHRpZiAoaXNSZXNlcnZlZFN5bWJvbChjaGFyLmNoYXIpKSB7XG5cdFx0XHRzd2l0Y2ggKGNoYXIuY2hhcikge1xuXHRcdFx0Y2FzZSAnXCInOlxuXHRcdFx0XHRsZXQgc3RyID0gXCJcIjtcblx0XHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRcdFx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignc3RyaW5nIG5vdCBjbG9zZWQgd2l0aCBcIicpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAoY2hhci5jaGFyID09ICdcIicpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwic3RyaW5nXCIsIHZhbHVlOiBzdHJ9KTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGlmIChjaGFyLmNoYXIgIT0gJ1xccicpIHtcblx0XHRcdFx0XHRcdHN0ciArPSBjaGFyLmNoYXI7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgXCInXCI6XG5cdFx0XHRcdGxldCBjaGFyID0gdGhpcy5uZXh0Q2hhcigpO1xuXHRcdFx0XHRpZiAoIWNoYXIgfHwgIWlzSWRlbnRTdGFydChjaGFyLmNoYXIpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiYmFyZSAnXCIpXG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMudW5yZWFkQ2hhcigpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcImF0b21cIiwgdmFsdWU6IHRoaXMudGFrZVdoaWxlKGlzSWRlbnQpfSk7XG5cdFx0XHRjYXNlICcoJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCIoXCJ9KTtcblx0XHRcdGNhc2UgJyknOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIilcIn0pO1xuXHRcdFx0Y2FzZSAneyc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwie1wifSk7XG5cdFx0XHRjYXNlICd9Jzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJ9XCJ9KTtcblx0XHRcdGNhc2UgJ1snOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIltcIn0pO1xuXHRcdFx0Y2FzZSAnXSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiXVwifSk7XG5cdFx0XHRjYXNlICcjJzpcblx0XHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRcdFx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmZpbmlzaGluZ0VvbCgpO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXFxuJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKGNoYXIsIHtraW5kOiBcImVvbFwifSk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoaXNJZGVudFN0YXJ0KGNoYXIuY2hhcikpIHtcblx0XHRcdHRoaXMudW5yZWFkQ2hhcigpO1xuXHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJyZWZcIiwgdmFsdWU6IHRoaXMudGFrZVdoaWxlKGlzSWRlbnQpfSk7XG5cdFx0fSBlbHNlIGlmIChpc051bWJlclN0YXJ0KGNoYXIuY2hhcikpIHtcblx0XHRcdHRoaXMudW5yZWFkQ2hhcigpO1xuXHRcdFx0bGV0IG51bSA9IHRoaXMudGFrZVdoaWxlKGlzTnVtYmVyKS5yZXBsYWNlKFwiX1wiLCBcIlwiKTtcblx0XHRcdGlmICgobnVtLmxlbmd0aCA+IDEpICYmIG51bVswXSA9PSAnMCcpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGB6ZXJvIHBhZGRlZCBudW1iZXIgJHtudW19YClcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIm51bWJlclwiLCB2YWx1ZTogQmlnSW50KG51bSl9KTtcblx0XHR9IGVsc2UgaWYgKGlzU3ltYm9sKGNoYXIuY2hhcikpIHtcblx0XHRcdHRoaXMudW5yZWFkQ2hhcigpO1xuXHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJzeW1ib2xcIiwgdmFsdWU6IHRoaXMudGFrZVdoaWxlKGlzU3ltYm9sKX0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBUT0RPOiBxdW90ZSBjaGFyIHdoZW4gbmVjZXNzYXJ5XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHVua25vd24gY2hhcmFjdGVyICR7Y2hhcn1gKTtcblx0XHR9O1xuXHR9O1xuXG5cdHVucmVhZFRva2VuKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5sYXN0VG9rZW4gfHwgdGhpcy5sYXN0VG9rZW4udXNlKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH07XG5cdFx0dGhpcy5sYXN0VG9rZW4udXNlID0gdHJ1ZTtcblx0fTtcblxuXHRwZWVrVG9rZW4oKTogVG9rZW4gfCBudWxsIHtcblx0XHRsZXQgdG9rZW4gPSB0aGlzLm5leHRUb2tlbigpO1xuXHRcdHRoaXMudW5yZWFkVG9rZW4oKTtcblx0XHRyZXR1cm4gdG9rZW47XG5cdH1cblxuXHRtdXN0TmV4dFRva2VuKHRrPzogVG9rZW5LaW5kKTogVG9rZW4ge1xuXHRcdGxldCB0b2tlbiA9IHRoaXMubmV4dFRva2VuKCk7XG5cdFx0aWYgKCF0b2tlbiB8fCAodGsgJiYgdG9rZW4ua2luZCAhPT0gdGsua2luZCkpIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0b2tlbjtcblx0fVxuXG5cdFtTeW1ib2wuaXRlcmF0b3JdKCk6IEl0ZXJhdG9yPFRva2VuPiB7XG5cdFx0cmV0dXJuIG5ldyBUb2tlbkl0ZXJhdG9yKHRoaXMpO1xuXHR9O1xufTtcblxuY2xhc3MgVG9rZW5JdGVyYXRvciBpbXBsZW1lbnRzIEl0ZXJhdG9yPFRva2VuPiB7XG5cdGxleGVyOiBMZXhlcjtcblxuXHRjb25zdHJ1Y3RvcihsZXhlcjogTGV4ZXIpIHtcblx0XHR0aGlzLmxleGVyID0gbGV4ZXI7XG5cdH07XG5cblx0bmV4dCgpOiBJdGVyYXRvclJlc3VsdDxUb2tlbj4ge1xuXHRcdGxldCB0b2tlbiA9IHRoaXMubGV4ZXIubmV4dFRva2VuKCk7XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0Ly8gdGhlIHR5cGUgb2YgSXRlcmF0b3IgcmVxdWlyZXMgdGhhdCB3ZSBhbHdheXMgcmV0dXJuIGEgdmFsaWQgVG9rZW5cblx0XHRcdC8vIHNvIHdlIHJldHVybiBlb2wgaGVyZVxuXHRcdFx0cmV0dXJuIHtkb25lOiB0cnVlLCB2YWx1ZToge2tpbmQ6IFwiZW9sXCJ9fTtcblx0XHR9O1xuXHRcdHJldHVybiB7ZG9uZTogZmFsc2UsIHZhbHVlOiB0b2tlbn07XG5cdH07XG59O1xuXG5mdW5jdGlvbiBjb2xsYXBzZUV4cHJlc3Npb25zKHBvczogUG9zaXRpb24sIGV4cHJzOiBFeHByZXNzaW9uW10pOiBFeHByZXNzaW9uIHtcblx0c3dpdGNoIChleHBycy5sZW5ndGgpIHtcblx0XHRjYXNlIDA6XG5cdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihwb3MsIHtraW5kOiBcInVuaXRcIn0pO1xuXHRcdGNhc2UgMTpcblx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKHBvcywgZXhwcnNbMF0hKTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0bGV0IGZpcnN0ID0gZXhwcnNbMF0hO1xuXHRcdFx0aWYgKGZpcnN0LmtpbmQgIT09IFwicmVmXCJcblx0XHRcdFx0JiYgZmlyc3Qua2luZCAhPT0gXCJibG9ja1wiXG5cdFx0XHRcdCYmIGZpcnN0LmtpbmQgIT09IFwiY2FsbFwiXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhyb3cgcG9zaXRpb25FcnJvcihmaXJzdCwgXCJjYW4gb25seSBjYWxsIGlkZW50LCBibG9jayBvciBjYWxsXCIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24oXG5cdFx0XHRcdHBvcyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IFwiY2FsbFwiLFxuXHRcdFx0XHRcdGZpcnN0LFxuXHRcdFx0XHRcdGFyZ3VtZW50czogZXhwcnMuc2xpY2UoMSksXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdH1cbn1cblxudHlwZSBWYWx1ZU9yU3ltYm9sID0gRXhwcmVzc2lvbiB8IFFTeW1ib2wmUG9zaXRpb247XG5cbmludGVyZmFjZSBQcmVjZWRlbmNlVGFibGUgeyBba2V5OiBzdHJpbmddOiBudW1iZXI7IH07XG5cbmNsYXNzIFBhcnNlciB7XG5cdGxleGVyOiBMZXhlcjtcblx0cHJlY2VkZW5jZVRhYmxlOiBQcmVjZWRlbmNlVGFibGU7XG5cblx0Ly8gVE9ETzogY2hlY2sgZHVwbGljYXRlIHN5bWJvbHNcblx0Y29uc3RydWN0b3IobGV4ZXI6IExleGVyLCBsb3dlclRoYW5DYWxsOiBzdHJpbmdbXVtdLCBoaWdoZXJUaGFuQ2FsbDogc3RyaW5nW11bXSkge1xuXHRcdHRoaXMubGV4ZXIgPSBsZXhlcjtcblx0XHR0aGlzLnByZWNlZGVuY2VUYWJsZSA9IHt9O1xuXHRcdGxldCBpbnNlcnRQcmVjZWRlbmNlID0gKHRhYmxlOiBzdHJpbmdbXVtdLCBmYWN0b3I6IG51bWJlcikgPT4ge1xuXHRcdFx0dGFibGUuZm9yRWFjaCgobGV2ZWwsIGkpID0+IGxldmVsLmZvckVhY2goc3ltYm9sID0+IHtcblx0XHRcdFx0aWYgKCFzdHJpbmdBbGwoc3ltYm9sLCBpc1N5bWJvbCkgfHwgdGhpcy5wcmVjZWRlbmNlVGFibGUuaGFzT3duUHJvcGVydHkoc3ltYm9sKSkge1xuXHRcdFx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5wcmVjZWRlbmNlVGFibGVbc3ltYm9sXSA9IChpICsgMSkgKiBmYWN0b3I7XG5cdFx0XHR9KSk7XG5cdFx0fTtcblx0XHRpbnNlcnRQcmVjZWRlbmNlKGxvd2VyVGhhbkNhbGwsIC0xKSxcblx0XHR0aGlzLnByZWNlZGVuY2VUYWJsZVtcImNhbGxcIl0gPSAwO1xuXHRcdGluc2VydFByZWNlZGVuY2UoaGlnaGVyVGhhbkNhbGwsIDEpXG5cdH1cblxuXHRwYXJzZSgpOiBFeHByZXNzaW9uW10ge1xuXHRcdGxldCBleHByZXNzaW9ucyA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgc3RhcnQgPSB0aGlzLmxleGVyLnBlZWtUb2tlbigpO1xuXHRcdFx0aWYgKCFzdGFydCkge1xuXHRcdFx0XHRyZXR1cm4gZXhwcmVzc2lvbnM7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdmFsdWVzT3JTeW1ib2xzOiBWYWx1ZU9yU3ltYm9sW10gPSBbXTtcblx0XHRcdHdoaWxlKHRydWUpIHtcblx0XHRcdFx0bGV0IG5leHQgPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwiZW9sXCIpIHtcblx0XHRcdFx0XHRpZiAodmFsdWVzT3JTeW1ib2xzW3ZhbHVlc09yU3ltYm9scy5sZW5ndGgtMV0/LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZXNPclN5bWJvbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRleHByZXNzaW9ucy5wdXNoKHRoaXMuY29sbGFwc2Uoc3RhcnQsIHZhbHVlc09yU3ltYm9scykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNhbGxPclZhbHVlKCk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBvcGVuQnJhY2tldCA9IHRoaXMubGV4ZXIubXVzdE5leHRUb2tlbih7a2luZDogJygnfSk7XG5cdFx0bGV0IHZhbHVlc09yU3ltYm9sczogVmFsdWVPclN5bWJvbFtdID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJleHBlY3RlZCAnKScsIGdvdCBlb2ZcIik7XG5cdFx0XHR9XG5cdFx0XHRpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwiKVwiKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2gobmV4dCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNvbGxhcHNlKG9wZW5CcmFja2V0LCB2YWx1ZXNPclN5bWJvbHMpO1xuXHR9XG5cblx0Ly8gVE9ETzogYWxsb3cgc3ltYm9scyB3aXRoIGhpZ2hlciBwcmVjZWRlbmNlIHRoYW4gY2FsbCBpbiBsaXN0c1xuXHRsaXN0KCk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBvcGVuU3F1YXJlID0gdGhpcy5sZXhlci5tdXN0TmV4dFRva2VuKHtraW5kOiBcIltcIn0pO1xuXHRcdGxldCBlbGVtZW50czogRXhwcmVzc2lvbltdID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJleHBlY3RlZCAnXScsIGdvdCBlb2ZcIik7XG5cdFx0XHR9XG5cdFx0XHRpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwiXVwiKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXdFeHByZXNzaW9uKG9wZW5TcXVhcmUsIHtraW5kOiBcImxpc3RcIiwgZWxlbWVudHN9KTtcblx0fVxuXG5cdGJsb2NrKCk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBvcGVuQ3VybHkgPSB0aGlzLmxleGVyLm11c3ROZXh0VG9rZW4oe2tpbmQ6IFwie1wifSk7XG5cdFx0bGV0IGV4cHJlc3Npb25zID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBzdGFydCA9IHRoaXMubGV4ZXIucGVla1Rva2VuKCk7XG5cdFx0XHRsZXQgdmFsdWVzT3JTeW1ib2xzOiBWYWx1ZU9yU3ltYm9sW10gPSBbXTtcblx0XHRcdHdoaWxlKHRydWUpIHtcblx0XHRcdFx0bGV0IG5leHQgPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJleHBlY3RlZCAnfScsIGdvdCBlb2ZcIik7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlc09yU3ltYm9sc1t2YWx1ZXNPclN5bWJvbHMubGVuZ3RoLTFdPy5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJ9XCIpIHtcblx0XHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZXNPclN5bWJvbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRleHByZXNzaW9ucy5wdXNoKHRoaXMuY29sbGFwc2Uoc3RhcnQhLCB2YWx1ZXNPclN5bWJvbHMpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmxleGVyLm11c3ROZXh0VG9rZW4oKS5raW5kID09PSAnfScpIHtcblx0XHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24ob3BlbkN1cmx5LCB7a2luZDogXCJibG9ja1wiLCBleHByZXNzaW9uc30pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHZhbHVlKCk6IEV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJ1bmV4cGVjdGVkIGVvZlwiKTtcblx0XHR9IGVsc2UgaWYgKFsnKScsICddJywgJ30nLCBcImVvbFwiXS5pbmNsdWRlcyh0b2tlbi5raW5kKSkge1xuXHRcdFx0dGhyb3cgcG9zaXRpb25FcnJvcih0b2tlbiwgYHVuZXhwZWN0ZWQgJHt0b2tlbi5raW5kfWApXG5cdFx0fSBlbHNlIGlmIChbXCJzdHJpbmdcIiwgXCJudW1iZXJcIiwgXCJyZWZcIiwgXCJhdG9tXCJdLmluY2x1ZGVzKHRva2VuLmtpbmQpKSB7XG5cdFx0XHRyZXR1cm4gdG9rZW4gYXMgRXhwcmVzc2lvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3dpdGNoICh0b2tlbi5raW5kKSB7XG5cdFx0XHRjYXNlIFwic3ltYm9sXCI6XG5cdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IodG9rZW4sIGB1bmV4cGVjdGVkIHN5bWJvbCAke3Rva2VuLnZhbHVlfWApO1xuXHRcdFx0Y2FzZSAnKCc6XG5cdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY2FsbE9yVmFsdWUoKTtcblx0XHRcdGNhc2UgJ3snOlxuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmJsb2NrKCk7XG5cdFx0XHRjYXNlICdbJzpcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5saXN0KCk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbGxhcHNlKHN0YXJ0OiBQb3NpdGlvbiwgdmFsc09yU3ltczogVmFsdWVPclN5bWJvbFtdKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IHBhcnNlciA9IG5ldyBPcGVyYXRvclBhcnNlcihzdGFydCwgdGhpcy5wcmVjZWRlbmNlVGFibGUsIHZhbHNPclN5bXMpO1xuXHRcdHJldHVybiBwYXJzZXIucGFyc2UoKTtcblx0fVxufVxuXG5jbGFzcyBPcGVyYXRvclBhcnNlciB7XG5cdHN0YXJ0OiBQb3NpdGlvbjtcblx0cHJlY2VkZW5jZVRhYmxlOiBQcmVjZWRlbmNlVGFibGU7XG5cdHZhbHNPclN5bXM6IFZhbHVlT3JTeW1ib2xbXTtcblx0cG9zaXRpb24gPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHN0YXJ0OiBQb3NpdGlvbiwgcHJlY2VkZW5jZVRhYmxlOiBQcmVjZWRlbmNlVGFibGUsIHZhbHNPclN5bXM6IFZhbHVlT3JTeW1ib2xbXSkge1xuXHRcdGlmICh2YWxzT3JTeW1zWzBdPy5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRsZXQgc3ltID0gdmFsc09yU3ltc1swXTtcblx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3Ioc3ltLCBgdW5leHBlY3RlZCBzeW1ib2wgJHtzeW0udmFsdWV9YCk7XG5cdFx0fVxuXHRcdGxldCBsYXN0U3ltID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgdmFsT3JTeW0gb2YgdmFsc09yU3ltcykge1xuXHRcdFx0aWYgKHZhbE9yU3ltLmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0aWYgKGxhc3RTeW0pIHtcblx0XHRcdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKFxuXHRcdFx0XHRcdFx0dmFsT3JTeW0sXG5cdFx0XHRcdFx0XHRgc3ltYm9sICR7dmFsT3JTeW0udmFsdWV9IGRpcmVjdGx5IGZvbGxvd3MgYW5vdGhlciBzeW1ib2xgLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFwcmVjZWRlbmNlVGFibGUuaGFzT3duUHJvcGVydHkodmFsT3JTeW0udmFsdWUpKSB7XG5cdFx0XHRcdFx0dGhyb3cgcG9zaXRpb25FcnJvcihcblx0XHRcdFx0XHRcdHZhbE9yU3ltLFxuXHRcdFx0XHRcdFx0YHVua25vd24gb3BlcmF0b3IgJHt2YWxPclN5bS52YWx1ZX1gXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RTeW0gPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFzdFN5bSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodmFsc09yU3ltc1t2YWxzT3JTeW1zLmxlbmd0aCAtIDFdPy5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRsZXQgc3ltID0gdmFsc09yU3ltc1t2YWxzT3JTeW1zLmxlbmd0aCAtIDFdIGFzIChRU3ltYm9sJlBvc2l0aW9uKTtcblx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3Ioc3ltLCBgdW5leHBlY3RlZCBzeW1ib2wgJHtzeW0udmFsdWV9YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGFydCA9IHN0YXJ0O1xuXHRcdHRoaXMucHJlY2VkZW5jZVRhYmxlID0gcHJlY2VkZW5jZVRhYmxlO1xuXHRcdHRoaXMudmFsc09yU3ltcyA9IHZhbHNPclN5bXM7XG5cdH1cblxuXHRwcmVjZWRlbmNlKHN5bTogUVN5bWJvbCk6IG51bWJlciB7XG5cdFx0bGV0IHByZWMgPSB0aGlzLnByZWNlZGVuY2VUYWJsZVtzeW0udmFsdWVdO1xuXHRcdGlmIChwcmVjID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fVxuXHRcdHJldHVybiBwcmVjO1xuXHR9XG5cblx0bmV4dCgpOiBWYWx1ZU9yU3ltYm9sIHwgbnVsbCB7XG5cdFx0bGV0IHBvc2l0aW9uID0gdGhpcy5wb3NpdGlvbjtcblx0XHR0aGlzLnBvc2l0aW9uKys7XG5cdFx0aWYgKHBvc2l0aW9uID49IHRoaXMudmFsc09yU3ltcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy52YWxzT3JTeW1zW3Bvc2l0aW9uXSE7XG5cdFx0fVxuXHR9XG5cblx0cGVlaygpOiBWYWx1ZU9yU3ltYm9sIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMucG9zaXRpb24gPj0gdGhpcy52YWxzT3JTeW1zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLnZhbHNPclN5bXNbdGhpcy5wb3NpdGlvbl0hO1xuXHRcdH1cblx0fVxuXG5cdHNraXAobjogbnVtYmVyKTogdm9pZCB7XG5cdFx0bGV0IG5leHQgPSB0aGlzLnBvc2l0aW9uICsgbjtcblx0XHRpZiAobiA9PT0gMCB8fCBuZXh0ID4gdGhpcy52YWxzT3JTeW1zLmxlbmd0aCB8fCBuZXh0IDwgMCkge1xuXHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHR9XG5cdFx0dGhpcy5wb3NpdGlvbiA9IG5leHQ7XG5cdH1cblxuXHRwYXJzZSgpOiBFeHByZXNzaW9uIHtcblx0XHRsZXQgZXhwcnMgPSBbXTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLm5leHQoKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRyZXR1cm4gY29sbGFwc2VFeHByZXNzaW9ucyh0aGlzLnN0YXJ0LCBleHBycyk7XG5cdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5vcGVyYXRvckxvd2VyKFxuXHRcdFx0XHRcdG5leHQsXG5cdFx0XHRcdFx0Y29sbGFwc2VFeHByZXNzaW9ucyhleHByc1swXSA/PyB0aGlzLnN0YXJ0LCBleHBycyksXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgb3AgPSB0aGlzLm9wZXJhdG9yKG5leHQpO1xuXHRcdFx0XHRpZiAoIW9wKSB7XG5cdFx0XHRcdFx0ZXhwcnMucHVzaChuZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRleHBycy5wdXNoKG9wKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG9wZXJhdG9yTG93ZXIoc3ltOiBRU3ltYm9sJlBvc2l0aW9uLCBsZWZ0OiBFeHByZXNzaW9uKTogRXhwcmVzc2lvbiB7XG5cdFx0Y29uc3Qga2luZCA9IFwiY2FsbFwiO1xuXHRcdGxldCBmaXJzdCA9IG5ld0V4cHJlc3Npb24oXG5cdFx0XHRzeW0sXG5cdFx0XHR7IGtpbmQ6IFwicmVmXCIsIHZhbHVlOiBzeW0udmFsdWUgfSxcblx0XHQpIGFzIFJlZiZQb3NpdGlvbjtcblx0XHRsZXQgcmlnaHQ6IEV4cHJlc3Npb25bXSA9IFtdO1xuXHRcdGNvbnN0IGNvbGxhcHNlUmlnaHQgPSAoKTogRXhwcmVzc2lvbiA9PiB7XG5cdFx0XHRsZXQgcG9zaXRpb24gPSByaWdodFswXTtcblx0XHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjb2xsYXBzZUV4cHJlc3Npb25zKHBvc2l0aW9uLCByaWdodCk7XG5cdFx0fTtcblxuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMubmV4dCgpO1xuXHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKGxlZnQsIHtcblx0XHRcdFx0XHRraW5kLFxuXHRcdFx0XHRcdGZpcnN0LFxuXHRcdFx0XHRcdGFyZ3VtZW50czogW2xlZnQsIGNvbGxhcHNlUmlnaHQoKV0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0aWYgKHRoaXMucHJlY2VkZW5jZShuZXh0KSA8IHRoaXMucHJlY2VkZW5jZShzeW0pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24obGVmdCwge1xuXHRcdFx0XHRcdFx0a2luZCxcblx0XHRcdFx0XHRcdGZpcnN0LFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbXG5cdFx0XHRcdFx0XHRcdGxlZnQsXG5cdFx0XHRcdFx0XHRcdHRoaXMub3BlcmF0b3JMb3dlcihcblx0XHRcdFx0XHRcdFx0XHRuZXh0LFxuXHRcdFx0XHRcdFx0XHRcdGNvbGxhcHNlUmlnaHQoKSxcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5vcGVyYXRvckxvd2VyKG5leHQsXG5cdFx0XHRcdFx0XHRuZXdFeHByZXNzaW9uKGxlZnQsIHtcblx0XHRcdFx0XHRcdFx0a2luZCxcblx0XHRcdFx0XHRcdFx0Zmlyc3QsXG5cdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW2xlZnQsIGNvbGxhcHNlUmlnaHQoKV0sXG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHQpXG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBvcCA9IHRoaXMub3BlcmF0b3IobmV4dCk7XG5cdFx0XHRcdGlmICghb3ApIHtcblx0XHRcdFx0XHRyaWdodC5wdXNoKG5leHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJpZ2h0LnB1c2gob3ApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3BlcmF0b3IobGVmdDogRXhwcmVzc2lvbik6IEV4cHJlc3Npb24gfCBudWxsIHtcblx0XHRsZXQgc3ltID0gdGhpcy5uZXh0KCk7XG5cdFx0aWYgKCFzeW0gfHwgc3ltLmtpbmQgIT09IFwic3ltYm9sXCIgfHwgdGhpcy5wcmVjZWRlbmNlKHN5bSkgPCAwKSB7XG5cdFx0XHR0aGlzLnNraXAoLTEpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGxldCByaWdodCA9IHRoaXMubmV4dCgpO1xuXHRcdGlmICghcmlnaHQgfHwgcmlnaHQua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHR9XG5cdFx0Y29uc3Qga2luZCA9IFwiY2FsbFwiO1xuXHRcdGxldCBmaXJzdCA9IG5ld0V4cHJlc3Npb24oXG5cdFx0XHRzeW0sXG5cdFx0XHR7a2luZDogXCJyZWZcIiwgdmFsdWU6IHN5bS52YWx1ZX0sXG5cdFx0KSBhcyBSZWYmUG9zaXRpb247XG5cdFx0bGV0IGN1cnJlbnQ6IENhbGwgPSB7IGtpbmQsIGZpcnN0LCBhcmd1bWVudHM6IFtsZWZ0LCByaWdodF0gfTtcblx0XHRsZXQgY3VycmVudEV4cHIgPSBuZXdFeHByZXNzaW9uKGxlZnQsIGN1cnJlbnQpO1xuXG5cdFx0bGV0IG5leHRTeW0gPSB0aGlzLnBlZWsoKTtcblx0XHRpZiAoIW5leHRTeW0gfHwgbmV4dFN5bS5raW5kICE9PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRyZXR1cm4gY3VycmVudEV4cHI7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnByZWNlZGVuY2UobmV4dFN5bSkgPiB0aGlzLnByZWNlZGVuY2Uoc3ltKSkge1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLm9wZXJhdG9yKHJpZ2h0KTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRyZXR1cm4gY3VycmVudEV4cHI7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihsZWZ0LCB7a2luZCwgZmlyc3QsIGFyZ3VtZW50czogW2xlZnQsIG5leHRdfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5vcGVyYXRvcihjdXJyZW50RXhwcik7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnRFeHByO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5leHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGV4cHJlc3Npb25TdHJpbmcoZXhwcjogRXhwcmVzc2lvbik6IHN0cmluZyB7XG5cdHN3aXRjaCAoZXhwci5raW5kKSB7XG5cdGNhc2UgXCJ1bml0XCI6XG5cdFx0cmV0dXJuIFwiKClcIjtcblx0Y2FzZSBcImNhbGxcIjpcblx0XHRsZXQgZmlyc3QgPSBleHByZXNzaW9uU3RyaW5nKGV4cHIuZmlyc3QpO1xuXHRcdGlmIChleHByLmFyZ3VtZW50cy5sZW5ndGggPCAxKSB7XG5cdFx0XHRyZXR1cm4gYCgke2ZpcnN0fSAoKSlgO1xuXHRcdH1cblx0XHRsZXQgYXJncyA9IGV4cHIuYXJndW1lbnRzLm1hcChhcmcgPT4gZXhwcmVzc2lvblN0cmluZyhhcmcpKS5qb2luKFwiIFwiKTtcblx0XHRyZXR1cm4gYCgke2ZpcnN0fSAke2FyZ3N9KWA7XG5cdGNhc2UgXCJsaXN0XCI6XG5cdFx0bGV0IGVsZW1lbnRzID0gZXhwci5lbGVtZW50cy5tYXAoYXJnID0+IGV4cHJlc3Npb25TdHJpbmcoYXJnKSkuam9pbihcIiBcIik7XG5cdFx0cmV0dXJuIGBbJHtlbGVtZW50c31dYDtcblx0Y2FzZSBcImJsb2NrXCI6XG5cdFx0bGV0IGV4cHJzID0gZXhwci5leHByZXNzaW9ucy5tYXAoYXJnID0+IGV4cHJlc3Npb25TdHJpbmcoYXJnKSkuam9pbihcIlxcblwiKTtcblx0XHRpZiAoZXhwci5leHByZXNzaW9ucy5sZW5ndGggPCAyKSB7XG5cdFx0XHRyZXR1cm4gYHsgJHtleHByc30gfWA7XG5cdFx0fVxuXHRcdHJldHVybiBge1xcbiR7ZXhwcnN9XFxufWA7XG5cdGRlZmF1bHQ6XG5cdFx0cmV0dXJuIGV4cHIudmFsdWUudG9TdHJpbmcoKTtcblx0fVxufVxuXG5jbGFzcyBOYW1lc3BhY2U8VD4gaW1wbGVtZW50cyBJdGVyYWJsZTxbc3RyaW5nLCBUXT57XG5cdGVudHJ5OiBOYW1lc3BhY2VFbnRyeTxUPiB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoZW50cnk6IE5hbWVzcGFjZUVudHJ5PFQ+IHwgbnVsbCA9IG51bGwpIHtcblx0XHR0aGlzLmVudHJ5ID0gZW50cnk7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5lbnRyeSkge1xuXHRcdFx0cmV0dXJuIFwiXCI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmVudHJ5LnRvU3RyaW5nKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0KGtleTogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLm11c3RHZXQoa2V5KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0bXVzdEdldChrZXk6IHN0cmluZyk6IFQge1xuXHRcdGlmICghdGhpcy5lbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBrZXkgJHtrZXl9IG5vdCBmb3VuZGApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5lbnRyeS5tdXN0R2V0KGtleSk7XG5cdH1cblxuXHRpbnNlcnQoa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogTmFtZXNwYWNlPFQ+IHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMubXVzdEluc2VydChrZXksIHZhbHVlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0bXVzdEluc2VydChrZXk6IHN0cmluZywgdmFsdWU6IFQpOiBOYW1lc3BhY2U8VD4ge1xuXHRcdGlmICghdGhpcy5lbnRyeSkge1xuXHRcdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2UobmV3IE5hbWVzcGFjZUVudHJ5KGtleSwgdmFsdWUsIG51bGwsIG51bGwpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2UodGhpcy5lbnRyeS5tdXN0SW5zZXJ0KGtleSwgdmFsdWUpKTtcblx0fVxuXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYXRvcjxbc3RyaW5nLCBUXT4ge1xuXHRcdGlmICghdGhpcy5lbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR5aWVsZCogdGhpcy5lbnRyeTtcblx0fVxufVxuXG5jbGFzcyBOYW1lc3BhY2VFbnRyeTxUPiBpbXBsZW1lbnRzIEl0ZXJhYmxlPFtzdHJpbmcsIFRdPntcblx0a2V5OiBzdHJpbmc7XG5cdHZhbHVlOiBUO1xuXHRsZWZ0OiBOYW1lc3BhY2VFbnRyeTxUPiB8IG51bGwgPSBudWxsO1xuXHRyaWdodDogTmFtZXNwYWNlRW50cnk8VD4gfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRrZXk6IHN0cmluZyxcblx0XHR2YWx1ZTogVCxcblx0XHRsZWZ0OiBOYW1lc3BhY2VFbnRyeTxUPiB8IG51bGwsXG5cdFx0cmlnaHQ6IE5hbWVzcGFjZUVudHJ5PFQ+IHwgbnVsbFxuXHQpIHtcblx0XHR0aGlzLmtleSA9IGtleTtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy5sZWZ0ID0gbGVmdDtcblx0XHR0aGlzLnJpZ2h0ID0gcmlnaHQ7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdGxldCBzdHIgPSBcIlwiO1xuXHRcdGlmICh0aGlzLmxlZnQpIHtcblx0XHRcdHN0ciArPSB0aGlzLmxlZnQudG9TdHJpbmcoKSArIFwiLCBcIjtcblx0XHR9XG5cdFx0c3RyICs9IGAke3RoaXMua2V5fTogJHt0aGlzLnZhbHVlfWA7XG5cdFx0aWYgKHRoaXMucmlnaHQpIHtcblx0XHRcdHN0ciArPSBcIiwgXCIgKyB0aGlzLnJpZ2h0LnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdHI7XG5cdH1cblxuXHRtdXN0R2V0KGtleTogc3RyaW5nKTogVCB7XG5cdFx0bGV0IGN1cnJlbnQ6IE5hbWVzcGFjZUVudHJ5PFQ+ID0gdGhpcztcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0aWYgKGtleSA8IGN1cnJlbnQua2V5KSB7XG5cdFx0XHRcdGlmICghY3VycmVudC5sZWZ0KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBrZXkgJHtrZXl9IG5vdCBmb3VuZGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN1cnJlbnQgPSBjdXJyZW50LmxlZnQ7XG5cdFx0XHR9IGVsc2UgaWYgKGtleSA+IGN1cnJlbnQua2V5KSB7XG5cdFx0XHRcdGlmICghY3VycmVudC5yaWdodCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihga2V5ICR7a2V5fSBub3QgZm91bmRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXJyZW50ID0gY3VycmVudC5yaWdodDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBjdXJyZW50LnZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG11c3RJbnNlcnQoa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogTmFtZXNwYWNlRW50cnk8VD4ge1xuXHRcdGlmIChrZXkgPCB0aGlzLmtleSkge1xuXHRcdFx0aWYgKCF0aGlzLmxlZnQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2VFbnRyeShcblx0XHRcdFx0XHR0aGlzLmtleSxcblx0XHRcdFx0XHR0aGlzLnZhbHVlLFxuXHRcdFx0XHRcdG5ldyBOYW1lc3BhY2VFbnRyeShrZXksIHZhbHVlLCBudWxsLCBudWxsKSxcblx0XHRcdFx0XHR0aGlzLnJpZ2h0LFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2VFbnRyeShcblx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdHRoaXMudmFsdWUsXG5cdFx0XHRcdHRoaXMubGVmdC5tdXN0SW5zZXJ0KGtleSwgdmFsdWUpLFxuXHRcdFx0XHR0aGlzLnJpZ2h0LFxuXHRcdFx0KTtcblx0XHR9IGVsc2UgaWYgKGtleSA+IHRoaXMua2V5KSB7XG5cdFx0XHRpZiAoIXRoaXMucmlnaHQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2VFbnRyeShcblx0XHRcdFx0XHR0aGlzLmtleSxcblx0XHRcdFx0XHR0aGlzLnZhbHVlLFxuXHRcdFx0XHRcdHRoaXMubGVmdCxcblx0XHRcdFx0XHRuZXcgTmFtZXNwYWNlRW50cnkoa2V5LCB2YWx1ZSwgbnVsbCwgbnVsbCksXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IE5hbWVzcGFjZUVudHJ5KFxuXHRcdFx0XHR0aGlzLmtleSxcblx0XHRcdFx0dGhpcy52YWx1ZSxcblx0XHRcdFx0dGhpcy5sZWZ0LFxuXHRcdFx0XHR0aGlzLnJpZ2h0Lm11c3RJbnNlcnQoa2V5LCB2YWx1ZSksXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGR1cGxpY2F0ZSBrZXkgJHtrZXl9YClcblx0XHR9XG5cdH1cblxuXHQqW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmF0b3I8W3N0cmluZywgVF0+IHtcblx0XHRpZiAodGhpcy5sZWZ0KSB7XG5cdFx0XHR5aWVsZCogdGhpcy5sZWZ0O1xuXHRcdH1cblx0XHR5aWVsZCBbdGhpcy5rZXksIHRoaXMudmFsdWVdO1xuXHRcdGlmICh0aGlzLnJpZ2h0KSB7XG5cdFx0XHR5aWVsZCogdGhpcy5yaWdodDtcblx0XHR9XG5cdH1cbn1cblxuY29uc3Qgb3VyTmFtZXNwYWNlID0gXCJvdXJOYW1lc3BhY2VcIjtcblxuY29uc3QgdGhlaXJOYW1lc3BhY2UgPSBcInRoZWlyTmFtZXNwYWNlXCI7XG5cbmNvbnN0IG5hbWVzcGFjZUluc2VydE1hcCA9IFwibmFtZXNwYWNlSW5zZXJ0TWFwXCI7XG5cbmNvbnN0IHVucGFja0FuZE1heWJlQWRkVG9PdXJzID0gXCJ1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc1wiO1xuXG5jb25zdCB1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc0RlZmluaXRpb24gPSBgY29uc3QgJHt1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc30gPSAoW2luc2VydGFibGUsIHJldF0pID0+IHtcblx0aWYgKGluc2VydGFibGUpIHtcblx0XHQke291ck5hbWVzcGFjZX0gPSAke25hbWVzcGFjZUluc2VydE1hcH0oJHtvdXJOYW1lc3BhY2V9LCBpbnNlcnRhYmxlKTtcblx0fVxuXHRyZXR1cm4gcmV0O1xufTtgXG5cbmNvbnN0IG5ld0F0b20gPSBcIm5ld0F0b21cIjtcblxuY29uc3QgbmV3TGlzdCA9IFwibmV3TGlzdFwiO1xuXG5jb25zdCBuZXdMaXN0RnJvbUFyZ3MgPSBcIm5ld0xpc3RGcm9tQXJnc1wiO1xuXG5jb25zdCBuZXdCbG9jayA9IFwibmV3QmxvY2tcIjtcblxuZnVuY3Rpb24gc3RyaW5nTWFwKHN0cjogc3RyaW5nLCBwcmVkaWNhdGU6IChjaGFyOiBzdHJpbmcpID0+IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBvdXQgPSBcIlwiO1xuXHRmb3IgKGxldCBjaGFyIG9mIHN0cikge1xuXHRcdG91dCArPSBwcmVkaWNhdGUoY2hhcik7XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gdG9KYXZhc2NyaXB0U3RyaW5nKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGVzYyA9IHN0cmluZ01hcChzdHIsIGNoYXIgPT4ge1xuXHRcdGlmIChjaGFyID09PSBcIlxcXFxcIikge1xuXHRcdFx0cmV0dXJuIFwiXFxcXFxcXFxcIjtcblx0XHR9IGVsc2UgaWYgKGNoYXIgPT09ICdcIicpIHtcblx0XHRcdHJldHVybiAnXFxcXFwiJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGNoYXI7XG5cdFx0fVxuXHR9KTtcblx0cmV0dXJuIGBcIiR7ZXNjfVwiYDtcbn1cblxuY2xhc3MgQ29tcGlsZXIge1xuXHR2YXJOYW1lczogTmFtZXNwYWNlPHN0cmluZz47XG5cdGJvZHk6IEV4cHJlc3Npb25bXTtcblx0dGVtcG9yYXJpZXNJbmRleDogbnVtYmVyO1xuXHRjb2RlID0gXCJcIjtcblxuXHRjb25zdHJ1Y3Rvcih2YXJOYW1lczogTmFtZXNwYWNlPHN0cmluZz4sIGJvZHk6IEV4cHJlc3Npb25bXSwgdGVtcG9yYXJpZXNPZmZzZXQgPSAwKSB7XG5cdFx0dGhpcy52YXJOYW1lcyA9IHZhck5hbWVzO1xuXHRcdHRoaXMuYm9keSA9IGJvZHk7XG5cdFx0dGhpcy50ZW1wb3Jhcmllc0luZGV4ID0gdGVtcG9yYXJpZXNPZmZzZXQ7XG5cdH1cblxuXHRjb21waWxlKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuYm9keS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuY29kZSA9IFwicmV0dXJuIFtudWxsLCBudWxsXTtcIlxuXHRcdH1cblx0XHRpZiAodGhpcy5jb2RlICE9PSBcIlwiKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb2RlO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5ib2R5Lmxlbmd0aC0xOyBpKyspIHtcblx0XHRcdGxldCBleHByID0gdGhpcy5ib2R5W2ldITtcblx0XHRcdGlmIChleHByLmtpbmQgIT09IFwiY2FsbFwiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb2RlICs9IHRoaXMuZXhwcihleHByKSArIFwiO1wiO1xuXHRcdH1cblx0XHRsZXQgbGFzdCA9IHRoaXMuZXhwcih0aGlzLmJvZHlbdGhpcy5ib2R5Lmxlbmd0aC0xXSEpO1xuXHRcdHRoaXMuY29kZSArPSBgcmV0dXJuIFtudWxsLCAke2xhc3R9XTtgXG5cdFx0cmV0dXJuIHRoaXMuY29kZTtcblx0fVxuXG5cdGV4cHIoZXhwcjogRXhwcmVzc2lvbik6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChleHByLmtpbmQpIHtcblx0XHRjYXNlIFwidW5pdFwiOlxuXHRcdFx0cmV0dXJuIFwibnVsbFwiO1xuXHRcdGNhc2UgXCJudW1iZXJcIjpcblx0XHRcdHJldHVybiBgJHtleHByLnZhbHVlfW5gO1xuXHRcdGNhc2UgXCJzdHJpbmdcIjpcblx0XHRcdHJldHVybiBgJHt0b0phdmFzY3JpcHRTdHJpbmcoZXhwci52YWx1ZSl9YFxuXHRcdGNhc2UgXCJhdG9tXCI6XG5cdFx0XHRyZXR1cm4gYCgke25ld0F0b219KCR7dG9KYXZhc2NyaXB0U3RyaW5nKGV4cHIudmFsdWUpfSkpYDtcblx0XHRjYXNlIFwicmVmXCI6XG5cdFx0XHRyZXR1cm4gdGhpcy52YXJOYW1lcy5nZXQoZXhwci52YWx1ZSlcblx0XHRcdFx0Pz8gYCgke291ck5hbWVzcGFjZX0ubXVzdEdldCgke3RvSmF2YXNjcmlwdFN0cmluZyhleHByLnZhbHVlKX0pKWA7XG5cdFx0Y2FzZSBcImNhbGxcIjpcblx0XHRcdGxldCBmaXJzdCA9IHRoaXMuZXhwcihleHByLmZpcnN0KTtcblx0XHRcdGxldCBhcmdzID0gZXhwci5hcmd1bWVudHMubWFwKGFyZyA9PiB0aGlzLmV4cHIoYXJnKSkuam9pbihcIiwgXCIpO1xuXHRcdFx0cmV0dXJuIGAoJHt1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc30oJHtmaXJzdH0oJHtvdXJOYW1lc3BhY2V9LCAke2FyZ3N9KSkpYDtcblx0XHRjYXNlIFwibGlzdFwiOlxuXHRcdFx0bGV0IGVsZW1lbnRzID0gZXhwci5lbGVtZW50cy5tYXAoZSA9PiB0aGlzLmV4cHIoZSkpLmpvaW4oXCIsIFwiKTtcblx0XHRcdHJldHVybiBgKCR7bmV3TGlzdH0oJHtlbGVtZW50c30pKWA7XG5cdFx0Y2FzZSBcImJsb2NrXCI6XG5cdFx0XHRsZXQgY29udGVudCA9IG5ldyBDb21waWxlcih0aGlzLnZhck5hbWVzLCBleHByLmV4cHJlc3Npb25zKS5jb21waWxlKCk7XG5cdFx0XHRyZXR1cm4gYCgke25ld0Jsb2NrfSgke291ck5hbWVzcGFjZX0sIGZ1bmN0aW9uKCR7dGhlaXJOYW1lc3BhY2V9LCAuLi5hcmdzKSB7XFxuYFxuXHRcdFx0XHQrIFwiaWYgKGFyZ3MubGVuZ3RoICE9PSAwKSB7XFxuXCJcblx0XHRcdFx0KyBcIlxcdHRocm93IG5ldyBFcnJvcignY2Fubm90IGNhbGwgYmFzaWMgYmxvY2sgd2l0aCBhcmd1bWVudHMnKTtcXG5cIlxuXHRcdFx0XHQrIFwifVxcblwiXG5cdFx0XHRcdCsgYGxldCAke291ck5hbWVzcGFjZX0gPSB0aGlzO1xcbmBcblx0XHRcdFx0KyB1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc0RlZmluaXRpb24gKyAnXFxuXFxuJ1xuXHRcdFx0XHQrIGNvbnRlbnQgKyBcIlxcbn0pKVwiO1xuXHRcdH1cblx0fVxufVxuXG50eXBlIFZhbHVlID0gXG5cdHwgbnVsbFxuXHR8IGJvb2xlYW5cblx0fCBiaWdpbnRcblx0fCBzdHJpbmdcblx0fCBSZXR1cm5cblx0fCBNdXRcblx0fCBVbmlxdWVcblx0fCBSdW50aW1lQmxvY2tcblx0fCBSdW50aW1lQXRvbVxuXHR8IFJ1bnRpbWVMaXN0XG5cdHwgUnVudGltZU1hcDtcblxuZnVuY3Rpb24gdmFsdWVTdHJpbmcodjogVmFsdWUpOiBzdHJpbmcge1xuXHRpZiAodiA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBcIigpXCI7XG5cdH0gZWxzZSBpZiAodHlwZW9mIHYgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdHJldHVybiBcImJsb2NrXCI7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHYudG9TdHJpbmcoKTtcblx0fVxufVxuXG5mdW5jdGlvbiB2YWx1ZUVxdWFscyh2MTogVmFsdWUsIHYyOiBWYWx1ZSk6IGJvb2xlYW4ge1xuXHRpZiAodjEgPT09IG51bGxcblx0XHR8fCB0eXBlb2YgdjEgPT09IFwiYm9vbGVhblwiXG5cdFx0fHwgdHlwZW9mIHYxID09PSBcImJpZ2ludFwiXG5cdFx0fHwgdHlwZW9mIHYxID09PSBcInN0cmluZ1wiXG5cdCkge1xuXHRcdHJldHVybiB2MSA9PT0gdjI7XG5cdH0gZWxzZSBpZiAodHlwZW9mIHYxID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHYxLmVxdWFscyh2Mik7XG5cdH1cbn1cblxuY2xhc3MgUmV0dXJuIHtcblx0dmFsdWU6IFZhbHVlO1xuXG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBWYWx1ZSkge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0fVxuXG5cdGVxdWFscyhvdGhlcjogVmFsdWUpOiBib29sZWFuIHtcblx0XHRpZiAoIShvdGhlciBpbnN0YW5jZW9mIFJldHVybikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlRXF1YWxzKHRoaXMudmFsdWUsIG90aGVyLnZhbHVlKTtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAocmV0dXJuICR7dmFsdWVTdHJpbmcodGhpcy52YWx1ZSl9KWA7XG5cdH1cbn1cblxuY2xhc3MgTXV0IHtcblx0dmFsdWU6IFZhbHVlO1xuXG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBWYWx1ZSkge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0fVxuXG5cdGVxdWFscyhvdGhlcjogVmFsdWUpOiBib29sZWFuIHtcblx0XHRpZiAoIShvdGhlciBpbnN0YW5jZW9mIE11dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlRXF1YWxzKHRoaXMudmFsdWUsIG90aGVyLnZhbHVlKTtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAobXV0ICR7dmFsdWVTdHJpbmcodGhpcy52YWx1ZSl9KWA7XG5cdH1cbn1cblxuY2xhc3MgVW5pcXVlIHtcblx0ZXF1YWxzKG90aGVyOiBWYWx1ZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghKG90aGVyIGluc3RhbmNlb2YgVW5pcXVlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcyA9PT0gb3RoZXI7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBcInVuaXF1ZVwiO1xuXHR9XG59XG5cbnR5cGUgUnVudGltZUJsb2NrID0ge1xuXHRuYW1lc3BhY2U6IE5hbWVzcGFjZTxWYWx1ZT47XG5cdG9yaWdpbmFsOiBSdW50aW1lQmxvY2tGdW5jdGlvbjtcblx0KG5zOiBOYW1lc3BhY2U8VmFsdWU+LCAuLi5hcmdzOiAoVmFsdWUgfCB1bmRlZmluZWQpW10pOlxuXHRcdFJldHVyblR5cGU8UnVudGltZUJsb2NrRnVuY3Rpb24+O1xufTtcblxudHlwZSBSdW50aW1lQmxvY2tGdW5jdGlvbiA9IChuczogTmFtZXNwYWNlPFZhbHVlPiwgLi4uYXJnczogKFZhbHVlIHwgdW5kZWZpbmVkKVtdKVxuXHQ9PiBbUnVudGltZU1hcCB8IG51bGwsIFZhbHVlXTtcblxuY2xhc3MgUnVudGltZUF0b20ge1xuXHR2YWx1ZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IFZhbHVlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBSdW50aW1lQXRvbSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudmFsdWUgPT09IG90aGVyLnZhbHVlO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYChhdG9tICR7dmFsdWVTdHJpbmcodGhpcy52YWx1ZSl9KWA7XG5cdH1cbn1cblxuLy8gVE9ETzogZWZmaWNpZW50IGxpc3RcbmNsYXNzIFJ1bnRpbWVMaXN0IGltcGxlbWVudHMgSXRlcmFibGU8VmFsdWU+IHtcblx0ZWxlbWVudHM6IFZhbHVlW107XG5cblx0Y29uc3RydWN0b3IoLi4uZWxlbWVudHM6IFZhbHVlW10pIHtcblx0XHR0aGlzLmVsZW1lbnRzID0gZWxlbWVudHM7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IFZhbHVlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBSdW50aW1lTGlzdCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZWxlbWVudHMubGVuZ3RoICE9PSBvdGhlci5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5lbGVtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKCF2YWx1ZUVxdWFscyh0aGlzLmVsZW1lbnRzW2ldISwgb3RoZXIuZWxlbWVudHNbaV0hKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0bGVuKCk6IGJpZ2ludCB7XG5cdFx0cmV0dXJuIEJpZ0ludCh0aGlzLmVsZW1lbnRzLmxlbmd0aCk7XG5cdH1cblxuXHRhdChpZHg6IGJpZ2ludCk6IFZhbHVlIHtcblx0XHRpZiAoaWR4IDwgMCB8fCBpZHggPj0gdGhpcy5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgXG5cdFx0XHRcdGxpc3Qgb3V0IG9mIGJvdW5kcyAoJHtpZHh9IHdpdGggbGVuZ3RoICR7dGhpcy5lbGVtZW50cy5sZW5ndGh9KWAsXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50c1tOdW1iZXIoaWR4KV0hO1xuXHR9XG5cblx0YXBwZW5kKHZhbHVlOiBWYWx1ZSk6IFJ1bnRpbWVMaXN0IHtcblx0XHRsZXQgbmV4dCA9IHRoaXMuZWxlbWVudHMuc2xpY2UoKTtcblx0XHRuZXh0LnB1c2godmFsdWUpO1xuXHRcdHJldHVybiBuZXcgUnVudGltZUxpc3QoLi4ubmV4dCk7XG5cdH0gXG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gXCJbXCIgKyB0aGlzLmVsZW1lbnRzLm1hcChlID0+IHZhbHVlU3RyaW5nKGUpKS5qb2luKFwiIFwiKSArIFwiXVwiO1xuXHR9XG5cblx0KltTeW1ib2wuaXRlcmF0b3JdKCkge1xuXHRcdHlpZWxkKiB0aGlzLmVsZW1lbnRzO1xuXHR9XG59XG5cbi8vIFRPRE86IGVmZmljaWVudCBtYXBcbmNsYXNzIFJ1bnRpbWVNYXAgaW1wbGVtZW50cyBJdGVyYWJsZTxSdW50aW1lTGlzdD4ge1xuXHRlbGVtZW50czogeyBrZXk6IFZhbHVlLCB2YWx1ZTogVmFsdWUgfVtdO1xuXHRcblx0Y29uc3RydWN0b3IoZWxlbWVudHM6IHsga2V5OiBWYWx1ZSwgdmFsdWU6IFZhbHVlIH1bXSkge1xuXHRcdHRoaXMuZWxlbWVudHMgPSBlbGVtZW50cztcblx0fVxuXG5cdHN0YXRpYyBmcm9tUnVudGltZVZhbHVlcyhuczogTmFtZXNwYWNlPFZhbHVlPiwgLi4udmFsdWVzOiBWYWx1ZVtdKTogUnVudGltZU1hcCB7XG5cdFx0bGV0IGVsZW1lbnRzID0gW107XG5cdFx0Zm9yIChsZXQgdiBvZiB2YWx1ZXMpIHtcblx0XHRcdGxldCBrZXk7XG5cdFx0XHRsZXQgdmFsdWU7XG5cdFx0XHRpZiAodiBpbnN0YW5jZW9mIFJ1bnRpbWVBdG9tKSB7XG5cdFx0XHRcdGtleSA9IHY7XG5cdFx0XHRcdHZhbHVlID0gbnMubXVzdEdldCh2LnZhbHVlKTtcblx0XHRcdH0gZWxzZSBpZiAodiBpbnN0YW5jZW9mIFJ1bnRpbWVMaXN0ICYmIHYubGVuKCkgPT0gMm4pIHtcblx0XHRcdFx0a2V5ID0gdi5hdCgwbik7XG5cdFx0XHRcdHZhbHVlID0gdi5hdCgxbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdFx0XCJjYW4gb25seSBjcmVhdGUgbWFwIGZyb20gbGlzdCBvZiBhdG9tcyBvciBwYWlycyBvZiBrZXkgYW5kIHZhbHVlXCIsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IHsga2V5OiBleGlzdGluZ0tleSB9IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRcdGlmICh2YWx1ZUVxdWFscyhrZXksIGV4aXN0aW5nS2V5KSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgZHVwbGljYXRlIGtleSAke3ZhbHVlU3RyaW5nKGtleSl9IHdoaWxlIGNyZWF0aW5nIG1hcGApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlbGVtZW50cy5wdXNoKHsga2V5LCB2YWx1ZSB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSdW50aW1lTWFwKGVsZW1lbnRzKTtcblx0fVxuXG5cdHRyeUdldChrZXk6IFZhbHVlKTogVmFsdWUgfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXQoa2V5KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Z2V0KGtleTogVmFsdWUpOiBWYWx1ZSB7XG5cdFx0Zm9yIChsZXQgeyBrZXk6IG91cktleSwgdmFsdWUgfSBvZiB0aGlzLmVsZW1lbnRzKSB7XG5cdFx0XHRpZiAodmFsdWVFcXVhbHMoa2V5LCBvdXJLZXkpKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBtYXA6IGZhaWxlZCBnZXR0aW5nIHZhbHVlIGZvciBrZXkgJHt2YWx1ZVN0cmluZyhrZXkpfWApO1xuXHR9XG5cblx0aW5zZXJ0KGtleTogVmFsdWUsIHZhbHVlOiBWYWx1ZSk6IFJ1bnRpbWVNYXAge1xuXHRcdGZvciAobGV0IHsga2V5OiBvdXJLZXkgfSBvZiB0aGlzLmVsZW1lbnRzKSB7XG5cdFx0XHRpZiAodmFsdWVFcXVhbHMoa2V5LCBvdXJLZXkpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgbWFwIGluc2VydCBmYWlsZWQsIGR1cGxpY2F0ZSBrZXkgJHt2YWx1ZVN0cmluZyhrZXkpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRsZXQgbmV4dCA9IHRoaXMuZWxlbWVudHMuc2xpY2UoKTtcblx0XHRuZXh0LnB1c2goeyBrZXksIHZhbHVlIH0pO1xuXHRcdHJldHVybiBuZXcgUnVudGltZU1hcChuZXh0KTtcblx0fVxuXG5cdGluc2VydE1hbnkob3RoZXI6IFJ1bnRpbWVNYXApOiBSdW50aW1lTWFwIHtcblx0XHRmb3IgKGxldCB7IGtleSB9IG9mIG90aGVyLmVsZW1lbnRzKSB7XG5cdFx0XHRmb3IgKGxldCB7IGtleTogb3VyS2V5IH0gb2YgdGhpcy5lbGVtZW50cykge1xuXHRcdFx0XHRpZiAodmFsdWVFcXVhbHMoa2V5LCBvdXJLZXkpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBtYXAgaW5zZXJ0TWFueSBmYWlsZWQsIGR1cGxpY2F0ZSBrZXkgJHt2YWx1ZVN0cmluZyhrZXkpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCBuZXh0ID0gdGhpcy5lbGVtZW50cy5zbGljZSgpO1xuXHRcdGZvciAobGV0IHsga2V5LCB2YWx1ZSB9IG9mIG90aGVyLmVsZW1lbnRzKSB7XG5cdFx0XHRuZXh0LnB1c2goeyBrZXksIHZhbHVlIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFJ1bnRpbWVNYXAobmV4dCk7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IFZhbHVlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5lbGVtZW50cy5sZW5ndGggIT09IG90aGVyLmVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGxldCB7IGtleSwgdmFsdWUgfSBvZiB0aGlzLmVsZW1lbnRzKSB7XG5cdFx0XHRsZXQgZm91bmQgPSBmYWxzZTtcblx0XHRcdGZvciAobGV0IHsga2V5OiBvdGhlcktleSwgdmFsdWU6IG90aGVyVmFsdWUgfSBvZiBvdGhlci5lbGVtZW50cykge1xuXHRcdFx0XHRpZiAodmFsdWVFcXVhbHMoa2V5LCBvdGhlcktleSkpIHtcblx0XHRcdFx0XHRpZiAodmFsdWVFcXVhbHModmFsdWUsIG90aGVyVmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRmb3VuZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVha1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWZvdW5kKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdGxldCBzdHIgPSBcIm1hcFwiO1xuXHRcdGZvciAobGV0IHsga2V5LCB2YWx1ZSB9IG9mIHRoaXMuZWxlbWVudHMpIHtcblx0XHRcdHN0ciArPSBgIFsoJHt2YWx1ZVN0cmluZyhrZXkpfSkgKCR7dmFsdWVTdHJpbmcodmFsdWUpfSldYDtcblx0XHR9XG5cdFx0cmV0dXJuIHN0cjtcblx0fVxuXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpIHtcblx0XHRmb3IgKGxldCB7IGtleSwgdmFsdWUgfSBvZiB0aGlzLmVsZW1lbnRzKSB7XG5cdFx0XHR5aWVsZCBuZXcgUnVudGltZUxpc3Qoa2V5LCB2YWx1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIG1hdGNoKG1hdGNoZXI6IFZhbHVlLCB2YWx1ZTogVmFsdWUpOiBib29sZWFuIHwgUnVudGltZU1hcCB7XG5cdGlmIChtYXRjaGVyID09PSBudWxsXG5cdFx0fHwgdHlwZW9mIG1hdGNoZXIgPT09IFwiYm9vbGVhblwiXG5cdFx0fHwgdHlwZW9mIG1hdGNoZXIgPT09IFwiYmlnaW50XCJcblx0XHR8fCB0eXBlb2YgbWF0Y2hlciA9PT0gXCJzdHJpbmdcIlxuXHQpIHtcblx0XHRyZXR1cm4gbWF0Y2hlciA9PT0gdmFsdWU7XG5cdH0gZWxzZSBpZiAobWF0Y2hlciBpbnN0YW5jZW9mIFJ1bnRpbWVBdG9tKSB7XG5cdFx0cmV0dXJuIFJ1bnRpbWVNYXAuZnJvbVJ1bnRpbWVWYWx1ZXMobmV3IE5hbWVzcGFjZSgpLCBuZXcgUnVudGltZUxpc3QobWF0Y2hlciwgdmFsdWUpKTtcblx0fSBlbHNlIGlmICh0eXBlb2YgbWF0Y2hlciA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0bGV0IHJlc3VsdCA9IG1hdGNoZXIobmV3IE5hbWVzcGFjZSgpLCB2YWx1ZSlbMV07XG5cdFx0aWYgKHR5cGVvZiByZXN1bHQgPT09IFwiYm9vbGVhblwiIHx8IHJlc3VsdCBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIm1hdGNoZXIgYmxvY2sgbXVzdCByZXR1cm4gYm9vbGVhbiBvciBtYXBcIik7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKG1hdGNoZXIgaW5zdGFuY2VvZiBSdW50aW1lTGlzdCkge1xuXHRcdGlmICghKHZhbHVlIGluc3RhbmNlb2YgUnVudGltZUxpc3QpIHx8IG1hdGNoZXIubGVuKCkgIT0gdmFsdWUubGVuKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdHMgPSBSdW50aW1lTWFwLmZyb21SdW50aW1lVmFsdWVzKG5ldyBOYW1lc3BhY2UoKSk7XG5cdFx0Zm9yIChsZXQgaSA9IDBuOyBpIDwgbWF0Y2hlci5sZW4oKTsgaSsrKSB7XG5cdFx0XHRsZXQgcmVzdWx0ID0gbWF0Y2gobWF0Y2hlci5hdChpKSwgdmFsdWUuYXQoaSkpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdCBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApIHtcblx0XHRcdFx0cmVzdWx0cyA9IHJlc3VsdHMuaW5zZXJ0TWFueShyZXN1bHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fSBlbHNlIGlmIChtYXRjaGVyIGluc3RhbmNlb2YgUnVudGltZU1hcCkge1xuXHRcdGlmICghKHZhbHVlIGluc3RhbmNlb2YgUnVudGltZU1hcCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdHMgPSBSdW50aW1lTWFwLmZyb21SdW50aW1lVmFsdWVzKG5ldyBOYW1lc3BhY2UoKSk7XG5cdFx0Zm9yIChsZXQga3Ygb2YgbWF0Y2hlcikge1xuXHRcdFx0bGV0IGZvdW5kID0gdmFsdWUudHJ5R2V0KGt2LmF0KDBuKSk7XG5cdFx0XHRpZiAoZm91bmQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRsZXQgcmVzdWx0ID0gbWF0Y2goa3YuYXQoMW4pLCBmb3VuZCk7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0IGluc3RhbmNlb2YgUnVudGltZU1hcCkge1xuXHRcdFx0XHRyZXN1bHRzID0gcmVzdWx0cy5pbnNlcnRNYW55KHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHRzO1xuXHR9IGVsc2UgaWYgKG1hdGNoZXIgaW5zdGFuY2VvZiBNdXQpIHtcblx0XHRpZiAoISh2YWx1ZSBpbnN0YW5jZW9mIE11dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIG1hdGNoKG1hdGNoZXIudmFsdWUsIHZhbHVlLnZhbHVlKTtcblx0fSBlbHNlIGlmIChtYXRjaGVyIGluc3RhbmNlb2YgUmV0dXJuKSB7XG5cdFx0aWYgKCEodmFsdWUgaW5zdGFuY2VvZiBSZXR1cm4pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBtYXRjaChtYXRjaGVyLnZhbHVlLCB2YWx1ZS52YWx1ZSk7XG5cdH0gZWxzZSBpZiAobWF0Y2hlciBpbnN0YW5jZW9mIFVuaXF1ZSkge1xuXHRcdHJldHVybiBtYXRjaGVyLmVxdWFscyh2YWx1ZSk7XG5cdH0gZWxzZSB7XG5cdFx0dW5yZWFjaGFibGUoKTtcblx0fVxufVxuXG5cbmZ1bmN0aW9uIHByaW50bG4oczogc3RyaW5nKSB7XG5cdGNvbnNvbGUubG9nKHMpO1xufVxuXG5mdW5jdGlvbiBjaGVja0FyZ3VtZW50TGVuZ3RoKGV4cGVjdGVkOiBudW1iZXIsIGdvdDogeyBsZW5ndGg6IG51bWJlciB9KTogdm9pZCB7XG5cdGlmIChleHBlY3RlZCAhPT0gZ290Lmxlbmd0aC0xKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBleHBlY3RlZCAke2V4cGVjdGVkfSBhcmd1bWVudHMsIGdvdCAke2dvdC5sZW5ndGgtMX1gKTtcblx0fVxufVxuXG4vLyBUT0RPOiBiZXR0ZXIgZXJyb3IgaGFuZGxpbmdcbmZ1bmN0aW9uIGFyZ3VtZW50RXJyb3IoKTogRXJyb3Ige1xuXHRyZXR1cm4gbmV3IEVycm9yKFwiYmFkIGFyZ3VtZW50IHR5cGUocylcIik7XG59XG5cbmZ1bmN0aW9uIGRvTmFtZXNwYWNlSW5zZXJ0TWFwKG5hbWVzcGFjZTogTmFtZXNwYWNlPFZhbHVlPiwgbWFwOiBSdW50aW1lTWFwKTogTmFtZXNwYWNlPFZhbHVlPiB7XG5cdGZvciAobGV0IGF0b21BbmRWYWx1ZSBvZiBtYXApIHtcblx0XHRsZXQgYXRvbSA9IGF0b21BbmRWYWx1ZS5hdCgwbik7XG5cdFx0aWYgKCEoYXRvbSBpbnN0YW5jZW9mIFJ1bnRpbWVBdG9tKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBuYW1lc3BhY2UgaW5zZXJ0OiBleHBlY3RlZCBhdG9tLCBnb3QgJHt2YWx1ZVN0cmluZyhhdG9tKX1gKTtcblx0XHR9XG5cdFx0bmFtZXNwYWNlID0gbmFtZXNwYWNlLm11c3RJbnNlcnQoYXRvbS52YWx1ZSwgYXRvbUFuZFZhbHVlLmF0KDFuKSk7XG5cdH1cblx0cmV0dXJuIG5hbWVzcGFjZTtcbn1cblxuZnVuY3Rpb24gZGVmQmxvY2soXzogTmFtZXNwYWNlPFZhbHVlPiwgbWF0Y2hlcjogVmFsdWV8dW5kZWZpbmVkLCBibG9jazogVmFsdWV8dW5kZWZpbmVkKTogW1J1bnRpbWVNYXB8bnVsbCwgVmFsdWVdIHtcblx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRpZiAodHlwZW9mIGJsb2NrICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdH1cblx0bGV0IGZuOiBSdW50aW1lQmxvY2tGdW5jdGlvbiA9IChucywgLi4uYXJncykgPT4ge1xuXHRcdGxldCBtYXRjaGVlID0gbmV3IFJ1bnRpbWVMaXN0KC4uLmFyZ3MgYXMgVmFsdWVbXSk7XG5cdFx0bGV0IHJlc3VsdCA9IG1hdGNoKG1hdGNoZXIhLCBtYXRjaGVlKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiY2FsbCB3aXRoIHdyb25nIGFyZ3VtZW50c1wiKTtcblx0XHR9XG5cdFx0bGV0IGNhbGxOYW1lc3BhY2UgPSBibG9jay5uYW1lc3BhY2U7XG5cdFx0aWYgKHJlc3VsdCBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApIHtcblx0XHRcdGNhbGxOYW1lc3BhY2UgPSBkb05hbWVzcGFjZUluc2VydE1hcChjYWxsTmFtZXNwYWNlLCByZXN1bHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gYmxvY2sub3JpZ2luYWwuY2FsbChjYWxsTmFtZXNwYWNlLCBucyk7XG5cdH07XG5cdHJldHVybiBbbnVsbCwgY3JlYXRlTmV3QmxvY2soYmxvY2submFtZXNwYWNlLCBmbildO1xufVxuXG5jb25zdCBidWlsdGluQmxvY2tzOiBbc3RyaW5nLCBSdW50aW1lQmxvY2tGdW5jdGlvbl1bXSA9IFtcblx0W1wiY2FsbFwiLCBmdW5jdGlvbihucywgYmxvY2ssIGFyZ3MpIHtcblx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDIgfHwgYXJndW1lbnRzLmxlbmd0aCA+IDMpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBibG9jayAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAzKSB7XG5cdFx0XHRpZiAoIShhcmdzIGluc3RhbmNlb2YgUnVudGltZUxpc3QpKSB7XG5cdFx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBibG9jayhucywgLi4uYXJncy5lbGVtZW50cylcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGJsb2NrKG5zKTtcblx0XHR9XG5cdH1dLFxuXHRbXCJpbnNlcnRDYWxsXCIsIGZ1bmN0aW9uKG5zLCBibG9jaywgYXRvbXNBbmRWYWx1ZXMpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiBibG9jayAhPT0gXCJmdW5jdGlvblwiIHx8ICEoYXRvbXNBbmRWYWx1ZXMgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSkge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRsZXQgY2FsbE5hbWVzcGFjZSA9IGRvTmFtZXNwYWNlSW5zZXJ0TWFwKGJsb2NrLm5hbWVzcGFjZSwgYXRvbXNBbmRWYWx1ZXMpO1xuXHRcdHJldHVybiBibG9jay5vcmlnaW5hbC5iaW5kKGNhbGxOYW1lc3BhY2UpKG5zKTtcblx0fV0sXG5cdFtcIndpdGhBcmdzXCIsIGZ1bmN0aW9uKF8sIGFyZ3NBdG9tLCBibG9jaykge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAoIShhcmdzQXRvbSBpbnN0YW5jZW9mIFJ1bnRpbWVBdG9tICYmIHR5cGVvZiBibG9jayA9PT0gXCJmdW5jdGlvblwiKSkge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRsZXQgZm46IFJ1bnRpbWVCbG9ja0Z1bmN0aW9uID0gKG5zLCAuLi5hcmdzKSA9PiB7XG5cdFx0XHRyZXR1cm4gYmxvY2sub3JpZ2luYWwuYmluZChcblx0XHRcdFx0YmxvY2submFtZXNwYWNlLm11c3RJbnNlcnQoXG5cdFx0XHRcdFx0YXJnc0F0b20udmFsdWUsXG5cdFx0XHRcdFx0bmV3IFJ1bnRpbWVMaXN0KC4uLmFyZ3MgYXMgVmFsdWVbXSlcblx0XHRcdFx0KSxcblx0XHRcdCkobnMpO1xuXHRcdH07XG5cdFx0cmV0dXJuIFtudWxsLCBjcmVhdGVOZXdCbG9jayhuZXcgTmFtZXNwYWNlKCksIGZuKV07XG5cdH1dLFxuXHRbXCI9XCIsIGZ1bmN0aW9uKF8sIGFzc2lnbmVlLCB2YWx1ZSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRsZXQgcmVzdWx0ID0gbWF0Y2goYXNzaWduZWUhLCB2YWx1ZSEpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCI9IHBhdHRlcm4gbWF0Y2ggZmFpbGVkXCIpO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0IGluc3RhbmNlb2YgUnVudGltZU1hcCkge1xuXHRcdFx0cmV0dXJuIFtyZXN1bHQsIG51bGxdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gW251bGwsIG51bGxdO1xuXHRcdH1cblx0fV0sXG5cdFtcImRlZlwiLCBkZWZCbG9ja10sXG5cdFtcIi0+XCIsIGRlZkJsb2NrXSxcblx0W1wibWF0Y2hcIiwgZnVuY3Rpb24obnMsIHZhbHVlLCBtYXRjaGVyc0FuZEJsb2Nrcykge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAoIShtYXRjaGVyc0FuZEJsb2NrcyBpbnN0YW5jZW9mIFJ1bnRpbWVMaXN0KVxuXHRcdFx0fHwgbWF0Y2hlcnNBbmRCbG9ja3MubGVuKCkgJSAybiAhPT0gMG4pXG5cdFx0e1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMG47IGkgPCBtYXRjaGVyc0FuZEJsb2Nrcy5sZW4oKTsgaSArPSAybikge1xuXHRcdFx0bGV0IG1hdGNoZXIgPSBtYXRjaGVyc0FuZEJsb2Nrcy5hdChpKTtcblx0XHRcdGxldCBibG9jayA9IG1hdGNoZXJzQW5kQmxvY2tzLmF0KGkrMW4pO1xuXHRcdFx0aWYgKHR5cGVvZiBibG9jayAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdGxldCByZXN1bHQgPSBtYXRjaChtYXRjaGVyLCB2YWx1ZSEpO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRsZXQgY2FsbE5hbWVzcGFjZSA9IGJsb2NrLm5hbWVzcGFjZTtcblx0XHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSB7XG5cdFx0XHRcdGNhbGxOYW1lc3BhY2UgPSBkb05hbWVzcGFjZUluc2VydE1hcChjYWxsTmFtZXNwYWNlLCByZXN1bHQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJsb2NrLm9yaWdpbmFsLmNhbGwoY2FsbE5hbWVzcGFjZSwgbnMpO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJtYXRjaDogbm8gcGF0dGVybiBtYXRjaGVkXCIpO1xuXHR9XSxcblx0W1wicmV0dXJuXCIsIGZ1bmN0aW9uKF8sIHZhbHVlKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgxLCBhcmd1bWVudHMpO1xuXHRcdHRocm93IG5ldyBSZXR1cm4odmFsdWUhKTtcblx0fV0sXG5cdFtcInJldHVybnZcIiwgZnVuY3Rpb24oXywgdmFsdWUpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDEsIGFyZ3VtZW50cyk7XG5cdFx0cmV0dXJuIFtudWxsLCBuZXcgUmV0dXJuKHZhbHVlISldO1xuXHR9XSxcblx0W1wiaWZcIiwgZnVuY3Rpb24obnMsIGNvbmQsIHRydWVCbG9jaywgZmFsc2VCbG9jaykge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMywgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIHRydWVCbG9jayAhPT0gXCJmdW5jdGlvblwiIHx8IHR5cGVvZiBmYWxzZUJsb2NrICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0aWYgKGNvbmQgPT09IG51bGwgfHwgY29uZCA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBmYWxzZUJsb2NrKG5zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRydWVCbG9jayhucyk7XG5cdFx0fVxuXHR9XSxcblx0W1wib3JcIiwgZnVuY3Rpb24obnMsIGNvbmRzQW5kQmxvY2tzKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgxLCBhcmd1bWVudHMpO1xuXHRcdGlmICghKGNvbmRzQW5kQmxvY2tzIGluc3RhbmNlb2YgUnVudGltZUxpc3QpXG5cdFx0XHR8fCBjb25kc0FuZEJsb2Nrcy5sZW4oKSAlIDJuICE9PSAwbilcblx0XHR7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwbjsgaSA8IGNvbmRzQW5kQmxvY2tzLmxlbigpOyBpICs9IDJuKSB7XG5cdFx0XHRsZXQgY29uZCA9IGNvbmRzQW5kQmxvY2tzLmF0KGkpO1xuXHRcdFx0bGV0IGJsb2NrID0gY29uZHNBbmRCbG9ja3MuYXQoaSsxbik7XG5cdFx0XHRpZiAodHlwZW9mIGJsb2NrICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBjb25kID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0Y29uZCA9IGNvbmQobnMpWzFdO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbmQgPT09IG51bGwgfHwgY29uZCA9PT0gZmFsc2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYmxvY2sobnMpO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJvcjogbm8gdHJ1dGh5IGNvbmRpdGlvblwiKTtcblx0fV0sXG5cdFtcImxvb3BcIiwgZnVuY3Rpb24obnMsIGJsb2NrKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgxLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgYmxvY2sgIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHR3aGlsZSh0cnVlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRibG9jayhucylcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBSZXR1cm4pIHtcblx0XHRcdFx0XHRyZXR1cm4gW251bGwsIGUudmFsdWVdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1dLFxuXHRbXCI9PVwiLCBmdW5jdGlvbihfLCB4LCB5KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiBbbnVsbCwgdmFsdWVFcXVhbHMoeCEsIHkhKV07XG5cdH1dLFxuXHRbXCIhPVwiLCBmdW5jdGlvbihfLCB4LCB5KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiBbbnVsbCwgIXZhbHVlRXF1YWxzKHghLCB5ISldO1xuXHR9XSxcblx0W1wiPFwiLCBmdW5jdGlvbihfLCB4LCB5KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgeCAhPT0gXCJiaWdpbnRcIiB8fCB0eXBlb2YgeSAhPT0gXCJiaWdpbnRcIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gW251bGwsIHggPCB5XTtcblx0fV0sXG5cdFtcIjw9XCIsIGZ1bmN0aW9uKF8sIHgsIHkpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiB4ICE9PSBcImJpZ2ludFwiIHx8IHR5cGVvZiB5ICE9PSBcImJpZ2ludFwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBbbnVsbCwgeCA8PSB5XTtcblx0fV0sXG5cdFtcIj5cIiwgZnVuY3Rpb24oXywgeCwgeSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIHggIT09IFwiYmlnaW50XCIgfHwgdHlwZW9mIHkgIT09IFwiYmlnaW50XCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtudWxsLCB4ID4geV07XG5cdH1dLFxuXHRbXCI+PVwiLCBmdW5jdGlvbihfLCB4LCB5KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgeCAhPT0gXCJiaWdpbnRcIiB8fCB0eXBlb2YgeSAhPT0gXCJiaWdpbnRcIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gW251bGwsIHggPj0geV07XG5cdH1dLFxuXHRbXCIrXCIsIGZ1bmN0aW9uKF8sIHgsIHkpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiB4ICE9PSBcImJpZ2ludFwiIHx8IHR5cGVvZiB5ICE9PSBcImJpZ2ludFwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBbbnVsbCwgeCArIHldO1xuXHR9XSxcblx0W1wiLVwiLCBmdW5jdGlvbihfLCB4LCB5KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgeCAhPT0gXCJiaWdpbnRcIiB8fCB0eXBlb2YgeSAhPT0gXCJiaWdpbnRcIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gW251bGwsIHggLSB5XTtcblx0fV0sXG5cdFtcIipcIiwgZnVuY3Rpb24oXywgeCwgeSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIHggIT09IFwiYmlnaW50XCIgfHwgdHlwZW9mIHkgIT09IFwiYmlnaW50XCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtudWxsLCB4ICogeV07XG5cdH1dLFxuXHRbXCIvL1wiLCBmdW5jdGlvbihfLCB4LCB5KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgeCAhPT0gXCJiaWdpbnRcIiB8fCB0eXBlb2YgeSAhPT0gXCJiaWdpbnRcIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gW251bGwsIHggLyB5XTtcblx0fV0sXG5cdFtcIiVcIiwgZnVuY3Rpb24oXywgeCwgeSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIHggIT09IFwiYmlnaW50XCIgfHwgdHlwZW9mIHkgIT09IFwiYmlnaW50XCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtudWxsLCB4ICUgeV07XG5cdH1dLFxuXHRbXCJtYXBcIiwgZnVuY3Rpb24obnMsIC4uLmVsZW1lbnRzKSB7XG5cdFx0cmV0dXJuIFtudWxsLCBSdW50aW1lTWFwLmZyb21SdW50aW1lVmFsdWVzKG5zLCAuLi5lbGVtZW50cyBhcyBWYWx1ZVtdKV07XG5cdH1dLFxuXHRbXCIuXCIsIGZ1bmN0aW9uKF8sIG1hcCwga2V5KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICghKG1hcCBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBbbnVsbCwgbWFwLmdldChrZXkhKV07XG5cdH1dLFxuXHRbXCJhcHBlbmRcIiwgZnVuY3Rpb24oXywgbGlzdCwgdmFsdWUpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKCEobGlzdCBpbnN0YW5jZW9mIFJ1bnRpbWVMaXN0KSkge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gW251bGwsIGxpc3QuYXBwZW5kKHZhbHVlISldO1xuXHR9XSxcblx0W1wibXV0XCIsICBmdW5jdGlvbihfLCB2YWx1ZSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMSwgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gW251bGwsIG5ldyBNdXQodmFsdWUhKV07XG5cdH1dLFxuXHRbXCJsb2FkXCIsICBmdW5jdGlvbihfLCBtdXQpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDEsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKCEobXV0IGluc3RhbmNlb2YgTXV0KSkge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gW251bGwsIG11dC52YWx1ZV07XG5cdH1dLFxuXHRbXCI8LVwiLCBmdW5jdGlvbihfLCBtdXQsIHZhbHVlKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICghKG11dCBpbnN0YW5jZW9mIE11dCkpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0bXV0LnZhbHVlID0gdmFsdWUhO1xuXHRcdHJldHVybiBbbnVsbCwgbnVsbF07XG5cdH1dLFxuXHRbXCJ8PlwiLCBmdW5jdGlvbihucywgaW5wdXQsIHJlY2VpdmVyKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgcmVjZWl2ZXIgIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVjZWl2ZXIobnMsIGlucHV0KTtcblx0fV0sXG5cdFtcIi4uXCIsIGZ1bmN0aW9uKG5zLCBzdGFydCwgZW5kKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2Ygc3RhcnQgIT09IFwiYmlnaW50XCIgfHwgdHlwZW9mIGVuZCAhPT0gXCJiaWdpbnRcIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRpZiAoc3RhcnQgPj0gZW5kKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJyYW5nZTogc3RhcnQgY2Fubm90IGJlIGdyZWF0ZXIgb3IgZXF1YWxcIik7XG5cdFx0fVxuXHRcdHJldHVybiBbbnVsbCwgUnVudGltZU1hcC5mcm9tUnVudGltZVZhbHVlcyhcblx0XHRcdG5zLFxuXHRcdFx0bmV3IFJ1bnRpbWVMaXN0KG5ldyBSdW50aW1lQXRvbShcInN0YXJ0XCIpLCBzdGFydCksXG5cdFx0XHRuZXcgUnVudGltZUxpc3QobmV3IFJ1bnRpbWVBdG9tKFwiZW5kXCIpLCBlbmQpLFxuXHRcdCldO1xuXHR9XSxcblx0W1widW5pcXVlXCIsICBmdW5jdGlvbihfKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgwLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiBbbnVsbCwgbmV3IFVuaXF1ZSgpXTtcblx0fV0sXG5cdFtcInByaW50bG5cIiwgZnVuY3Rpb24oXywgLi4uYXJncykge1xuXHRcdHByaW50bG4oYXJncy5tYXAodiA9PiB2YWx1ZVN0cmluZyh2ISkpLmpvaW4oXCIgXCIpKTtcblx0XHRyZXR1cm4gW251bGwsIG51bGxdO1xuXHR9XSxcbl07XG5cbmNvbnN0IGJ1aWx0aW5PdGhlcjogW3N0cmluZywgVmFsdWVdW10gPSBbXG5cdFtcIm51bGxcIiwgbnVsbF0sXG5cdFtcImZhbHNlXCIsIGZhbHNlXSxcblx0W1widHJ1ZVwiLCB0cnVlXSxcbl07XG5cbmZ1bmN0aW9uIGNyZWF0ZU5ld0Jsb2NrKG5zOiBOYW1lc3BhY2U8VmFsdWU+LCBibG9jazogUnVudGltZUJsb2NrRnVuY3Rpb24pOiBSdW50aW1lQmxvY2sge1xuXHRyZXR1cm4gT2JqZWN0LmFzc2lnbihibG9jay5iaW5kKG5zKSwgeyBuYW1lc3BhY2U6IG5zLCBvcmlnaW5hbDogYmxvY2sgfSk7XG59XG5cbmNvbnN0IGJ1aWx0aW5OYW1lc3BhY2UgPSAoKCkgPT4ge1xuXHRsZXQgbnMgPSBidWlsdGluQmxvY2tzLnJlZHVjZShcblx0XHQobnMsIFtzdHIsIGJsb2NrXSkgPT4ge1xuXHRcdFx0cmV0dXJuIG5zLm11c3RJbnNlcnQoc3RyLCBjcmVhdGVOZXdCbG9jayhuZXcgTmFtZXNwYWNlKCksIGJsb2NrKSk7XG5cdFx0fSxcblx0XHRuZXcgTmFtZXNwYWNlPFZhbHVlPigpLFxuXHQpO1xuXHRyZXR1cm4gYnVpbHRpbk90aGVyLnJlZHVjZSgobnMsIFtzdHIsIHZhbHVlXSkgPT4gbnMubXVzdEluc2VydChzdHIsIHZhbHVlKSwgbnMpO1xufSkoKTtcblxuY29uc3QgaW50ZXJuYWxzOiB7IFtuYW1lOiBzdHJpbmddOiBGdW5jdGlvbiB9ID0ge1xuXHRbbmV3QXRvbV06ICh2YWx1ZTogc3RyaW5nKTogUnVudGltZUF0b20gPT4ge1xuXHRcdHJldHVybiBuZXcgUnVudGltZUF0b20odmFsdWUpO1xuXHR9LFxuXHRbbmV3TGlzdF06ICguLi5lbGVtZW50czogVmFsdWVbXSk6IFJ1bnRpbWVMaXN0ID0+IHtcblx0XHRyZXR1cm4gbmV3IFJ1bnRpbWVMaXN0KC4uLmVsZW1lbnRzKTtcblx0fSxcblx0W25ld0Jsb2NrXTogY3JlYXRlTmV3QmxvY2ssXG5cdFtuYW1lc3BhY2VJbnNlcnRNYXBdOiBkb05hbWVzcGFjZUluc2VydE1hcCxcbn07XG5cbmZ1bmN0aW9uIHN0cmluZ0FsbChzdHI6IHN0cmluZywgcHJlZGljYXRlOiAoY2hhcjogc3RyaW5nKSA9PiBib29sZWFuKTogYm9vbGVhbiB7XG5cdGZvciAobGV0IGNoYXIgb2Ygc3RyKSB7XG5cdFx0aWYgKCFwcmVkaWNhdGUoY2hhcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIG11c3RTdHJpbmdGaXJzdChzdHI6IHN0cmluZyk6IHN0cmluZyB7XG5cdGZvciAobGV0IGNoYXIgb2Ygc3RyKSB7XG5cdFx0cmV0dXJuIGNoYXI7XG5cdH1cblx0dGhyb3cgbmV3IEVycm9yKFwiZW1wdHkgc3RyaW5nXCIpO1xufVxuXG5jb25zdCBlc2NhcGVkU3ltYm9sczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9IHtcblx0XCIhXCI6IFwiRXhjbGFtYXRpb25NYXJrXCIsXG5cdFwiJFwiOiBcIkRvbGxhclwiLFxuXHRcIiVcIjogXCJQZXJjZW50XCIsXG5cdFwiJlwiOiBcIkFtcGVyc2FuZFwiLFxuXHRcIipcIjogXCJBc3Rlcmlza1wiLFxuXHRcIitcIjogXCJQbHVzXCIsXG5cdFwiLFwiOiBcIkNvbW1hXCIsXG5cdFwiLVwiOiBcIk1pbnVzXCIsXG5cdFwiLlwiOiBcIlBlcmlvZFwiLFxuXHRcIi9cIjogXCJTbGFzaFwiLFxuXHRcIjpcIjogXCJDb2xvblwiLFxuXHRcIjtcIjogXCJTZW1pY29sb25cIixcblx0XCI8XCI6IFwiTGVzc1RoYW5cIixcblx0XCI9XCI6IFwiRXF1YWxpdHlTaWduXCIsXG5cdFwiPlwiOiBcIkdyZWF0ZXJUaGFuXCIsXG5cdFwiP1wiOiBcIlF1ZXN0aW9uTWFya1wiLFxuXHRcIkBcIjogXCJBdFNpZ25cIixcblx0XCJcXFxcXCI6IFwiQmFja3NsYXNoXCIsXG5cdFwiXlwiOiBcIkNhcmV0XCIsXG5cdFwiYFwiOiBcIkFjY2VudFwiLFxuXHRcInxcIjogXCJWZXJ0aWNhbEJhclwiLFxuXHRcIn5cIjogXCJUaWxkZVwiLFxufTtcblxuZnVuY3Rpb24gdG9KYXZhc2NyaXB0VmFyTmFtZShzdHI6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmIChzdHIubGVuZ3RoID09PSAwKSB7XG5cdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0fVxuXG5cdGlmIChpc0lkZW50U3RhcnQobXVzdFN0cmluZ0ZpcnN0KHN0cikpICYmIHN0cmluZ0FsbChzdHIsIGlzSWRlbnQpKSB7XG5cdFx0Ly8gVE9ETzogY2hlY2sgc3RpbGwgdmFsaWQgd2l0aCBub24gYXNjaWkgaWRlbnRzXG5cdFx0cmV0dXJuIGBpZGVudF8ke3N0cn1gO1xuXHR9IGVsc2UgaWYgKHN0cmluZ0FsbChzdHIsIGlzU3ltYm9sKSkge1xuXHRcdGxldCBlc2NhcGVkID0gc3RyaW5nTWFwKHN0ciwgY2hhciA9PiB7XG5cdFx0XHRsZXQgZXNjID0gZXNjYXBlZFN5bWJvbHNbY2hhcl07XG5cdFx0XHRpZiAoZXNjID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGBVJHtjaGFyLmNvZGVQb2ludEF0KDApfWA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXNjO1xuXHRcdH0pXG5cdFx0cmV0dXJuIGBzeW1ib2xfJHtlc2NhcGVkfWA7XG5cdH0gZWxzZSB7XG5cdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0fVxufVxuXG5jb25zdCBidWlsdGluTmFtZXNwYWNlVmFyTmFtZXMgPSAoKCkgPT4ge1xuXHRsZXQgbnMgPSBuZXcgTmFtZXNwYWNlPHN0cmluZz4oKTtcblx0Zm9yIChsZXQgW25hbWUsIF9dIG9mIGJ1aWx0aW5OYW1lc3BhY2UpIHtcblx0XHRucyA9IG5zLm11c3RJbnNlcnQobmFtZSwgdG9KYXZhc2NyaXB0VmFyTmFtZShuYW1lKSk7XG5cdH07XG5cdHJldHVybiBucztcbn0pKCk7XG5cbmZ1bmN0aW9uIHJ1bkV4cHJlc3Npb25zKGV4cHJzOiBFeHByZXNzaW9uW10pOiB2b2lkIHtcblx0bGV0IGNvZGUgPSBcIid1c2Ugc3RyaWN0JztcXG5cXG5cIjtcblx0Y29uc3QgaW50ZXJuYWxzTmFtZSA9IFwiaW50ZXJuYWxzXCI7XG5cdGZvciAobGV0IG5hbWUgb2YgT2JqZWN0LmtleXMoaW50ZXJuYWxzKSkge1xuXHRcdGNvZGUgKz0gYGNvbnN0ICR7bmFtZX0gPSAke2ludGVybmFsc05hbWV9LiR7bmFtZX07XFxuYDtcblx0fVxuXHRjb2RlICs9IFwiXFxuXCI7XG5cblx0Zm9yIChsZXQgW25hbWUsIHZhck5hbWVdIG9mIGJ1aWx0aW5OYW1lc3BhY2VWYXJOYW1lcykge1xuXHRcdGNvZGUgKz0gYGNvbnN0ICR7dmFyTmFtZX0gPSAke291ck5hbWVzcGFjZX0ubXVzdEdldCgke3RvSmF2YXNjcmlwdFN0cmluZyhuYW1lKX0pO1xcbmA7XG5cdH1cblx0Y29kZSArPSBgXFxuJHt1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc0RlZmluaXRpb259XFxuXFxuYDtcblxuXHRjb2RlICs9IG5ldyBDb21waWxlcihidWlsdGluTmFtZXNwYWNlVmFyTmFtZXMsIGV4cHJzKS5jb21waWxlKCk7XG5cdGNvbnNvbGUubG9nKGNvZGUpO1xuXHRuZXcgRnVuY3Rpb24oaW50ZXJuYWxzTmFtZSwgb3VyTmFtZXNwYWNlLCBjb2RlKShpbnRlcm5hbHMsIGJ1aWx0aW5OYW1lc3BhY2UpO1xufVxuXG5mdW5jdGlvbiBydW4oY29kZTogc3RyaW5nKSB7XG5cdGxldCB0b2tlbnMgPSBbXTtcblx0Zm9yIChsZXQgdG9rIG9mIG5ldyBMZXhlcihcInRleHRhcmVhXCIsIGNvZGUpKSB7XG5cdFx0aWYgKHRvay5raW5kID09PSBcImF0b21cIlxuXHRcdFx0fHwgdG9rLmtpbmQgPT09IFwibnVtYmVyXCJcblx0XHRcdHx8IHRvay5raW5kID09PSBcInJlZlwiXG5cdFx0XHR8fCB0b2sua2luZCA9PT0gXCJzdHJpbmdcIlxuXHRcdFx0fHwgdG9rLmtpbmQgPT09IFwic3ltYm9sXCJcblx0XHQpIHtcblx0XHRcdHRva2Vucy5wdXNoKGAke3Rvay5raW5kfSAoJHt0b2sudmFsdWV9KWApXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRva2Vucy5wdXNoKGAke3Rvay5raW5kfWApO1xuXHRcdH1cblx0fTtcblx0Y29uc29sZS5sb2codG9rZW5zLmpvaW4oXCIsIFwiKSk7XG5cblx0bGV0IHBhcnNlciA9IG5ldyBQYXJzZXIoXG5cdFx0bmV3IExleGVyKFwidGV4dGFyZWFcIiwgY29kZSksXG5cdFx0W1xuXHRcdFx0W1wiPVwiLCBcIjwtXCJdLFxuXHRcdFx0W1wifD5cIl0sXG5cdFx0XSxcblx0XHRbXG5cdFx0XHRbXCItPlwiXSxcblx0XHRcdFtcIiYmXCIsIFwifHxcIl0sXG5cdFx0XHRbXCI9PVwiLCBcIiE9XCJdLFxuXHRcdFx0W1wiPFwiLCBcIjw9XCIsIFwiPlwiLCBcIj49XCJdLFxuXHRcdFx0W1wiLi5cIiwgXCIuLjxcIiwgXCI8Li5cIiwgXCI8Li48XCJdLFxuXHRcdFx0W1wiKytcIl0sXG5cdFx0XHRbXCIrXCIsIFwiLVwiXSxcblx0XHRcdFtcIipcIiwgXCIvXCIsIFwiLy9cIiwgXCIlXCJdLFxuXHRcdFx0W1wiQFwiXSxcblx0XHRcdFtcIi5cIl0sXG5cdFx0XSxcblx0KTtcblx0bGV0IGV4cHJzID0gcGFyc2VyLnBhcnNlKCk7XG5cdGZvciAobGV0IGV4cHIgb2YgZXhwcnMpIHtcblx0XHRjb25zb2xlLmxvZyhleHByZXNzaW9uU3RyaW5nKGV4cHIpKTtcblx0fVxuXG5cdHJ1bkV4cHJlc3Npb25zKGV4cHJzKTtcbn07Il19