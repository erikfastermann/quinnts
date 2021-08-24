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
    mustInsertMany(other) {
        let current = this;
        for (let [key, value] of other) {
            current = current.mustInsert(key, value);
        }
        return current;
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
    mustInsertMany(other) {
        let current = this;
        for (let [key, value] of other) {
            current = current.mustInsert(key, value);
        }
        return current;
    }
    *[Symbol.iterator]() { }
}
const ourNamespace = "ourNamespace";
const theirNamespace = "theirNamespace";
const unpackAndMaybeAddToOurs = "unpackAndMaybeAddToOurs";
const unpackAndMaybeAddToOursFn = `const ${unpackAndMaybeAddToOurs} = ([insertable, ret]) => {
	if (insertable) {
		${ourNamespace} = ${ourNamespace}.mustInsertMany(insertable);
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
                // TODO: check arg length === 1 for basic block
                return `(${newBlock}(${ourNamespace}, function(${theirNamespace}, ..._) {\n`
                    + `let ${ourNamespace} = this;\n`
                    + unpackAndMaybeAddToOursFn + '\n\n'
                    + content + "\n}))";
        }
    }
}
// TODO: persistent array
class RuntimeList {
    constructor(...elements) {
        this.elements = elements;
    }
    toString() {
        return "[" + this.elements.map(e => runtimeTypeString(e)).join(" ") + "]";
    }
}
function runtimeTypeString(v) {
    if (v === null) {
        return "()";
    }
    else if (typeof v === "function") {
        return "block";
    }
    else if (typeof v === "object" && 'kind' in v && v.kind === "atom") {
        return `(atom ${toJavascriptString(v.value)})`;
    }
    else {
        return v.toString();
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
const builtinBlocks = [
    ["+", function (_, x, y) {
            checkArgumentLength(2, arguments);
            if (typeof x !== "bigint" || typeof y !== "bigint") {
                throw argumentError();
            }
            return [null, x + y];
        }],
    ["println", function (_, ...args) {
            println(args.map(v => runtimeTypeString(v)).join(" "));
            return [null, null];
        }],
];
const builtinNamespace = builtinBlocks.reduce((ns, [str, block]) => {
    return ns.mustInsert(str, block);
}, new EmptyNamespace());
const internals = {
    [newAtom]: (value) => {
        return { kind: "atom", value };
    },
    [newList]: (...elements) => {
        return new RuntimeList(...elements);
    },
    [newBlock]: (ns, block) => {
        return block.bind(ns);
    },
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
    code += `\n${unpackAndMaybeAddToOursFn}\n\n`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyYXRjaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNjcmF0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLFNBQVMsUUFBUTtJQUNiLE9BQU8sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsYUFBYSxDQUFDLEdBQWEsRUFBRSxPQUFlO0lBQ3BELE9BQU8sSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLFFBQVEsR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUErR0QsU0FBUyxhQUFhLENBQUMsR0FBYSxFQUFFLElBQW9CO0lBQ3pELE9BQU8sRUFBQyxHQUFHLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBQyxDQUFDO0FBQ3RFLENBQUM7QUFFRCwwQkFBMEI7QUFFMUIsU0FBUyxPQUFPLENBQUMsSUFBWTtJQUM1QixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLFlBQVksQ0FBQyxJQUFZO0lBQ2pDLE9BQU8sYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsT0FBTyxDQUFDLElBQVk7SUFDNUIsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEMsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLGdCQUFnQixDQUFDLElBQVk7SUFDckMsT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3JFLENBQUM7QUFBQSxDQUFDO0FBRUYsU0FBUyxRQUFRLENBQUMsSUFBWTtJQUM3QixJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxFQUFFO1FBQzVDLE9BQU8sS0FBSyxDQUFDO0tBQ2I7SUFBQSxDQUFDO0lBQ0YsT0FBTywwREFBMEQsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDOUUsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLGFBQWEsQ0FBQyxJQUFZO0lBQ2xDLE9BQU8sU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUM3QixDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsUUFBUSxDQUFDLElBQVk7SUFDN0IsT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQzlCLENBQUM7QUFBQSxDQUFDO0FBRUYsTUFBTSxLQUFLO0lBV1YsWUFBWSxJQUFZLEVBQUUsTUFBd0I7UUFSbEQsYUFBUSxHQUF3QyxJQUFJLENBQUM7UUFDckQsU0FBSSxHQUFHLENBQUMsQ0FBQztRQUNULFdBQU0sR0FBRyxDQUFDLENBQUM7UUFDWCxnQkFBVyxHQUFHLEtBQUssQ0FBQztRQUVwQixjQUFTLEdBQXdDLElBQUksQ0FBQztRQUN0RCxhQUFRLEdBQUcsS0FBSyxDQUFDO1FBR2hCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxLQUFLLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO0lBQ3hDLENBQUM7SUFFRCxRQUFRO1FBQ1AsSUFBSSxJQUFZLENBQUM7UUFDakIsSUFBSSxJQUFJLENBQUMsUUFBUSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxFQUFFO1lBQ3ZDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxHQUFHLEtBQUssQ0FBQztZQUMxQixJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7U0FDMUI7YUFBTTtZQUNOLElBQUksRUFBQyxJQUFJLEVBQUUsS0FBSyxFQUFDLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN0QyxJQUFJLElBQUksRUFBRTtnQkFDVCxPQUFPLElBQUksQ0FBQzthQUNaO1lBQUEsQ0FBQztZQUNGLElBQUksR0FBRyxLQUFLLENBQUM7U0FDYjtRQUFBLENBQUM7UUFDRixJQUFJLENBQUMsUUFBUSxHQUFHLEVBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUMsQ0FBQztRQUVuQyxJQUFJLElBQUksSUFBSSxJQUFJLEVBQUU7WUFDakIsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO2dCQUNyQixJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztnQkFDaEIsT0FBTyxFQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFDLENBQUM7YUFDdEQ7aUJBQU07Z0JBQ04sSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7Z0JBQ3hCLE9BQU8sRUFBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBQyxDQUFDO2FBQ3REO1lBQUEsQ0FBQztTQUNGO2FBQU07WUFDTixJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUU7Z0JBQ3JCLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO2dCQUNoQixJQUFJLENBQUMsV0FBVyxHQUFHLEtBQUssQ0FBQztnQkFDekIsT0FBTyxFQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxFQUFDLENBQUM7YUFDMUM7aUJBQU07Z0JBQ04sT0FBTyxFQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFDLENBQUM7YUFDdEQ7WUFBQSxDQUFDO1NBQ0Y7UUFBQSxDQUFDO0lBQ0gsQ0FBQztJQUFBLENBQUM7SUFFRixVQUFVO1FBQ1QsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUU7WUFDeEMsTUFBTSxRQUFRLEVBQUUsQ0FBQztTQUNqQjtRQUFBLENBQUM7UUFDRixJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUM7UUFDekIsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ3JCLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNaLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1NBQ3pCO2FBQU07WUFDTixJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7U0FDZDtRQUFBLENBQUM7SUFDSCxDQUFDO0lBQUEsQ0FBQztJQUVGLFNBQVMsQ0FBQyxTQUFvQztRQUM3QyxJQUFJLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDYixPQUFPLElBQUksRUFBRTtZQUNaLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEVBQUUsRUFBRSxJQUFJLENBQUM7WUFDakMsSUFBSSxDQUFDLElBQUksRUFBRTtnQkFDVixPQUFPLEdBQUcsQ0FBQzthQUNYO1lBQ0QsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDckIsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO2dCQUNsQixPQUFPLEdBQUcsQ0FBQzthQUNYO1lBQUEsQ0FBQztZQUNGLEdBQUcsSUFBSSxJQUFJLENBQUM7U0FDWjtRQUFBLENBQUM7SUFDSCxDQUFDO0lBQUEsQ0FBQztJQUVGLFlBQVk7UUFDWCxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksQ0FBQztRQUNyQixPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFBO0lBQzlFLENBQUM7SUFBQSxDQUFDO0lBRUYsWUFBWSxDQUFDLFFBQXdDLEVBQUUsSUFBZTtRQUNyRSxPQUFPLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNLEVBQUUsR0FBRyxJQUFJLEVBQUUsQ0FBQTtJQUNsRixDQUFDO0lBQUEsQ0FBQztJQUVGLFNBQVM7UUFDUixJQUFJLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUU7WUFDekMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEdBQUcsS0FBSyxDQUFDO1lBQzNCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUM7U0FDNUI7UUFDRCxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDaEMsSUFBSSxDQUFDLEtBQUssRUFBRTtZQUNYLE9BQU8sSUFBSSxDQUFDO1NBQ1o7UUFDRCxJQUFJLENBQUMsU0FBUyxHQUFHLEVBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUMsQ0FBQztRQUNyQyxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxZQUFZO1FBQ1gsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDVixJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRTtnQkFDbkIsT0FBTyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7YUFDM0I7WUFBQSxDQUFDO1lBQ0YsT0FBTyxJQUFJLENBQUM7U0FDWjtRQUFBLENBQUM7UUFFRixJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDdkIsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLElBQUksRUFBRTtnQkFDdEIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxFQUFDLElBQUksRUFBRSxLQUFLLEVBQUMsQ0FBQyxDQUFDO2FBQzlDO1lBQUEsQ0FBQztZQUNGLE9BQU8sSUFBSSxFQUFFO2dCQUNaLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxJQUFJLEVBQUU7b0JBQ1YsT0FBTyxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7aUJBQzNCO2dCQUFBLENBQUM7Z0JBQ0YsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7b0JBQ3hCLE1BQU07aUJBQ047Z0JBQUEsQ0FBQztnQkFDRixJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxFQUFFO29CQUN0QixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUMsSUFBSSxFQUFFLEtBQUssRUFBQyxDQUFDLENBQUM7b0JBQUEsQ0FBQztpQkFDL0M7Z0JBQUEsQ0FBQzthQUNGO1lBQUEsQ0FBQztTQUNGO1FBQUEsQ0FBQztRQUVGLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNoQyxRQUFRLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ25CLEtBQUssR0FBRztvQkFDUCxJQUFJLEdBQUcsR0FBRyxFQUFFLENBQUM7b0JBQ2IsT0FBTyxJQUFJLEVBQUU7d0JBQ1osSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO3dCQUMzQixJQUFJLENBQUMsSUFBSSxFQUFFOzRCQUNWLE1BQU0sSUFBSSxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQTt5QkFDM0M7d0JBQUEsQ0FBQzt3QkFDRixJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksR0FBRyxFQUFFOzRCQUNyQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxFQUFFLEVBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFDLENBQUMsQ0FBQzt5QkFDOUQ7d0JBQUEsQ0FBQzt3QkFDRixJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxFQUFFOzRCQUN0QixHQUFHLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQzt5QkFDakI7d0JBQUEsQ0FBQztxQkFDRjtvQkFBQSxDQUFDO2dCQUNILEtBQUssR0FBRztvQkFDUCxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7b0JBQzNCLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO3dCQUN0QyxNQUFNLElBQUksS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFBO3FCQUN6QjtvQkFBQSxDQUFDO29CQUNGLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztvQkFDbEIsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxDQUFDLEVBQUMsQ0FBQyxDQUFDO2dCQUNqRixLQUFLLEdBQUc7b0JBQ1AsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFDLElBQUksRUFBRSxHQUFHLEVBQUMsQ0FBQyxDQUFDO2dCQUM5QyxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFDLElBQUksRUFBRSxHQUFHLEVBQUMsQ0FBQyxDQUFDO2dCQUM5QyxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFDLElBQUksRUFBRSxHQUFHLEVBQUMsQ0FBQyxDQUFDO2dCQUM5QyxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFDLElBQUksRUFBRSxHQUFHLEVBQUMsQ0FBQyxDQUFDO2dCQUM5QyxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFDLElBQUksRUFBRSxHQUFHLEVBQUMsQ0FBQyxDQUFDO2dCQUM5QyxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFDLElBQUksRUFBRSxHQUFHLEVBQUMsQ0FBQyxDQUFDO2dCQUM5QyxLQUFLLEdBQUc7b0JBQ1AsT0FBTyxJQUFJLEVBQUU7d0JBQ1osSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO3dCQUMzQixJQUFJLENBQUMsSUFBSSxFQUFFOzRCQUNWLE9BQU8sSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDO3lCQUMzQjt3QkFBQSxDQUFDO3dCQUNGLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxJQUFJLEVBQUU7NEJBQ3RCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLEVBQUUsRUFBQyxJQUFJLEVBQUUsS0FBSyxFQUFDLENBQUMsQ0FBQzt5QkFDOUM7d0JBQUEsQ0FBQztxQkFDRjtvQkFBQSxDQUFDO2dCQUNIO29CQUNDLE1BQU0sUUFBUSxFQUFFLENBQUM7YUFDakI7WUFBQSxDQUFDO1NBQ0Y7YUFBTSxJQUFJLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDbkMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsRUFBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLE9BQU8sQ0FBQyxFQUFDLENBQUMsQ0FBQztTQUMvRTthQUFNLElBQUksYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNwQyxJQUFJLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDbEIsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3BELElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxHQUFHLEVBQUU7Z0JBQ3RDLE1BQU0sSUFBSSxLQUFLLENBQUMsc0JBQXNCLEdBQUcsRUFBRSxDQUFDLENBQUE7YUFDNUM7WUFBQSxDQUFDO1lBQ0YsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxFQUFDLElBQUksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBQyxDQUFDLENBQUM7U0FDdEU7YUFBTSxJQUFJLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDL0IsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ2xCLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsRUFBQyxJQUFJLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxFQUFDLENBQUMsQ0FBQztTQUNuRjthQUFNO1lBQ04sa0NBQWtDO1lBQ2xDLE1BQU0sSUFBSSxLQUFLLENBQUMscUJBQXFCLElBQUksRUFBRSxDQUFDLENBQUM7U0FDN0M7UUFBQSxDQUFDO0lBQ0gsQ0FBQztJQUFBLENBQUM7SUFFRixXQUFXO1FBQ1YsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUU7WUFDMUMsTUFBTSxRQUFRLEVBQUUsQ0FBQztTQUNqQjtRQUFBLENBQUM7UUFDRixJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUM7SUFDM0IsQ0FBQztJQUFBLENBQUM7SUFFRixTQUFTO1FBQ1IsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQzdCLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQztRQUNuQixPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFRCxhQUFhLENBQUMsRUFBYztRQUMzQixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDN0IsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEVBQUUsSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUM3QyxNQUFNLFFBQVEsRUFBRSxDQUFDO1NBQ2pCO1FBQ0QsT0FBTyxLQUFLLENBQUM7SUFDZCxDQUFDO0lBRUQsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ2hCLE9BQU8sSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUFBLENBQUM7Q0FDRjtBQUFBLENBQUM7QUFFRixNQUFNLGFBQWE7SUFHbEIsWUFBWSxLQUFZO1FBQ3ZCLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0lBQ3BCLENBQUM7SUFBQSxDQUFDO0lBRUYsSUFBSTtRQUNILElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDLEtBQUssRUFBRTtZQUNYLG9FQUFvRTtZQUNwRSx3QkFBd0I7WUFDeEIsT0FBTyxFQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUMsSUFBSSxFQUFFLEtBQUssRUFBQyxFQUFDLENBQUM7U0FDMUM7UUFBQSxDQUFDO1FBQ0YsT0FBTyxFQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBQyxDQUFDO0lBQ3BDLENBQUM7SUFBQSxDQUFDO0NBQ0Y7QUFBQSxDQUFDO0FBRUYsU0FBUyxtQkFBbUIsQ0FBQyxHQUFhLEVBQUUsS0FBbUI7SUFDOUQsUUFBUSxLQUFLLENBQUMsTUFBTSxFQUFFO1FBQ3JCLEtBQUssQ0FBQztZQUNMLE9BQU8sYUFBYSxDQUFDLEdBQUcsRUFBRSxFQUFDLElBQUksRUFBRSxNQUFNLEVBQUMsQ0FBQyxDQUFDO1FBQzNDLEtBQUssQ0FBQztZQUNMLE9BQU8sYUFBYSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQztRQUN0QztZQUNDLElBQUksS0FBSyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUUsQ0FBQztZQUN0QixJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssS0FBSzttQkFDcEIsS0FBSyxDQUFDLElBQUksS0FBSyxPQUFPO21CQUN0QixLQUFLLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFDdkI7Z0JBQ0QsTUFBTSxhQUFhLENBQUMsS0FBSyxFQUFFLG9DQUFvQyxDQUFDLENBQUM7YUFDakU7WUFDRCxPQUFPLGFBQWEsQ0FDbkIsR0FBRyxFQUNIO2dCQUNDLElBQUksRUFBRSxNQUFNO2dCQUNaLEtBQUs7Z0JBQ0wsU0FBUyxFQUFFLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2FBQ3pCLENBQ0QsQ0FBQztLQUNIO0FBQ0YsQ0FBQztBQUltRCxDQUFDO0FBRXJELE1BQU0sTUFBTTtJQUlYLGdDQUFnQztJQUNoQyxZQUFZLEtBQVksRUFBRSxhQUF5QixFQUFFLGNBQTBCO1FBQzlFLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxlQUFlLEdBQUcsRUFBRSxDQUFDO1FBQzFCLElBQUksZ0JBQWdCLEdBQUcsQ0FBQyxLQUFpQixFQUFFLE1BQWMsRUFBRSxFQUFFO1lBQzVELEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFO2dCQUNsRCxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRTtvQkFDaEYsTUFBTSxRQUFRLEVBQUUsQ0FBQztpQkFDakI7Z0JBQ0QsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUM7WUFDakQsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQztRQUNGLGdCQUFnQixDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNuQyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqQyxnQkFBZ0IsQ0FBQyxjQUFjLEVBQUUsQ0FBQyxDQUFDLENBQUE7SUFDcEMsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLFdBQVcsR0FBRyxFQUFFLENBQUM7UUFDckIsT0FBTyxJQUFJLEVBQUU7WUFDWixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ25DLElBQUksQ0FBQyxLQUFLLEVBQUU7Z0JBQ1gsT0FBTyxXQUFXLENBQUM7YUFDbkI7WUFDRCxJQUFJLGVBQWUsR0FBb0IsRUFBRSxDQUFDO1lBQzFDLE9BQU0sSUFBSSxFQUFFO2dCQUNYLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUM7Z0JBQ2xDLElBQUksQ0FBQyxJQUFJLEVBQUU7b0JBQ1YsTUFBTTtpQkFDTjtxQkFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssS0FBSyxFQUFFO29CQUMvQixJQUFJLGVBQWUsQ0FBQyxlQUFlLENBQUMsTUFBTSxHQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxRQUFRLEVBQUU7d0JBQ2pFLFNBQVM7cUJBQ1Q7eUJBQU07d0JBQ04sTUFBTTtxQkFDTjtpQkFDRDtxQkFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFO29CQUNsQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2lCQUMzQjtxQkFBTTtvQkFDTixJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUN6QixlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO2lCQUNuQzthQUNEO1lBQ0QsSUFBSSxlQUFlLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtnQkFDL0IsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDO2FBQ3hEO1NBQ0Q7SUFDRixDQUFDO0lBRUQsV0FBVztRQUNWLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLEVBQUMsSUFBSSxFQUFFLEdBQUcsRUFBQyxDQUFDLENBQUM7UUFDeEQsSUFBSSxlQUFlLEdBQW9CLEVBQUUsQ0FBQztRQUMxQyxPQUFPLElBQUksRUFBRTtZQUNaLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDbEMsSUFBSSxDQUFDLElBQUksRUFBRTtnQkFDVixNQUFNLElBQUksS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7YUFDekM7WUFDRCxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssS0FBSyxFQUFFO2dCQUN4QixTQUFTO2FBQ1Q7aUJBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLEdBQUcsRUFBRTtnQkFDN0IsTUFBTTthQUNOO2lCQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUU7Z0JBQ2xDLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDM0I7aUJBQU07Z0JBQ04sSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDekIsZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQzthQUNuQztTQUNEO1FBQ0QsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUNwRCxDQUFDO0lBRUQsZ0VBQWdFO0lBQ2hFLElBQUk7UUFDSCxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxFQUFDLElBQUksRUFBRSxHQUFHLEVBQUMsQ0FBQyxDQUFDO1FBQ3ZELElBQUksUUFBUSxHQUFpQixFQUFFLENBQUM7UUFDaEMsT0FBTyxJQUFJLEVBQUU7WUFDWixJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO1lBQ2xDLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ1YsTUFBTSxJQUFJLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO2FBQ3pDO1lBQ0QsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLEtBQUssRUFBRTtnQkFDeEIsU0FBUzthQUNUO2lCQUFNLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxHQUFHLEVBQUU7Z0JBQzdCLE1BQU07YUFDTjtpQkFBTTtnQkFDTixJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUN6QixRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO2FBQzVCO1NBQ0Q7UUFDRCxPQUFPLGFBQWEsQ0FBQyxVQUFVLEVBQUUsRUFBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLFFBQVEsRUFBQyxDQUFDLENBQUM7SUFDNUQsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxFQUFDLElBQUksRUFBRSxHQUFHLEVBQUMsQ0FBQyxDQUFDO1FBQ3RELElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQztRQUNyQixPQUFPLElBQUksRUFBRTtZQUNaLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDbkMsSUFBSSxlQUFlLEdBQW9CLEVBQUUsQ0FBQztZQUMxQyxPQUFNLElBQUksRUFBRTtnQkFDWCxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO2dCQUNsQyxJQUFJLENBQUMsSUFBSSxFQUFFO29CQUNWLE1BQU0sSUFBSSxLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQztpQkFDekM7cUJBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLEtBQUssRUFBRTtvQkFDL0IsSUFBSSxlQUFlLENBQUMsZUFBZSxDQUFDLE1BQU0sR0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLEtBQUssUUFBUSxFQUFFO3dCQUNqRSxTQUFTO3FCQUNUO3lCQUFNO3dCQUNOLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7d0JBQ3pCLE1BQU07cUJBQ047aUJBQ0Q7cUJBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLEdBQUcsRUFBRTtvQkFDN0IsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDekIsTUFBTTtpQkFDTjtxQkFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFO29CQUNsQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2lCQUMzQjtxQkFBTTtvQkFDTixJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUN6QixlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO2lCQUNuQzthQUNEO1lBQ0QsSUFBSSxlQUFlLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtnQkFDL0IsV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQU0sRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDO2FBQ3pEO1lBQ0QsSUFBSSxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsRUFBRSxDQUFDLElBQUksS0FBSyxHQUFHLEVBQUU7Z0JBQzVDLE9BQU8sYUFBYSxDQUFDLFNBQVMsRUFBRSxFQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFDLENBQUMsQ0FBQzthQUM5RDtTQUNEO0lBQ0YsQ0FBQztJQUVELEtBQUs7UUFDSixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ3JDLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDWCxNQUFNLElBQUksS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7U0FDbEM7YUFBTSxJQUFJLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUN2RCxNQUFNLGFBQWEsQ0FBQyxLQUFLLEVBQUUsY0FBYyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQTtTQUN0RDthQUFNLElBQUksQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ3BFLE9BQU8sS0FBbUIsQ0FBQztTQUMzQjthQUFNO1lBQ04sUUFBUSxLQUFLLENBQUMsSUFBSSxFQUFFO2dCQUNwQixLQUFLLFFBQVE7b0JBQ1osTUFBTSxhQUFhLENBQUMsS0FBSyxFQUFFLHFCQUFxQixLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztnQkFDaEUsS0FBSyxHQUFHO29CQUNQLElBQUksQ0FBQyxLQUFLLENBQUMsV0FBVyxFQUFFLENBQUM7b0JBQ3pCLE9BQU8sSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUMzQixLQUFLLEdBQUc7b0JBQ1AsSUFBSSxDQUFDLEtBQUssQ0FBQyxXQUFXLEVBQUUsQ0FBQztvQkFDekIsT0FBTyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ3JCLEtBQUssR0FBRztvQkFDUCxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDO29CQUN6QixPQUFPLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztnQkFDcEI7b0JBQ0MsTUFBTSxRQUFRLEVBQUUsQ0FBQzthQUNqQjtTQUNEO0lBQ0YsQ0FBQztJQUVELFFBQVEsQ0FBQyxLQUFlLEVBQUUsVUFBMkI7UUFDcEQsSUFBSSxNQUFNLEdBQUcsSUFBSSxjQUFjLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFDekUsT0FBTyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDdkIsQ0FBQztDQUNEO0FBRUQsTUFBTSxjQUFjO0lBTW5CLFlBQVksS0FBZSxFQUFFLGVBQWdDLEVBQUUsVUFBMkI7UUFGMUYsYUFBUSxHQUFHLENBQUMsQ0FBQztRQUdaLElBQUksVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxRQUFRLEVBQUU7WUFDckMsSUFBSSxHQUFHLEdBQUcsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3hCLE1BQU0sYUFBYSxDQUFDLEdBQUcsRUFBRSxxQkFBcUIsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7U0FDM0Q7UUFDRCxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUM7UUFDcEIsS0FBSyxJQUFJLFFBQVEsSUFBSSxVQUFVLEVBQUU7WUFDaEMsSUFBSSxRQUFRLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRTtnQkFDL0IsSUFBSSxPQUFPLEVBQUU7b0JBQ1osTUFBTSxhQUFhLENBQ2xCLFFBQVEsRUFDUixVQUFVLFFBQVEsQ0FBQyxLQUFLLGtDQUFrQyxDQUMxRCxDQUFDO2lCQUNGO2dCQUNELElBQUksQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRTtvQkFDcEQsTUFBTSxhQUFhLENBQ2xCLFFBQVEsRUFDUixvQkFBb0IsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUNwQyxDQUFBO2lCQUNEO2dCQUNELE9BQU8sR0FBRyxJQUFJLENBQUM7YUFDZjtpQkFBTTtnQkFDTixPQUFPLEdBQUcsS0FBSyxDQUFDO2FBQ2hCO1NBQ0Q7UUFDRCxJQUFJLFVBQVUsQ0FBQyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxRQUFRLEVBQUU7WUFDekQsSUFBSSxHQUFHLEdBQUcsVUFBVSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUF1QixDQUFDO1lBQ2xFLE1BQU0sYUFBYSxDQUFDLEdBQUcsRUFBRSxxQkFBcUIsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUM7U0FDM0Q7UUFFRCxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLENBQUMsZUFBZSxHQUFHLGVBQWUsQ0FBQztRQUN2QyxJQUFJLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztJQUM5QixDQUFDO0lBRUQsVUFBVSxDQUFDLEdBQVk7UUFDdEIsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDM0MsSUFBSSxJQUFJLEtBQUssU0FBUyxFQUFFO1lBQ3ZCLE1BQU0sUUFBUSxFQUFFLENBQUM7U0FDakI7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNiLENBQUM7SUFFRCxJQUFJO1FBQ0gsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztRQUM3QixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDaEIsSUFBSSxRQUFRLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUU7WUFDdkMsT0FBTyxJQUFJLENBQUM7U0FDWjthQUFNO1lBQ04sT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBRSxDQUFDO1NBQ2xDO0lBQ0YsQ0FBQztJQUVELElBQUk7UUFDSCxJQUFJLElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUU7WUFDNUMsT0FBTyxJQUFJLENBQUM7U0FDWjthQUFNO1lBQ04sT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUUsQ0FBQztTQUN2QztJQUNGLENBQUM7SUFFRCxJQUFJLENBQUMsQ0FBUztRQUNiLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDO1FBQzdCLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsRUFBRTtZQUN6RCxNQUFNLFFBQVEsRUFBRSxDQUFDO1NBQ2pCO1FBQ0QsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUM7SUFDdEIsQ0FBQztJQUVELEtBQUs7UUFDSixJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDZixPQUFPLElBQUksRUFBRTtZQUNaLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsSUFBSSxFQUFFO2dCQUNWLE9BQU8sbUJBQW1CLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQzthQUM5QztpQkFBTSxJQUFJLElBQUksQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFO2dCQUNsQyxPQUFPLElBQUksQ0FBQyxhQUFhLENBQ3hCLElBQUksRUFDSixtQkFBbUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FDbEQsQ0FBQzthQUNGO2lCQUFNO2dCQUNOLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzdCLElBQUksQ0FBQyxFQUFFLEVBQUU7b0JBQ1IsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztpQkFDakI7cUJBQU07b0JBQ04sS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztpQkFDZjthQUNEO1NBQ0Q7SUFDRixDQUFDO0lBRUQsYUFBYSxDQUFDLEdBQXFCLEVBQUUsSUFBZ0I7UUFDcEQsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDO1FBQ3BCLElBQUksS0FBSyxHQUFHLGFBQWEsQ0FDeEIsR0FBRyxFQUNILEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLEtBQUssRUFBRSxDQUNqQixDQUFDO1FBQ2xCLElBQUksS0FBSyxHQUFpQixFQUFFLENBQUM7UUFDN0IsTUFBTSxhQUFhLEdBQUcsR0FBZSxFQUFFO1lBQ3RDLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN4QixJQUFJLENBQUMsUUFBUSxFQUFFO2dCQUNkLE1BQU0sUUFBUSxFQUFFLENBQUM7YUFDakI7WUFDRCxPQUFPLG1CQUFtQixDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3QyxDQUFDLENBQUM7UUFFRixPQUFPLElBQUksRUFBRTtZQUNaLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUMsSUFBSSxFQUFFO2dCQUNWLE9BQU8sYUFBYSxDQUFDLElBQUksRUFBRTtvQkFDMUIsSUFBSTtvQkFDSixLQUFLO29CQUNMLFNBQVMsRUFBRSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUUsQ0FBQztpQkFDbEMsQ0FBQyxDQUFDO2FBQ0g7aUJBQU0sSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRTtnQkFDbEMsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUU7b0JBQ2pELE9BQU8sYUFBYSxDQUFDLElBQUksRUFBRTt3QkFDMUIsSUFBSTt3QkFDSixLQUFLO3dCQUNMLFNBQVMsRUFBRTs0QkFDVixJQUFJOzRCQUNKLElBQUksQ0FBQyxhQUFhLENBQ2pCLElBQUksRUFDSixhQUFhLEVBQUUsQ0FDZjt5QkFDRDtxQkFDRCxDQUFDLENBQUE7aUJBQ0Y7cUJBQU07b0JBQ04sT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDLElBQUksRUFDN0IsYUFBYSxDQUFDLElBQUksRUFBRTt3QkFDbkIsSUFBSTt3QkFDSixLQUFLO3dCQUNMLFNBQVMsRUFBRSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUUsQ0FBQztxQkFDbEMsQ0FBQyxDQUNGLENBQUE7aUJBQ0Q7YUFDRDtpQkFBTTtnQkFDTixJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUM3QixJQUFJLENBQUMsRUFBRSxFQUFFO29CQUNSLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7aUJBQ2pCO3FCQUFNO29CQUNOLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7aUJBQ2Y7YUFDRDtTQUNEO0lBQ0YsQ0FBQztJQUVELFFBQVEsQ0FBQyxJQUFnQjtRQUN4QixJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDdEIsSUFBSSxDQUFDLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxLQUFLLFFBQVEsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRTtZQUM5RCxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDZCxPQUFPLElBQUksQ0FBQztTQUNaO1FBQ0QsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLEVBQUU7WUFDdEMsTUFBTSxRQUFRLEVBQUUsQ0FBQztTQUNqQjtRQUNELE1BQU0sSUFBSSxHQUFHLE1BQU0sQ0FBQztRQUNwQixJQUFJLEtBQUssR0FBRyxhQUFhLENBQ3hCLEdBQUcsRUFDSCxFQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxLQUFLLEVBQUMsQ0FDZixDQUFDO1FBQ2xCLElBQUksT0FBTyxHQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUUsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUM5RCxJQUFJLFdBQVcsR0FBRyxhQUFhLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRS9DLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMxQixJQUFJLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUFFO1lBQzFDLE9BQU8sV0FBVyxDQUFDO1NBQ25CO1FBQ0QsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLEVBQUU7WUFDcEQsSUFBSSxJQUFJLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNoQyxJQUFJLENBQUMsSUFBSSxFQUFFO2dCQUNWLE9BQU8sV0FBVyxDQUFDO2FBQ25CO2lCQUFNO2dCQUNOLE9BQU8sYUFBYSxDQUFDLElBQUksRUFBRSxFQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsU0FBUyxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUFDLENBQUMsQ0FBQzthQUNuRTtTQUNEO2FBQU07WUFDTixJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ1YsT0FBTyxXQUFXLENBQUM7YUFDbkI7aUJBQU07Z0JBQ04sT0FBTyxJQUFJLENBQUM7YUFDWjtTQUNEO0lBQ0YsQ0FBQztDQUNEO0FBRUQsU0FBUyxnQkFBZ0IsQ0FBQyxJQUFnQjtJQUN6QyxRQUFRLElBQUksQ0FBQyxJQUFJLEVBQUU7UUFDbkIsS0FBSyxNQUFNO1lBQ1YsT0FBTyxJQUFJLENBQUM7UUFDYixLQUFLLE1BQU07WUFDVixJQUFJLEtBQUssR0FBRyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDekMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7Z0JBQzlCLE9BQU8sSUFBSSxLQUFLLE1BQU0sQ0FBQzthQUN2QjtZQUNELElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDdEUsT0FBTyxJQUFJLEtBQUssSUFBSSxJQUFJLEdBQUcsQ0FBQztRQUM3QixLQUFLLE1BQU07WUFDVixJQUFJLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3pFLE9BQU8sSUFBSSxRQUFRLEdBQUcsQ0FBQztRQUN4QixLQUFLLE9BQU87WUFDWCxJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzFFLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO2dCQUNoQyxPQUFPLEtBQUssS0FBSyxJQUFJLENBQUM7YUFDdEI7WUFDRCxPQUFPLE1BQU0sS0FBSyxLQUFLLENBQUM7UUFDekI7WUFDQyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7S0FDN0I7QUFDRixDQUFDO0FBRUQsTUFBTSxTQUFTO0lBTWQsWUFDQyxHQUFXLEVBQ1gsS0FBUSxFQUNSLElBQXlCLEVBQ3pCLEtBQTBCO1FBUDNCLFNBQUksR0FBd0IsSUFBSSxDQUFDO1FBQ2pDLFVBQUssR0FBd0IsSUFBSSxDQUFDO1FBUWpDLElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7SUFDcEIsQ0FBQztJQUVELFFBQVE7UUFDUCxJQUFJLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDYixJQUFJLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDZCxHQUFHLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsR0FBRyxJQUFJLENBQUM7U0FDbkM7UUFDRCxHQUFHLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxLQUFLLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUNwQyxJQUFJLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDZixHQUFHLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7U0FDcEM7UUFDRCxPQUFPLEdBQUcsQ0FBQztJQUNaLENBQUM7SUFFRCxHQUFHLENBQUMsR0FBVztRQUNkLElBQUk7WUFDSCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDekI7UUFBQyxNQUFNO1lBQ1AsT0FBTyxTQUFTLENBQUM7U0FDakI7SUFDRixDQUFDO0lBRUQsT0FBTyxDQUFDLEdBQVc7UUFDbEIsSUFBSSxPQUFPLEdBQWlCLElBQUksQ0FBQztRQUNqQyxPQUFPLElBQUksRUFBRTtZQUNaLElBQUksR0FBRyxHQUFHLE9BQU8sQ0FBQyxHQUFHLEVBQUU7Z0JBQ3RCLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFO29CQUNsQixNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sR0FBRyxZQUFZLENBQUMsQ0FBQztpQkFDeEM7Z0JBQ0QsT0FBTyxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7YUFDdkI7aUJBQU0sSUFBSSxHQUFHLEdBQUcsT0FBTyxDQUFDLEdBQUcsRUFBRTtnQkFDN0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUU7b0JBQ25CLE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxHQUFHLFlBQVksQ0FBQyxDQUFDO2lCQUN4QztnQkFDRCxPQUFPLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQzthQUN4QjtpQkFBTTtnQkFDTixPQUFPLE9BQU8sQ0FBQyxLQUFLLENBQUM7YUFDckI7U0FDRDtJQUNGLENBQUM7SUFFRCxNQUFNLENBQUMsR0FBVyxFQUFFLEtBQVE7UUFDM0IsSUFBSTtZQUNILE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7U0FDbkM7UUFBQyxNQUFNO1lBQ1AsT0FBTyxTQUFTLENBQUM7U0FDakI7SUFDRixDQUFDO0lBRUQsVUFBVSxDQUFDLEdBQVcsRUFBRSxLQUFRO1FBQy9CLElBQUksR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDbkIsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ2YsT0FBTyxJQUFJLFNBQVMsQ0FDbkIsSUFBSSxDQUFDLEdBQUcsRUFDUixJQUFJLENBQUMsS0FBSyxFQUNWLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxFQUNyQyxJQUFJLENBQUMsS0FBSyxDQUNWLENBQUM7YUFDRjtZQUNELE9BQU8sSUFBSSxTQUFTLENBQ25CLElBQUksQ0FBQyxHQUFHLEVBQ1IsSUFBSSxDQUFDLEtBQUssRUFDVixJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLEVBQ2hDLElBQUksQ0FBQyxLQUFLLENBQ1YsQ0FBQztTQUNGO2FBQU0sSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUMxQixJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRTtnQkFDaEIsT0FBTyxJQUFJLFNBQVMsQ0FDbkIsSUFBSSxDQUFDLEdBQUcsRUFDUixJQUFJLENBQUMsS0FBSyxFQUNWLElBQUksQ0FBQyxJQUFJLEVBQ1QsSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQ3JDLENBQUM7YUFDRjtZQUNELE9BQU8sSUFBSSxTQUFTLENBQ25CLElBQUksQ0FBQyxHQUFHLEVBQ1IsSUFBSSxDQUFDLEtBQUssRUFDVixJQUFJLENBQUMsSUFBSSxFQUNULElBQUksQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FDakMsQ0FBQztTQUNGO2FBQU07WUFDTixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixHQUFHLEVBQUUsQ0FBQyxDQUFBO1NBQ3ZDO0lBQ0YsQ0FBQztJQUVELGNBQWMsQ0FBQyxLQUFtQjtRQUNqQyxJQUFJLE9BQU8sR0FBaUIsSUFBSSxDQUFDO1FBQ2pDLEtBQUssSUFBSSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxLQUFLLEVBQUU7WUFDL0IsT0FBTyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1NBQ3pDO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztJQUVELENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ2pCLElBQUksSUFBSSxDQUFDLElBQUksRUFBRTtZQUNkLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7U0FDakI7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDN0IsSUFBSSxJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ2YsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQztTQUNsQjtJQUNGLENBQUM7Q0FDRDtBQUVELE1BQU0sY0FBYztJQUFwQjtRQUNDLDZDQUE2QztRQUM3QyxRQUFHLEdBQVcsU0FBMEIsQ0FBQztRQUN6QyxVQUFLLEdBQU0sU0FBcUIsQ0FBQztRQUNqQyxTQUFJLEdBQXdCLFNBQXdCLENBQUM7UUFDckQsVUFBSyxHQUF3QixTQUF3QixDQUFDO0lBbUJ2RCxDQUFDO0lBakJBLFFBQVEsS0FBYSxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDakMsR0FBRyxDQUFDLElBQVksSUFBbUIsT0FBTyxTQUFTLENBQUMsQ0FBQyxDQUFDO0lBQ3RELE9BQU8sQ0FBQyxHQUFXLElBQU8sTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQztJQUN6RCxNQUFNLENBQUMsR0FBVyxFQUFFLEtBQVE7UUFDM0IsT0FBTyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBQ0QsVUFBVSxDQUFDLEdBQVcsRUFBRSxLQUFRO1FBQy9CLE9BQU8sSUFBSSxTQUFTLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUNELGNBQWMsQ0FBQyxLQUFtQjtRQUNqQyxJQUFJLE9BQU8sR0FBaUIsSUFBSSxDQUFDO1FBQ2pDLEtBQUssSUFBSSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxLQUFLLEVBQUU7WUFDL0IsT0FBTyxHQUFHLE9BQU8sQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO1NBQ3pDO1FBQ0QsT0FBTyxPQUFPLENBQUM7SUFDaEIsQ0FBQztJQUNELENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQTJCLENBQUM7Q0FDOUM7QUFFRCxNQUFNLFlBQVksR0FBRyxjQUFjLENBQUM7QUFFcEMsTUFBTSxjQUFjLEdBQUcsZ0JBQWdCLENBQUM7QUFFeEMsTUFBTSx1QkFBdUIsR0FBRyx5QkFBeUIsQ0FBQztBQUUxRCxNQUFNLHlCQUF5QixHQUFHLFNBQVMsdUJBQXVCOztJQUU5RCxZQUFZLE1BQU0sWUFBWTs7O0dBRy9CLENBQUE7QUFFSCxNQUFNLE9BQU8sR0FBRyxTQUFTLENBQUM7QUFFMUIsTUFBTSxPQUFPLEdBQUcsU0FBUyxDQUFDO0FBRTFCLE1BQU0sZUFBZSxHQUFHLGlCQUFpQixDQUFDO0FBRTFDLE1BQU0sUUFBUSxHQUFHLFVBQVUsQ0FBQztBQUU1QixTQUFTLFNBQVMsQ0FBQyxHQUFXLEVBQUUsU0FBbUM7SUFDbEUsSUFBSSxHQUFHLEdBQUcsRUFBRSxDQUFDO0lBQ2IsS0FBSyxJQUFJLElBQUksSUFBSSxHQUFHLEVBQUU7UUFDckIsR0FBRyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUN2QjtJQUNELE9BQU8sR0FBRyxDQUFDO0FBQ1osQ0FBQztBQUVELFNBQVMsa0JBQWtCLENBQUMsR0FBVztJQUN0QyxJQUFJLEdBQUcsR0FBRyxTQUFTLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxFQUFFO1FBQy9CLElBQUksSUFBSSxLQUFLLElBQUksRUFBRTtZQUNsQixPQUFPLE1BQU0sQ0FBQztTQUNkO2FBQU0sSUFBSSxJQUFJLEtBQUssR0FBRyxFQUFFO1lBQ3hCLE9BQU8sS0FBSyxDQUFDO1NBQ2I7YUFBTTtZQUNOLE9BQU8sSUFBSSxDQUFDO1NBQ1o7SUFDRixDQUFDLENBQUMsQ0FBQztJQUNILE9BQU8sSUFBSSxHQUFHLEdBQUcsQ0FBQztBQUNuQixDQUFDO0FBRUQsTUFBTSxRQUFRO0lBTWIsWUFBWSxRQUEyQixFQUFFLElBQWtCLEVBQUUsaUJBQWlCLEdBQUcsQ0FBQztRQUZsRixTQUFJLEdBQUcsRUFBRSxDQUFDO1FBR1QsSUFBSSxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7UUFDekIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLGdCQUFnQixHQUFHLGlCQUFpQixDQUFDO0lBQzNDLENBQUM7SUFFRCxPQUFPO1FBQ04sSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDM0IsSUFBSSxDQUFDLElBQUksR0FBRyxzQkFBc0IsQ0FBQTtTQUNsQztRQUNELElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxFQUFFLEVBQUU7WUFDckIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDO1NBQ2pCO1FBRUQsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxHQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUM1QyxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBRSxDQUFDO1lBQ3pCLElBQUksSUFBSSxDQUFDLElBQUksS0FBSyxNQUFNLEVBQUU7Z0JBQ3pCLFNBQVM7YUFDVDtZQUNELElBQUksQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUM7U0FDbkM7UUFDRCxJQUFJLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUMsQ0FBQyxDQUFFLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsSUFBSSxJQUFJLGlCQUFpQixJQUFJLElBQUksQ0FBQTtRQUN0QyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUM7SUFDbEIsQ0FBQztJQUVELElBQUksQ0FBQyxJQUFnQjtRQUNwQixRQUFRLElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDbkIsS0FBSyxNQUFNO2dCQUNWLE9BQU8sTUFBTSxDQUFDO1lBQ2YsS0FBSyxRQUFRO2dCQUNaLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUM7WUFDekIsS0FBSyxRQUFRO2dCQUNaLE9BQU8sR0FBRyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQTtZQUMzQyxLQUFLLE1BQU07Z0JBQ1YsT0FBTyxJQUFJLE9BQU8sSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztZQUMxRCxLQUFLLEtBQUs7Z0JBQ1QsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO3VCQUNoQyxJQUFJLFlBQVksWUFBWSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQztZQUNwRSxLQUFLLE1BQU07Z0JBQ1YsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2xDLElBQUksSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDaEUsT0FBTyxJQUFJLHVCQUF1QixJQUFJLEtBQUssSUFBSSxZQUFZLEtBQUssSUFBSSxLQUFLLENBQUM7WUFDM0UsS0FBSyxNQUFNO2dCQUNWLElBQUksUUFBUSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDL0QsT0FBTyxJQUFJLE9BQU8sSUFBSSxRQUFRLElBQUksQ0FBQztZQUNwQyxLQUFLLE9BQU87Z0JBQ1gsSUFBSSxPQUFPLEdBQUcsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ3RFLCtDQUErQztnQkFDL0MsT0FBTyxJQUFJLFFBQVEsSUFBSSxZQUFZLGNBQWMsY0FBYyxhQUFhO3NCQUN6RSxPQUFPLFlBQVksWUFBWTtzQkFDL0IseUJBQXlCLEdBQUcsTUFBTTtzQkFDbEMsT0FBTyxHQUFHLE9BQU8sQ0FBQztTQUNyQjtJQUNGLENBQUM7Q0FDRDtBQUVELHlCQUF5QjtBQUN6QixNQUFNLFdBQVc7SUFHaEIsWUFBWSxHQUFHLFFBQXVCO1FBQ3JDLElBQUksQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO0lBQzFCLENBQUM7SUFFRCxRQUFRO1FBQ1AsT0FBTyxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUM7SUFDM0UsQ0FBQztDQUNEO0FBT0QsU0FBUyxpQkFBaUIsQ0FBQyxDQUFjO0lBQ3hDLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRTtRQUNmLE9BQU8sSUFBSSxDQUFDO0tBQ1o7U0FBTSxJQUFJLE9BQU8sQ0FBQyxLQUFLLFVBQVUsRUFBRTtRQUNuQyxPQUFPLE9BQU8sQ0FBQztLQUNmO1NBQU0sSUFBSSxPQUFPLENBQUMsS0FBSyxRQUFRLElBQUksTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sRUFBRTtRQUNyRSxPQUFPLFNBQVMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUM7S0FDL0M7U0FBTTtRQUNOLE9BQU8sQ0FBQyxDQUFDLFFBQVEsRUFBRSxDQUFDO0tBQ3BCO0FBQ0YsQ0FBQztBQUVELFNBQVMsT0FBTyxDQUFDLENBQVM7SUFDekIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNoQixDQUFDO0FBRUQsU0FBUyxtQkFBbUIsQ0FBQyxRQUFnQixFQUFFLEdBQXNCO0lBQ3BFLElBQUksUUFBUSxLQUFLLEdBQUcsQ0FBQyxNQUFNLEdBQUMsQ0FBQyxFQUFFO1FBQzlCLE1BQU0sSUFBSSxLQUFLLENBQUMsWUFBWSxRQUFRLG1CQUFtQixHQUFHLENBQUMsTUFBTSxHQUFDLENBQUMsRUFBRSxDQUFDLENBQUM7S0FDdkU7QUFDRixDQUFDO0FBRUQsOEJBQThCO0FBQzlCLFNBQVMsYUFBYTtJQUNyQixPQUFPLElBQUksS0FBSyxDQUFDLHNCQUFzQixDQUFDLENBQUM7QUFDMUMsQ0FBQztBQUVELE1BQU0sYUFBYSxHQUE2QjtJQUMvQyxDQUFDLEdBQUcsRUFBRSxVQUFTLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUNyQixtQkFBbUIsQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDbEMsSUFBSSxPQUFPLENBQUMsS0FBSyxRQUFRLElBQUksT0FBTyxDQUFDLEtBQUssUUFBUSxFQUFFO2dCQUNuRCxNQUFNLGFBQWEsRUFBRSxDQUFDO2FBQ3RCO1lBQ0QsT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUMsQ0FBQyxDQUFDLENBQUM7UUFDcEIsQ0FBQyxDQUFDO0lBQ0YsQ0FBQyxTQUFTLEVBQUUsVUFBUyxDQUFDLEVBQUUsR0FBRyxJQUFJO1lBQzlCLE9BQU8sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUN4RCxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JCLENBQUMsQ0FBQztDQUNGLENBQUM7QUFFRixNQUFNLGdCQUFnQixHQUFHLGFBQWEsQ0FBQyxNQUFNLENBQzVDLENBQUMsRUFBMEIsRUFBRSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsRUFBRSxFQUFFO0lBQzVDLE9BQU8sRUFBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDbEMsQ0FBQyxFQUNELElBQUksY0FBYyxFQUFlLENBQ2pDLENBQUM7QUFFRixNQUFNLFNBQVMsR0FBaUM7SUFDL0MsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLEtBQWEsRUFBUSxFQUFFO1FBQ2xDLE9BQU8sRUFBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBQyxDQUFDO0lBQzlCLENBQUM7SUFDRCxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUF1QixFQUFlLEVBQUU7UUFDdEQsT0FBTyxJQUFJLFdBQVcsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFDRCxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsRUFBMEIsRUFBRSxLQUFtQixFQUFnQixFQUFFO1FBQzdFLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUN2QixDQUFDO0NBQ0QsQ0FBQztBQUVGLFNBQVMsU0FBUyxDQUFDLEdBQVcsRUFBRSxTQUFvQztJQUNuRSxLQUFLLElBQUksSUFBSSxJQUFJLEdBQUcsRUFBRTtRQUNyQixJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ3JCLE9BQU8sS0FBSyxDQUFDO1NBQ2I7S0FDRDtJQUNELE9BQU8sSUFBSSxDQUFDO0FBQ2IsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLEdBQVc7SUFDbkMsS0FBSyxJQUFJLElBQUksSUFBSSxHQUFHLEVBQUU7UUFDckIsT0FBTyxJQUFJLENBQUM7S0FDWjtJQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUM7QUFDakMsQ0FBQztBQUVELE1BQU0sY0FBYyxHQUE4QjtJQUNqRCxHQUFHLEVBQUUsaUJBQWlCO0lBQ3RCLEdBQUcsRUFBRSxRQUFRO0lBQ2IsR0FBRyxFQUFFLFNBQVM7SUFDZCxHQUFHLEVBQUUsV0FBVztJQUNoQixHQUFHLEVBQUUsVUFBVTtJQUNmLEdBQUcsRUFBRSxNQUFNO0lBQ1gsR0FBRyxFQUFFLE9BQU87SUFDWixHQUFHLEVBQUUsT0FBTztJQUNaLEdBQUcsRUFBRSxRQUFRO0lBQ2IsR0FBRyxFQUFFLE9BQU87SUFDWixHQUFHLEVBQUUsT0FBTztJQUNaLEdBQUcsRUFBRSxXQUFXO0lBQ2hCLEdBQUcsRUFBRSxVQUFVO0lBQ2YsR0FBRyxFQUFFLGNBQWM7SUFDbkIsR0FBRyxFQUFFLGFBQWE7SUFDbEIsR0FBRyxFQUFFLGNBQWM7SUFDbkIsR0FBRyxFQUFFLFFBQVE7SUFDYixJQUFJLEVBQUUsV0FBVztJQUNqQixHQUFHLEVBQUUsT0FBTztJQUNaLEdBQUcsRUFBRSxRQUFRO0lBQ2IsR0FBRyxFQUFFLGFBQWE7SUFDbEIsR0FBRyxFQUFFLE9BQU87Q0FDWixDQUFDO0FBRUYsU0FBUyxtQkFBbUIsQ0FBQyxHQUFXO0lBQ3ZDLElBQUksR0FBRyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7UUFDckIsTUFBTSxRQUFRLEVBQUUsQ0FBQztLQUNqQjtJQUVELElBQUksWUFBWSxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsT0FBTyxDQUFDLEVBQUU7UUFDbEUsZ0RBQWdEO1FBQ2hELE9BQU8sU0FBUyxHQUFHLEVBQUUsQ0FBQztLQUN0QjtTQUFNLElBQUksU0FBUyxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsRUFBRTtRQUNwQyxJQUFJLE9BQU8sR0FBRyxTQUFTLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxFQUFFO1lBQ25DLElBQUksR0FBRyxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUMvQixJQUFJLEdBQUcsS0FBSyxTQUFTLEVBQUU7Z0JBQ3RCLE9BQU8sSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7YUFDakM7WUFDRCxPQUFPLEdBQUcsQ0FBQztRQUNaLENBQUMsQ0FBQyxDQUFBO1FBQ0YsT0FBTyxVQUFVLE9BQU8sRUFBRSxDQUFDO0tBQzNCO1NBQU07UUFDTixNQUFNLFFBQVEsRUFBRSxDQUFDO0tBQ2pCO0FBQ0YsQ0FBQztBQUVELE1BQU0sd0JBQXdCLEdBQUcsQ0FBQyxHQUFHLEVBQUU7SUFDdEMsSUFBSSxFQUFFLEdBQXNCLElBQUksY0FBYyxFQUFVLENBQUM7SUFDekQsS0FBSyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLGdCQUFnQixFQUFFO1FBQ3ZDLEVBQUUsR0FBRyxFQUFFLENBQUMsVUFBVSxDQUFDLElBQUksRUFBRSxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0tBQ3BEO0lBQUEsQ0FBQztJQUNGLE9BQU8sRUFBRSxDQUFDO0FBQ1gsQ0FBQyxDQUFDLEVBQUUsQ0FBQztBQUVMLFNBQVMsY0FBYyxDQUFDLEtBQW1CO0lBQzFDLElBQUksSUFBSSxHQUFHLG1CQUFtQixDQUFDO0lBQy9CLE1BQU0sYUFBYSxHQUFHLFdBQVcsQ0FBQztJQUNsQyxLQUFLLElBQUksSUFBSSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUU7UUFDeEMsSUFBSSxJQUFJLFNBQVMsSUFBSSxNQUFNLGFBQWEsSUFBSSxJQUFJLEtBQUssQ0FBQztLQUN0RDtJQUNELElBQUksSUFBSSxJQUFJLENBQUM7SUFFYixLQUFLLElBQUksQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLElBQUksd0JBQXdCLEVBQUU7UUFDckQsSUFBSSxJQUFJLFNBQVMsT0FBTyxNQUFNLFlBQVksWUFBWSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO0tBQ3JGO0lBQ0QsSUFBSSxJQUFJLEtBQUsseUJBQXlCLE1BQU0sQ0FBQztJQUU3QyxJQUFJLElBQUksSUFBSSxRQUFRLENBQUMsd0JBQXdCLEVBQUUsS0FBSyxDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDaEUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNsQixJQUFJLFFBQVEsQ0FBQyxhQUFhLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxDQUFDLFNBQVMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQzlFLENBQUM7QUFFRCxTQUFTLEdBQUc7SUFDWCxJQUFJLElBQUksR0FBSSxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBc0IsQ0FBQyxLQUFLLENBQUM7SUFFdkUsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO0lBQ2hCLEtBQUssSUFBSSxHQUFHLElBQUksSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxFQUFFO1FBQzVDLElBQUksR0FBRyxDQUFDLElBQUksS0FBSyxNQUFNO2VBQ25CLEdBQUcsQ0FBQyxJQUFJLEtBQUssUUFBUTtlQUNyQixHQUFHLENBQUMsSUFBSSxLQUFLLEtBQUs7ZUFDbEIsR0FBRyxDQUFDLElBQUksS0FBSyxRQUFRO2VBQ3JCLEdBQUcsQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUN2QjtZQUNELE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxDQUFBO1NBQ3pDO2FBQU07WUFDTixNQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7U0FDM0I7S0FDRDtJQUFBLENBQUM7SUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUUvQixJQUFJLE1BQU0sR0FBRyxJQUFJLE1BQU0sQ0FDdEIsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxFQUMzQjtRQUNDLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQztRQUNYLENBQUMsSUFBSSxDQUFDO0tBQ04sRUFDRDtRQUNDLENBQUMsSUFBSSxDQUFDO1FBQ04sQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ1osQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ1osQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUM7UUFDdEIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUM7UUFDNUIsQ0FBQyxJQUFJLENBQUM7UUFDTixDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7UUFDVixDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztRQUN0QixDQUFDLEdBQUcsQ0FBQztRQUNMLENBQUMsR0FBRyxDQUFDO0tBQ0wsQ0FDRCxDQUFDO0lBQ0YsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzNCLEtBQUssSUFBSSxJQUFJLElBQUksS0FBSyxFQUFFO1FBQ3ZCLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztLQUNwQztJQUVELGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUN2QixDQUFDO0FBQUEsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImZ1bmN0aW9uIGludGVybmFsKCk6IEVycm9yIHtcbiAgICByZXR1cm4gbmV3IEVycm9yKFwiaW50ZXJuYWwgZXJyb3JcIik7XG59O1xuXG5mdW5jdGlvbiBwb3NpdGlvbkVycm9yKHBvczogUG9zaXRpb24sIG1lc3NhZ2U6IHN0cmluZyk6IEVycm9yIHtcblx0cmV0dXJuIG5ldyBFcnJvcihgJHtwb3MucGF0aH18JHtwb3MubGluZX0gY29sICR7cG9zLmNvbHVtbn18ICR7bWVzc2FnZX1gKTtcbn1cblxudHlwZSBSZWYgPSB7XG5cdGtpbmQ6IFwicmVmXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIEF0b20gPSB7XG5cdGtpbmQ6IFwiYXRvbVwiO1xuXHR2YWx1ZTogc3RyaW5nO1xufTtcblxudHlwZSBRU3ltYm9sID0ge1xuXHRraW5kOiBcInN5bWJvbFwiO1xuXHR2YWx1ZTogc3RyaW5nO1xufTtcblxudHlwZSBRTnVtYmVyID0ge1xuXHRraW5kOiBcIm51bWJlclwiO1xuXHR2YWx1ZTogYmlnaW50O1xufTtcblxudHlwZSBRU3RyaW5nID0ge1xuXHRraW5kOiBcInN0cmluZ1wiO1xuXHR2YWx1ZTogc3RyaW5nO1xufTtcblxudHlwZSBPcGVuQnJhY2tldCA9IHtcblx0a2luZDogXCIoXCI7XG59O1xuXG50eXBlIENsb3NlZEJyYWNrZXQgPSB7XG5cdGtpbmQ6IFwiKVwiO1xufTtcblxudHlwZSBPcGVuQ3VybHkgPSB7XG5cdGtpbmQ6IFwie1wiO1xufTtcblxudHlwZSBDbG9zZWRDdXJseSA9IHtcblx0a2luZDogXCJ9XCI7XG59O1xuXG50eXBlIE9wZW5TcXVhcmUgPSB7XG5cdGtpbmQ6IFwiW1wiO1xufTtcblxudHlwZSBDbG9zZWRTcXVhcmUgPSB7XG5cdGtpbmQ6IFwiXVwiO1xufTtcblxudHlwZSBFbmRPZkxpbmUgPSB7XG5cdGtpbmQ6IFwiZW9sXCI7XG59O1xuXG50eXBlIFVuaXQgPSB7XG5cdGtpbmQ6IFwidW5pdFwiO1xufVxuXG50eXBlIENhbGxhYmxlID0gKFJlZiB8IEJsb2NrIHwgQ2FsbCkgJiBQb3NpdGlvbjtcblxudHlwZSBDYWxsID0ge1xuXHRraW5kOiBcImNhbGxcIjtcblx0Zmlyc3Q6IENhbGxhYmxlO1xuXHRhcmd1bWVudHM6IEV4cHJlc3Npb25bXTtcbn1cblxudHlwZSBMaXN0ID0ge1xuXHRraW5kOiBcImxpc3RcIjtcblx0ZWxlbWVudHM6IEV4cHJlc3Npb25bXTtcbn1cblxudHlwZSBCbG9jayA9IHtcblx0a2luZDogXCJibG9ja1wiO1xuXHRleHByZXNzaW9uczogRXhwcmVzc2lvbltdO1xufVxuXG50eXBlIFRva2VuS2luZCA9XG5cdHwgUmVmXG5cdHwgQXRvbVxuXHR8IFFTeW1ib2xcblx0fCBRTnVtYmVyXG5cdHwgUVN0cmluZ1xuXHR8IE9wZW5CcmFja2V0XG5cdHwgQ2xvc2VkQnJhY2tldFxuXHR8IE9wZW5DdXJseVxuXHR8IENsb3NlZEN1cmx5XG5cdHwgT3BlblNxdWFyZVxuXHR8IENsb3NlZFNxdWFyZVxuXHR8IEVuZE9mTGluZTtcblxudHlwZSBFeHByZXNzaW9uS2luZCA9XG5cdHwgUmVmXG5cdHwgQXRvbVxuXHR8IFFOdW1iZXJcblx0fCBRU3RyaW5nXG5cdHwgVW5pdFxuXHR8IENhbGxcblx0fCBMaXN0XG5cdHwgQmxvY2s7XG5cbnR5cGUgUG9zaXRpb24gPSB7XG5cdHBhdGg6IHN0cmluZztcblx0bGluZTogbnVtYmVyO1xuXHRjb2x1bW46IG51bWJlcjtcbn07XG5cbnR5cGUgVG9rZW4gPSBUb2tlbktpbmQgJiBQb3NpdGlvbjtcblxudHlwZSBFeHByZXNzaW9uID0gRXhwcmVzc2lvbktpbmQgJiBQb3NpdGlvbjtcblxuZnVuY3Rpb24gbmV3RXhwcmVzc2lvbihwb3M6IFBvc2l0aW9uLCBleHByOiBFeHByZXNzaW9uS2luZCk6IEV4cHJlc3Npb24ge1xuXHRyZXR1cm4gey4uLmV4cHIsIHBhdGg6IHBvcy5wYXRoLCBsaW5lOiBwb3MubGluZSwgY29sdW1uOiBwb3MuY29sdW1ufTtcbn1cblxuLy8gVE9ETzogc3VwcG9ydCBub24gYXNjaWlcblxuZnVuY3Rpb24gaXNTcGFjZShjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eXFxzJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzSWRlbnRTdGFydChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eW2EtekEtWl9dJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzSWRlbnQoY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlswLTlhLXpBLVpfXSQvLnRlc3QoY2hhcik7XG59O1xuXG5mdW5jdGlvbiBpc1Jlc2VydmVkU3ltYm9sKGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gWydcIicsIFwiJ1wiLCAnKCcsICcpJywgJ3snLCAnfScsICdbJywgJ10nLCAnIyddLmluY2x1ZGVzKGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNTeW1ib2woY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChpc1Jlc2VydmVkU3ltYm9sKGNoYXIpIHx8IChjaGFyID09ICdfJykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH07XG5cdHJldHVybiAvXltcXHUwMDIxLVxcdTAwMkZcXHUwMDNBLVxcdTAwNDBcXHUwMDVCLVxcdTAwNjBcXHUwMDdCLVxcdTAwN0VdJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzTnVtYmVyU3RhcnQoY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlswLTldJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15bMC05X10kLy50ZXN0KGNoYXIpO1xufTtcblxuY2xhc3MgTGV4ZXIgaW1wbGVtZW50cyBJdGVyYWJsZTxUb2tlbj4ge1xuXHRwYXRoOiBzdHJpbmc7XG5cdGNoYXJzOiBJdGVyYXRvcjxzdHJpbmc+O1xuXHRsYXN0Q2hhcjoge2NoYXI6IHN0cmluZywgdXNlOiBib29sZWFufSB8IG51bGwgPSBudWxsO1xuXHRsaW5lID0gMTtcblx0Y29sdW1uID0gMTtcblx0bGFzdE5ld2xpbmUgPSBmYWxzZTtcblxuXHRsYXN0VG9rZW46IHt0b2tlbjogVG9rZW4sIHVzZTogYm9vbGVhbn0gfCBudWxsID0gbnVsbDtcblx0ZmluaXNoZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3RvcihwYXRoOiBzdHJpbmcsIGJ5Q2hhcjogSXRlcmFibGU8c3RyaW5nPikge1xuXHRcdHRoaXMucGF0aCA9IHBhdGg7XG5cdFx0dGhpcy5jaGFycyA9IGJ5Q2hhcltTeW1ib2wuaXRlcmF0b3JdKCk7XG5cdH1cblxuXHRuZXh0Q2hhcigpOiB7Y2hhcjogc3RyaW5nLCBsaW5lOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyfSB8IG51bGwge1xuXHRcdGxldCBjaGFyOiBzdHJpbmc7XG5cdFx0aWYgKHRoaXMubGFzdENoYXIgJiYgdGhpcy5sYXN0Q2hhci51c2UpIHtcblx0XHRcdHRoaXMubGFzdENoYXIudXNlID0gZmFsc2U7XG5cdFx0XHRjaGFyID0gdGhpcy5sYXN0Q2hhci5jaGFyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQge2RvbmUsIHZhbHVlfSA9IHRoaXMuY2hhcnMubmV4dCgpO1xuXHRcdFx0aWYgKGRvbmUpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9O1xuXHRcdFx0Y2hhciA9IHZhbHVlO1xuXHRcdH07XG5cdFx0dGhpcy5sYXN0Q2hhciA9IHtjaGFyLCB1c2U6IGZhbHNlfTtcblxuXHRcdGlmIChjaGFyID09ICdcXG4nKSB7XG5cdFx0XHRpZiAodGhpcy5sYXN0TmV3bGluZSkge1xuXHRcdFx0XHR0aGlzLmNvbHVtbiA9IDE7XG5cdFx0XHRcdHJldHVybiB7Y2hhciwgbGluZTogdGhpcy5saW5lKyssIGNvbHVtbjogdGhpcy5jb2x1bW59OyBcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGFzdE5ld2xpbmUgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSsrLCBjb2x1bW46IHRoaXMuY29sdW1ufTsgXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5sYXN0TmV3bGluZSkge1xuXHRcdFx0XHR0aGlzLmNvbHVtbiA9IDI7XG5cdFx0XHRcdHRoaXMubGFzdE5ld2xpbmUgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIHtjaGFyLCBsaW5lOiB0aGlzLmxpbmUsIGNvbHVtbjogMX07IFxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHtjaGFyLCBsaW5lOiB0aGlzLmxpbmUsIGNvbHVtbjogdGhpcy5jb2x1bW4rK307IFxuXHRcdFx0fTtcblx0XHR9O1xuXHR9O1xuXG5cdHVucmVhZENoYXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxhc3RDaGFyIHx8IHRoaXMubGFzdENoYXIudXNlKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH07XG5cdFx0dGhpcy5sYXN0Q2hhci51c2UgPSB0cnVlO1xuXHRcdGlmICh0aGlzLmxhc3ROZXdsaW5lKSB7XG5cdFx0XHR0aGlzLmxpbmUtLTtcblx0XHRcdHRoaXMubGFzdE5ld2xpbmUgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb2x1bW4tLTtcblx0XHR9O1xuXHR9O1xuXG5cdHRha2VXaGlsZShwcmVkaWNhdGU6IChjaGFyOiBzdHJpbmcpID0+IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGxldCBzdHIgPSBcIlwiO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKT8uY2hhcjtcblx0XHRcdGlmICghY2hhcikge1xuXHRcdFx0XHRyZXR1cm4gc3RyO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFwcmVkaWNhdGUoY2hhcikpIHtcblx0XHRcdFx0dGhpcy51bnJlYWRDaGFyKCk7XG5cdFx0XHRcdHJldHVybiBzdHI7XG5cdFx0XHR9O1xuXHRcdFx0c3RyICs9IGNoYXI7XG5cdFx0fTtcblx0fTtcblxuXHRmaW5pc2hpbmdFb2woKTogVG9rZW4ge1xuXHRcdHRoaXMuZmluaXNoZWQgPSB0cnVlO1xuXHRcdHJldHVybiB7IHBhdGg6IHRoaXMucGF0aCwgbGluZTogdGhpcy5saW5lLCBjb2x1bW46IHRoaXMuY29sdW1uLCBraW5kOiBcImVvbFwiIH1cblx0fTtcblxuXHR3aXRoUG9zaXRpb24ocG9zaXRpb246IHtsaW5lOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyfSwga2luZDogVG9rZW5LaW5kKTogVG9rZW4ge1xuXHRcdHJldHVybiB7IHBhdGg6IHRoaXMucGF0aCwgbGluZTogcG9zaXRpb24ubGluZSwgY29sdW1uOiBwb3NpdGlvbi5jb2x1bW4sIC4uLmtpbmQgfVxuXHR9O1xuXG5cdG5leHRUb2tlbigpOiBUb2tlbiB8IG51bGwge1xuXHRcdGlmICh0aGlzLmxhc3RUb2tlbiAmJiB0aGlzLmxhc3RUb2tlbi51c2UpIHtcblx0XHRcdHRoaXMubGFzdFRva2VuLnVzZSA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuIHRoaXMubGFzdFRva2VuLnRva2VuO1xuXHRcdH1cblx0XHRsZXQgdG9rZW4gPSB0aGlzLmdldE5leHRUb2tlbigpO1xuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHR0aGlzLmxhc3RUb2tlbiA9IHt0b2tlbiwgdXNlOiBmYWxzZX07XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9XG5cblx0Z2V0TmV4dFRva2VuKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRpZiAoIXRoaXMuZmluaXNoZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZmluaXNoaW5nRW9sKCk7XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fTtcblxuXHRcdGlmIChpc1NwYWNlKGNoYXIuY2hhcikpIHtcblx0XHRcdGlmIChjaGFyLmNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKGNoYXIsIHtraW5kOiBcImVvbFwifSk7XG5cdFx0XHR9O1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0Y2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZmluaXNoaW5nRW9sKCk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmICghaXNTcGFjZShjaGFyLmNoYXIpKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChjaGFyLmNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oY2hhciwge2tpbmQ6IFwiZW9sXCJ9KTs7XG5cdFx0XHRcdH07XG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRsZXQgc3RhcnQgPSBjaGFyO1xuXHRcdGlmIChpc1Jlc2VydmVkU3ltYm9sKGNoYXIuY2hhcikpIHtcblx0XHRcdHN3aXRjaCAoY2hhci5jaGFyKSB7XG5cdFx0XHRjYXNlICdcIic6XG5cdFx0XHRcdGxldCBzdHIgPSBcIlwiO1xuXHRcdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRcdGxldCBjaGFyID0gdGhpcy5uZXh0Q2hhcigpO1xuXHRcdFx0XHRcdGlmICghY2hhcikge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdzdHJpbmcgbm90IGNsb3NlZCB3aXRoIFwiJylcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGlmIChjaGFyLmNoYXIgPT0gJ1wiJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJzdHJpbmdcIiwgdmFsdWU6IHN0cn0pO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKGNoYXIuY2hhciAhPSAnXFxyJykge1xuXHRcdFx0XHRcdFx0c3RyICs9IGNoYXIuY2hhcjtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSBcIidcIjpcblx0XHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdGlmICghY2hhciB8fCAhaXNJZGVudFN0YXJ0KGNoYXIuY2hhcikpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJiYXJlICdcIilcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy51bnJlYWRDaGFyKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiYXRvbVwiLCB2YWx1ZTogdGhpcy50YWtlV2hpbGUoaXNJZGVudCl9KTtcblx0XHRcdGNhc2UgJygnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIihcIn0pO1xuXHRcdFx0Y2FzZSAnKSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiKVwifSk7XG5cdFx0XHRjYXNlICd7Jzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJ7XCJ9KTtcblx0XHRcdGNhc2UgJ30nOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIn1cIn0pO1xuXHRcdFx0Y2FzZSAnWyc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiW1wifSk7XG5cdFx0XHRjYXNlICddJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJdXCJ9KTtcblx0XHRcdGNhc2UgJyMnOlxuXHRcdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRcdGxldCBjaGFyID0gdGhpcy5uZXh0Q2hhcigpO1xuXHRcdFx0XHRcdGlmICghY2hhcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZmluaXNoaW5nRW9sKCk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAoY2hhci5jaGFyID09ICdcXG4nKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oY2hhciwge2tpbmQ6IFwiZW9sXCJ9KTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChpc0lkZW50U3RhcnQoY2hhci5jaGFyKSkge1xuXHRcdFx0dGhpcy51bnJlYWRDaGFyKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcInJlZlwiLCB2YWx1ZTogdGhpcy50YWtlV2hpbGUoaXNJZGVudCl9KTtcblx0XHR9IGVsc2UgaWYgKGlzTnVtYmVyU3RhcnQoY2hhci5jaGFyKSkge1xuXHRcdFx0dGhpcy51bnJlYWRDaGFyKCk7XG5cdFx0XHRsZXQgbnVtID0gdGhpcy50YWtlV2hpbGUoaXNOdW1iZXIpLnJlcGxhY2UoXCJfXCIsIFwiXCIpO1xuXHRcdFx0aWYgKChudW0ubGVuZ3RoID4gMSkgJiYgbnVtWzBdID09ICcwJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHplcm8gcGFkZGVkIG51bWJlciAke251bX1gKVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwibnVtYmVyXCIsIHZhbHVlOiBCaWdJbnQobnVtKX0pO1xuXHRcdH0gZWxzZSBpZiAoaXNTeW1ib2woY2hhci5jaGFyKSkge1xuXHRcdFx0dGhpcy51bnJlYWRDaGFyKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcInN5bWJvbFwiLCB2YWx1ZTogdGhpcy50YWtlV2hpbGUoaXNTeW1ib2wpfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRPRE86IHF1b3RlIGNoYXIgd2hlbiBuZWNlc3Nhcnlcblx0XHRcdHRocm93IG5ldyBFcnJvcihgdW5rbm93biBjaGFyYWN0ZXIgJHtjaGFyfWApO1xuXHRcdH07XG5cdH07XG5cblx0dW5yZWFkVG9rZW4oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxhc3RUb2tlbiB8fCB0aGlzLmxhc3RUb2tlbi51c2UpIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fTtcblx0XHR0aGlzLmxhc3RUb2tlbi51c2UgPSB0cnVlO1xuXHR9O1xuXG5cdHBlZWtUb2tlbigpOiBUb2tlbiB8IG51bGwge1xuXHRcdGxldCB0b2tlbiA9IHRoaXMubmV4dFRva2VuKCk7XG5cdFx0dGhpcy51bnJlYWRUb2tlbigpO1xuXHRcdHJldHVybiB0b2tlbjtcblx0fVxuXG5cdG11c3ROZXh0VG9rZW4odGs/OiBUb2tlbktpbmQpOiBUb2tlbiB7XG5cdFx0bGV0IHRva2VuID0gdGhpcy5uZXh0VG9rZW4oKTtcblx0XHRpZiAoIXRva2VuIHx8ICh0ayAmJiB0b2tlbi5raW5kICE9PSB0ay5raW5kKSkge1xuXHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9XG5cblx0W1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmF0b3I8VG9rZW4+IHtcblx0XHRyZXR1cm4gbmV3IFRva2VuSXRlcmF0b3IodGhpcyk7XG5cdH07XG59O1xuXG5jbGFzcyBUb2tlbkl0ZXJhdG9yIGltcGxlbWVudHMgSXRlcmF0b3I8VG9rZW4+IHtcblx0bGV4ZXI6IExleGVyO1xuXG5cdGNvbnN0cnVjdG9yKGxleGVyOiBMZXhlcikge1xuXHRcdHRoaXMubGV4ZXIgPSBsZXhlcjtcblx0fTtcblxuXHRuZXh0KCk6IEl0ZXJhdG9yUmVzdWx0PFRva2VuPiB7XG5cdFx0bGV0IHRva2VuID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHQvLyB0aGUgdHlwZSBvZiBJdGVyYXRvciByZXF1aXJlcyB0aGF0IHdlIGFsd2F5cyByZXR1cm4gYSB2YWxpZCBUb2tlblxuXHRcdFx0Ly8gc28gd2UgcmV0dXJuIGVvbCBoZXJlXG5cdFx0XHRyZXR1cm4ge2RvbmU6IHRydWUsIHZhbHVlOiB7a2luZDogXCJlb2xcIn19O1xuXHRcdH07XG5cdFx0cmV0dXJuIHtkb25lOiBmYWxzZSwgdmFsdWU6IHRva2VufTtcblx0fTtcbn07XG5cbmZ1bmN0aW9uIGNvbGxhcHNlRXhwcmVzc2lvbnMocG9zOiBQb3NpdGlvbiwgZXhwcnM6IEV4cHJlc3Npb25bXSk6IEV4cHJlc3Npb24ge1xuXHRzd2l0Y2ggKGV4cHJzLmxlbmd0aCkge1xuXHRcdGNhc2UgMDpcblx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKHBvcywge2tpbmQ6IFwidW5pdFwifSk7XG5cdFx0Y2FzZSAxOlxuXHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24ocG9zLCBleHByc1swXSEpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRsZXQgZmlyc3QgPSBleHByc1swXSE7XG5cdFx0XHRpZiAoZmlyc3Qua2luZCAhPT0gXCJyZWZcIlxuXHRcdFx0XHQmJiBmaXJzdC5raW5kICE9PSBcImJsb2NrXCJcblx0XHRcdFx0JiYgZmlyc3Qua2luZCAhPT0gXCJjYWxsXCJcblx0XHRcdCkge1xuXHRcdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKGZpcnN0LCBcImNhbiBvbmx5IGNhbGwgaWRlbnQsIGJsb2NrIG9yIGNhbGxcIik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihcblx0XHRcdFx0cG9zLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogXCJjYWxsXCIsXG5cdFx0XHRcdFx0Zmlyc3QsXG5cdFx0XHRcdFx0YXJndW1lbnRzOiBleHBycy5zbGljZSgxKSxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0fVxufVxuXG50eXBlIFZhbHVlT3JTeW1ib2wgPSBFeHByZXNzaW9uIHwgUVN5bWJvbCZQb3NpdGlvbjtcblxuaW50ZXJmYWNlIFByZWNlZGVuY2VUYWJsZSB7IFtrZXk6IHN0cmluZ106IG51bWJlcjsgfTtcblxuY2xhc3MgUGFyc2VyIHtcblx0bGV4ZXI6IExleGVyO1xuXHRwcmVjZWRlbmNlVGFibGU6IFByZWNlZGVuY2VUYWJsZTtcblxuXHQvLyBUT0RPOiBjaGVjayBkdXBsaWNhdGUgc3ltYm9sc1xuXHRjb25zdHJ1Y3RvcihsZXhlcjogTGV4ZXIsIGxvd2VyVGhhbkNhbGw6IHN0cmluZ1tdW10sIGhpZ2hlclRoYW5DYWxsOiBzdHJpbmdbXVtdKSB7XG5cdFx0dGhpcy5sZXhlciA9IGxleGVyO1xuXHRcdHRoaXMucHJlY2VkZW5jZVRhYmxlID0ge307XG5cdFx0bGV0IGluc2VydFByZWNlZGVuY2UgPSAodGFibGU6IHN0cmluZ1tdW10sIGZhY3RvcjogbnVtYmVyKSA9PiB7XG5cdFx0XHR0YWJsZS5mb3JFYWNoKChsZXZlbCwgaSkgPT4gbGV2ZWwuZm9yRWFjaChzeW1ib2wgPT4ge1xuXHRcdFx0XHRpZiAoIXN0cmluZ0FsbChzeW1ib2wsIGlzU3ltYm9sKSB8fCB0aGlzLnByZWNlZGVuY2VUYWJsZS5oYXNPd25Qcm9wZXJ0eShzeW1ib2wpKSB7XG5cdFx0XHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnByZWNlZGVuY2VUYWJsZVtzeW1ib2xdID0gKGkgKyAxKSAqIGZhY3Rvcjtcblx0XHRcdH0pKTtcblx0XHR9O1xuXHRcdGluc2VydFByZWNlZGVuY2UobG93ZXJUaGFuQ2FsbCwgLTEpLFxuXHRcdHRoaXMucHJlY2VkZW5jZVRhYmxlW1wiY2FsbFwiXSA9IDA7XG5cdFx0aW5zZXJ0UHJlY2VkZW5jZShoaWdoZXJUaGFuQ2FsbCwgMSlcblx0fVxuXG5cdHBhcnNlKCk6IEV4cHJlc3Npb25bXSB7XG5cdFx0bGV0IGV4cHJlc3Npb25zID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBzdGFydCA9IHRoaXMubGV4ZXIucGVla1Rva2VuKCk7XG5cdFx0XHRpZiAoIXN0YXJ0KSB7XG5cdFx0XHRcdHJldHVybiBleHByZXNzaW9ucztcblx0XHRcdH1cblx0XHRcdGxldCB2YWx1ZXNPclN5bWJvbHM6IFZhbHVlT3JTeW1ib2xbXSA9IFtdO1xuXHRcdFx0d2hpbGUodHJ1ZSkge1xuXHRcdFx0XHRsZXQgbmV4dCA9IHRoaXMubGV4ZXIubmV4dFRva2VuKCk7XG5cdFx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJlb2xcIikge1xuXHRcdFx0XHRcdGlmICh2YWx1ZXNPclN5bWJvbHNbdmFsdWVzT3JTeW1ib2xzLmxlbmd0aC0xXT8ua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0XHR2YWx1ZXNPclN5bWJvbHMucHVzaChuZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2godGhpcy52YWx1ZSgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHZhbHVlc09yU3ltYm9scy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGV4cHJlc3Npb25zLnB1c2godGhpcy5jb2xsYXBzZShzdGFydCwgdmFsdWVzT3JTeW1ib2xzKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y2FsbE9yVmFsdWUoKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IG9wZW5CcmFja2V0ID0gdGhpcy5sZXhlci5tdXN0TmV4dFRva2VuKHtraW5kOiAnKCd9KTtcblx0XHRsZXQgdmFsdWVzT3JTeW1ib2xzOiBWYWx1ZU9yU3ltYm9sW10gPSBbXTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcImV4cGVjdGVkICcpJywgZ290IGVvZlwiKTtcblx0XHRcdH1cblx0XHRcdGlmIChuZXh0LmtpbmQgPT09IFwiZW9sXCIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCIpXCIpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHR2YWx1ZXNPclN5bWJvbHMucHVzaChuZXh0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2godGhpcy52YWx1ZSgpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY29sbGFwc2Uob3BlbkJyYWNrZXQsIHZhbHVlc09yU3ltYm9scyk7XG5cdH1cblxuXHQvLyBUT0RPOiBhbGxvdyBzeW1ib2xzIHdpdGggaGlnaGVyIHByZWNlZGVuY2UgdGhhbiBjYWxsIGluIGxpc3RzXG5cdGxpc3QoKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IG9wZW5TcXVhcmUgPSB0aGlzLmxleGVyLm11c3ROZXh0VG9rZW4oe2tpbmQ6IFwiW1wifSk7XG5cdFx0bGV0IGVsZW1lbnRzOiBFeHByZXNzaW9uW10gPSBbXTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcImV4cGVjdGVkICddJywgZ290IGVvZlwiKTtcblx0XHRcdH1cblx0XHRcdGlmIChuZXh0LmtpbmQgPT09IFwiZW9sXCIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJdXCIpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdGVsZW1lbnRzLnB1c2godGhpcy52YWx1ZSgpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24ob3BlblNxdWFyZSwge2tpbmQ6IFwibGlzdFwiLCBlbGVtZW50c30pO1xuXHR9XG5cblx0YmxvY2soKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IG9wZW5DdXJseSA9IHRoaXMubGV4ZXIubXVzdE5leHRUb2tlbih7a2luZDogXCJ7XCJ9KTtcblx0XHRsZXQgZXhwcmVzc2lvbnMgPSBbXTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IHN0YXJ0ID0gdGhpcy5sZXhlci5wZWVrVG9rZW4oKTtcblx0XHRcdGxldCB2YWx1ZXNPclN5bWJvbHM6IFZhbHVlT3JTeW1ib2xbXSA9IFtdO1xuXHRcdFx0d2hpbGUodHJ1ZSkge1xuXHRcdFx0XHRsZXQgbmV4dCA9IHRoaXMubGV4ZXIubmV4dFRva2VuKCk7XG5cdFx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcImV4cGVjdGVkICd9JywgZ290IGVvZlwiKTtcblx0XHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwiZW9sXCIpIHtcblx0XHRcdFx0XHRpZiAodmFsdWVzT3JTeW1ib2xzW3ZhbHVlc09yU3ltYm9scy5sZW5ndGgtMV0/LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcIn1cIikge1xuXHRcdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0XHR2YWx1ZXNPclN5bWJvbHMucHVzaChuZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2godGhpcy52YWx1ZSgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHZhbHVlc09yU3ltYm9scy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGV4cHJlc3Npb25zLnB1c2godGhpcy5jb2xsYXBzZShzdGFydCEsIHZhbHVlc09yU3ltYm9scykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMubGV4ZXIubXVzdE5leHRUb2tlbigpLmtpbmQgPT09ICd9Jykge1xuXHRcdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihvcGVuQ3VybHksIHtraW5kOiBcImJsb2NrXCIsIGV4cHJlc3Npb25zfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dmFsdWUoKTogRXhwcmVzc2lvbiB7XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcInVuZXhwZWN0ZWQgZW9mXCIpO1xuXHRcdH0gZWxzZSBpZiAoWycpJywgJ10nLCAnfScsIFwiZW9sXCJdLmluY2x1ZGVzKHRva2VuLmtpbmQpKSB7XG5cdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKHRva2VuLCBgdW5leHBlY3RlZCAke3Rva2VuLmtpbmR9YClcblx0XHR9IGVsc2UgaWYgKFtcInN0cmluZ1wiLCBcIm51bWJlclwiLCBcInJlZlwiLCBcImF0b21cIl0uaW5jbHVkZXModG9rZW4ua2luZCkpIHtcblx0XHRcdHJldHVybiB0b2tlbiBhcyBFeHByZXNzaW9uO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzd2l0Y2ggKHRva2VuLmtpbmQpIHtcblx0XHRcdGNhc2UgXCJzeW1ib2xcIjpcblx0XHRcdFx0dGhyb3cgcG9zaXRpb25FcnJvcih0b2tlbiwgYHVuZXhwZWN0ZWQgc3ltYm9sICR7dG9rZW4udmFsdWV9YCk7XG5cdFx0XHRjYXNlICcoJzpcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jYWxsT3JWYWx1ZSgpO1xuXHRcdFx0Y2FzZSAneyc6XG5cdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuYmxvY2soKTtcblx0XHRcdGNhc2UgJ1snOlxuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmxpc3QoKTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y29sbGFwc2Uoc3RhcnQ6IFBvc2l0aW9uLCB2YWxzT3JTeW1zOiBWYWx1ZU9yU3ltYm9sW10pOiBFeHByZXNzaW9uIHtcblx0XHRsZXQgcGFyc2VyID0gbmV3IE9wZXJhdG9yUGFyc2VyKHN0YXJ0LCB0aGlzLnByZWNlZGVuY2VUYWJsZSwgdmFsc09yU3ltcyk7XG5cdFx0cmV0dXJuIHBhcnNlci5wYXJzZSgpO1xuXHR9XG59XG5cbmNsYXNzIE9wZXJhdG9yUGFyc2VyIHtcblx0c3RhcnQ6IFBvc2l0aW9uO1xuXHRwcmVjZWRlbmNlVGFibGU6IFByZWNlZGVuY2VUYWJsZTtcblx0dmFsc09yU3ltczogVmFsdWVPclN5bWJvbFtdO1xuXHRwb3NpdGlvbiA9IDA7XG5cblx0Y29uc3RydWN0b3Ioc3RhcnQ6IFBvc2l0aW9uLCBwcmVjZWRlbmNlVGFibGU6IFByZWNlZGVuY2VUYWJsZSwgdmFsc09yU3ltczogVmFsdWVPclN5bWJvbFtdKSB7XG5cdFx0aWYgKHZhbHNPclN5bXNbMF0/LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdGxldCBzeW0gPSB2YWxzT3JTeW1zWzBdO1xuXHRcdFx0dGhyb3cgcG9zaXRpb25FcnJvcihzeW0sIGB1bmV4cGVjdGVkIHN5bWJvbCAke3N5bS52YWx1ZX1gKTtcblx0XHR9XG5cdFx0bGV0IGxhc3RTeW0gPSBmYWxzZTtcblx0XHRmb3IgKGxldCB2YWxPclN5bSBvZiB2YWxzT3JTeW1zKSB7XG5cdFx0XHRpZiAodmFsT3JTeW0ua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRpZiAobGFzdFN5bSkge1xuXHRcdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IoXG5cdFx0XHRcdFx0XHR2YWxPclN5bSxcblx0XHRcdFx0XHRcdGBzeW1ib2wgJHt2YWxPclN5bS52YWx1ZX0gZGlyZWN0bHkgZm9sbG93cyBhbm90aGVyIHN5bWJvbGAsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXByZWNlZGVuY2VUYWJsZS5oYXNPd25Qcm9wZXJ0eSh2YWxPclN5bS52YWx1ZSkpIHtcblx0XHRcdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKFxuXHRcdFx0XHRcdFx0dmFsT3JTeW0sXG5cdFx0XHRcdFx0XHRgdW5rbm93biBvcGVyYXRvciAke3ZhbE9yU3ltLnZhbHVlfWBcblx0XHRcdFx0XHQpXG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdFN5bSA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYXN0U3ltID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh2YWxzT3JTeW1zW3ZhbHNPclN5bXMubGVuZ3RoIC0gMV0/LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdGxldCBzeW0gPSB2YWxzT3JTeW1zW3ZhbHNPclN5bXMubGVuZ3RoIC0gMV0gYXMgKFFTeW1ib2wmUG9zaXRpb24pO1xuXHRcdFx0dGhyb3cgcG9zaXRpb25FcnJvcihzeW0sIGB1bmV4cGVjdGVkIHN5bWJvbCAke3N5bS52YWx1ZX1gKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0YXJ0ID0gc3RhcnQ7XG5cdFx0dGhpcy5wcmVjZWRlbmNlVGFibGUgPSBwcmVjZWRlbmNlVGFibGU7XG5cdFx0dGhpcy52YWxzT3JTeW1zID0gdmFsc09yU3ltcztcblx0fVxuXG5cdHByZWNlZGVuY2Uoc3ltOiBRU3ltYm9sKTogbnVtYmVyIHtcblx0XHRsZXQgcHJlYyA9IHRoaXMucHJlY2VkZW5jZVRhYmxlW3N5bS52YWx1ZV07XG5cdFx0aWYgKHByZWMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByZWM7XG5cdH1cblxuXHRuZXh0KCk6IFZhbHVlT3JTeW1ib2wgfCBudWxsIHtcblx0XHRsZXQgcG9zaXRpb24gPSB0aGlzLnBvc2l0aW9uO1xuXHRcdHRoaXMucG9zaXRpb24rKztcblx0XHRpZiAocG9zaXRpb24gPj0gdGhpcy52YWxzT3JTeW1zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLnZhbHNPclN5bXNbcG9zaXRpb25dITtcblx0XHR9XG5cdH1cblxuXHRwZWVrKCk6IFZhbHVlT3JTeW1ib2wgfCBudWxsIHtcblx0XHRpZiAodGhpcy5wb3NpdGlvbiA+PSB0aGlzLnZhbHNPclN5bXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMudmFsc09yU3ltc1t0aGlzLnBvc2l0aW9uXSE7XG5cdFx0fVxuXHR9XG5cblx0c2tpcChuOiBudW1iZXIpOiB2b2lkIHtcblx0XHRsZXQgbmV4dCA9IHRoaXMucG9zaXRpb24gKyBuO1xuXHRcdGlmIChuID09PSAwIHx8IG5leHQgPiB0aGlzLnZhbHNPclN5bXMubGVuZ3RoIHx8IG5leHQgPCAwKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH1cblx0XHR0aGlzLnBvc2l0aW9uID0gbmV4dDtcblx0fVxuXG5cdHBhcnNlKCk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBleHBycyA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMubmV4dCgpO1xuXHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdHJldHVybiBjb2xsYXBzZUV4cHJlc3Npb25zKHRoaXMuc3RhcnQsIGV4cHJzKTtcblx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm9wZXJhdG9yTG93ZXIoXG5cdFx0XHRcdFx0bmV4dCxcblx0XHRcdFx0XHRjb2xsYXBzZUV4cHJlc3Npb25zKGV4cHJzWzBdID8/IHRoaXMuc3RhcnQsIGV4cHJzKSxcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBvcCA9IHRoaXMub3BlcmF0b3IobmV4dCk7XG5cdFx0XHRcdGlmICghb3ApIHtcblx0XHRcdFx0XHRleHBycy5wdXNoKG5leHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGV4cHJzLnB1c2gob3ApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3BlcmF0b3JMb3dlcihzeW06IFFTeW1ib2wmUG9zaXRpb24sIGxlZnQ6IEV4cHJlc3Npb24pOiBFeHByZXNzaW9uIHtcblx0XHRjb25zdCBraW5kID0gXCJjYWxsXCI7XG5cdFx0bGV0IGZpcnN0ID0gbmV3RXhwcmVzc2lvbihcblx0XHRcdHN5bSxcblx0XHRcdHsga2luZDogXCJyZWZcIiwgdmFsdWU6IHN5bS52YWx1ZSB9LFxuXHRcdCkgYXMgUmVmJlBvc2l0aW9uO1xuXHRcdGxldCByaWdodDogRXhwcmVzc2lvbltdID0gW107XG5cdFx0Y29uc3QgY29sbGFwc2VSaWdodCA9ICgpOiBFeHByZXNzaW9uID0+IHtcblx0XHRcdGxldCBwb3NpdGlvbiA9IHJpZ2h0WzBdO1xuXHRcdFx0aWYgKCFwb3NpdGlvbikge1xuXHRcdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbGxhcHNlRXhwcmVzc2lvbnMocG9zaXRpb24sIHJpZ2h0KTtcblx0XHR9O1xuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5uZXh0KCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24obGVmdCwge1xuXHRcdFx0XHRcdGtpbmQsXG5cdFx0XHRcdFx0Zmlyc3QsXG5cdFx0XHRcdFx0YXJndW1lbnRzOiBbbGVmdCwgY29sbGFwc2VSaWdodCgpXSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRpZiAodGhpcy5wcmVjZWRlbmNlKG5leHQpIDwgdGhpcy5wcmVjZWRlbmNlKHN5bSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihsZWZ0LCB7XG5cdFx0XHRcdFx0XHRraW5kLFxuXHRcdFx0XHRcdFx0Zmlyc3QsXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtcblx0XHRcdFx0XHRcdFx0bGVmdCxcblx0XHRcdFx0XHRcdFx0dGhpcy5vcGVyYXRvckxvd2VyKFxuXHRcdFx0XHRcdFx0XHRcdG5leHQsXG5cdFx0XHRcdFx0XHRcdFx0Y29sbGFwc2VSaWdodCgpLFxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLm9wZXJhdG9yTG93ZXIobmV4dCxcblx0XHRcdFx0XHRcdG5ld0V4cHJlc3Npb24obGVmdCwge1xuXHRcdFx0XHRcdFx0XHRraW5kLFxuXHRcdFx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbbGVmdCwgY29sbGFwc2VSaWdodCgpXSxcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdClcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IG9wID0gdGhpcy5vcGVyYXRvcihuZXh0KTtcblx0XHRcdFx0aWYgKCFvcCkge1xuXHRcdFx0XHRcdHJpZ2h0LnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmlnaHQucHVzaChvcCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvcGVyYXRvcihsZWZ0OiBFeHByZXNzaW9uKTogRXhwcmVzc2lvbiB8IG51bGwge1xuXHRcdGxldCBzeW0gPSB0aGlzLm5leHQoKTtcblx0XHRpZiAoIXN5bSB8fCBzeW0ua2luZCAhPT0gXCJzeW1ib2xcIiB8fCB0aGlzLnByZWNlZGVuY2Uoc3ltKSA8IDApIHtcblx0XHRcdHRoaXMuc2tpcCgtMSk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0bGV0IHJpZ2h0ID0gdGhpcy5uZXh0KCk7XG5cdFx0aWYgKCFyaWdodCB8fCByaWdodC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH1cblx0XHRjb25zdCBraW5kID0gXCJjYWxsXCI7XG5cdFx0bGV0IGZpcnN0ID0gbmV3RXhwcmVzc2lvbihcblx0XHRcdHN5bSxcblx0XHRcdHtraW5kOiBcInJlZlwiLCB2YWx1ZTogc3ltLnZhbHVlfSxcblx0XHQpIGFzIFJlZiZQb3NpdGlvbjtcblx0XHRsZXQgY3VycmVudDogQ2FsbCA9IHsga2luZCwgZmlyc3QsIGFyZ3VtZW50czogW2xlZnQsIHJpZ2h0XSB9O1xuXHRcdGxldCBjdXJyZW50RXhwciA9IG5ld0V4cHJlc3Npb24obGVmdCwgY3VycmVudCk7XG5cblx0XHRsZXQgbmV4dFN5bSA9IHRoaXMucGVlaygpO1xuXHRcdGlmICghbmV4dFN5bSB8fCBuZXh0U3ltLmtpbmQgIT09IFwic3ltYm9sXCIpIHtcblx0XHRcdHJldHVybiBjdXJyZW50RXhwcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMucHJlY2VkZW5jZShuZXh0U3ltKSA+IHRoaXMucHJlY2VkZW5jZShzeW0pKSB7XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMub3BlcmF0b3IocmlnaHQpO1xuXHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdHJldHVybiBjdXJyZW50RXhwcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKGxlZnQsIHtraW5kLCBmaXJzdCwgYXJndW1lbnRzOiBbbGVmdCwgbmV4dF19KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLm9wZXJhdG9yKGN1cnJlbnRFeHByKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRyZXR1cm4gY3VycmVudEV4cHI7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbmV4dDtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gZXhwcmVzc2lvblN0cmluZyhleHByOiBFeHByZXNzaW9uKTogc3RyaW5nIHtcblx0c3dpdGNoIChleHByLmtpbmQpIHtcblx0Y2FzZSBcInVuaXRcIjpcblx0XHRyZXR1cm4gXCIoKVwiO1xuXHRjYXNlIFwiY2FsbFwiOlxuXHRcdGxldCBmaXJzdCA9IGV4cHJlc3Npb25TdHJpbmcoZXhwci5maXJzdCk7XG5cdFx0aWYgKGV4cHIuYXJndW1lbnRzLmxlbmd0aCA8IDEpIHtcblx0XHRcdHJldHVybiBgKCR7Zmlyc3R9ICgpKWA7XG5cdFx0fVxuXHRcdGxldCBhcmdzID0gZXhwci5hcmd1bWVudHMubWFwKGFyZyA9PiBleHByZXNzaW9uU3RyaW5nKGFyZykpLmpvaW4oXCIgXCIpO1xuXHRcdHJldHVybiBgKCR7Zmlyc3R9ICR7YXJnc30pYDtcblx0Y2FzZSBcImxpc3RcIjpcblx0XHRsZXQgZWxlbWVudHMgPSBleHByLmVsZW1lbnRzLm1hcChhcmcgPT4gZXhwcmVzc2lvblN0cmluZyhhcmcpKS5qb2luKFwiIFwiKTtcblx0XHRyZXR1cm4gYFske2VsZW1lbnRzfV1gO1xuXHRjYXNlIFwiYmxvY2tcIjpcblx0XHRsZXQgZXhwcnMgPSBleHByLmV4cHJlc3Npb25zLm1hcChhcmcgPT4gZXhwcmVzc2lvblN0cmluZyhhcmcpKS5qb2luKFwiXFxuXCIpO1xuXHRcdGlmIChleHByLmV4cHJlc3Npb25zLmxlbmd0aCA8IDIpIHtcblx0XHRcdHJldHVybiBgeyAke2V4cHJzfSB9YDtcblx0XHR9XG5cdFx0cmV0dXJuIGB7XFxuJHtleHByc31cXG59YDtcblx0ZGVmYXVsdDpcblx0XHRyZXR1cm4gZXhwci52YWx1ZS50b1N0cmluZygpO1xuXHR9XG59XG5cbmNsYXNzIE5hbWVzcGFjZTxUPiBpbXBsZW1lbnRzIEl0ZXJhYmxlPFtzdHJpbmcsIFRdPntcblx0a2V5OiBzdHJpbmc7XG5cdHZhbHVlOiBUO1xuXHRsZWZ0OiBOYW1lc3BhY2U8VD4gfCBudWxsID0gbnVsbDtcblx0cmlnaHQ6IE5hbWVzcGFjZTxUPiB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGtleTogc3RyaW5nLFxuXHRcdHZhbHVlOiBULFxuXHRcdGxlZnQ6IE5hbWVzcGFjZTxUPiB8IG51bGwsXG5cdFx0cmlnaHQ6IE5hbWVzcGFjZTxUPiB8IG51bGxcblx0KSB7XG5cdFx0dGhpcy5rZXkgPSBrZXk7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHRcdHRoaXMubGVmdCA9IGxlZnQ7XG5cdFx0dGhpcy5yaWdodCA9IHJpZ2h0O1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRsZXQgc3RyID0gXCJcIjtcblx0XHRpZiAodGhpcy5sZWZ0KSB7XG5cdFx0XHRzdHIgKz0gdGhpcy5sZWZ0LnRvU3RyaW5nKCkgKyBcIiwgXCI7XG5cdFx0fVxuXHRcdHN0ciArPSBgJHt0aGlzLmtleX06ICR7dGhpcy52YWx1ZX1gO1xuXHRcdGlmICh0aGlzLnJpZ2h0KSB7XG5cdFx0XHRzdHIgKz0gXCIsIFwiICsgdGhpcy5yaWdodC50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RyO1xuXHR9XG5cblx0Z2V0KGtleTogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLm11c3RHZXQoa2V5KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0bXVzdEdldChrZXk6IHN0cmluZyk6IFQge1xuXHRcdGxldCBjdXJyZW50OiBOYW1lc3BhY2U8VD4gPSB0aGlzO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRpZiAoa2V5IDwgY3VycmVudC5rZXkpIHtcblx0XHRcdFx0aWYgKCFjdXJyZW50LmxlZnQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGtleSAke2tleX0gbm90IGZvdW5kYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VycmVudCA9IGN1cnJlbnQubGVmdDtcblx0XHRcdH0gZWxzZSBpZiAoa2V5ID4gY3VycmVudC5rZXkpIHtcblx0XHRcdFx0aWYgKCFjdXJyZW50LnJpZ2h0KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBrZXkgJHtrZXl9IG5vdCBmb3VuZGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN1cnJlbnQgPSBjdXJyZW50LnJpZ2h0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnQudmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aW5zZXJ0KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IE5hbWVzcGFjZTxUPiB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLm11c3RJbnNlcnQoa2V5LCB2YWx1ZSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdG11c3RJbnNlcnQoa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogTmFtZXNwYWNlPFQ+IHtcblx0XHRpZiAoa2V5IDwgdGhpcy5rZXkpIHtcblx0XHRcdGlmICghdGhpcy5sZWZ0KSB7XG5cdFx0XHRcdHJldHVybiBuZXcgTmFtZXNwYWNlKFxuXHRcdFx0XHRcdHRoaXMua2V5LFxuXHRcdFx0XHRcdHRoaXMudmFsdWUsXG5cdFx0XHRcdFx0bmV3IE5hbWVzcGFjZShrZXksIHZhbHVlLCBudWxsLCBudWxsKSxcblx0XHRcdFx0XHR0aGlzLnJpZ2h0LFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2UoXG5cdFx0XHRcdHRoaXMua2V5LFxuXHRcdFx0XHR0aGlzLnZhbHVlLFxuXHRcdFx0XHR0aGlzLmxlZnQubXVzdEluc2VydChrZXksIHZhbHVlKSxcblx0XHRcdFx0dGhpcy5yaWdodCxcblx0XHRcdCk7XG5cdFx0fSBlbHNlIGlmIChrZXkgPiB0aGlzLmtleSkge1xuXHRcdFx0aWYgKCF0aGlzLnJpZ2h0KSB7XG5cdFx0XHRcdHJldHVybiBuZXcgTmFtZXNwYWNlKFxuXHRcdFx0XHRcdHRoaXMua2V5LFxuXHRcdFx0XHRcdHRoaXMudmFsdWUsXG5cdFx0XHRcdFx0dGhpcy5sZWZ0LFxuXHRcdFx0XHRcdG5ldyBOYW1lc3BhY2Uoa2V5LCB2YWx1ZSwgbnVsbCwgbnVsbCksXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IE5hbWVzcGFjZShcblx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdHRoaXMudmFsdWUsXG5cdFx0XHRcdHRoaXMubGVmdCxcblx0XHRcdFx0dGhpcy5yaWdodC5tdXN0SW5zZXJ0KGtleSwgdmFsdWUpLFxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBkdXBsaWNhdGUga2V5ICR7a2V5fWApXG5cdFx0fVxuXHR9XG5cblx0bXVzdEluc2VydE1hbnkob3RoZXI6IE5hbWVzcGFjZTxUPik6IE5hbWVzcGFjZTxUPiB7XG5cdFx0bGV0IGN1cnJlbnQ6IE5hbWVzcGFjZTxUPiA9IHRoaXM7XG5cdFx0Zm9yIChsZXQgW2tleSwgdmFsdWVdIG9mIG90aGVyKSB7XG5cdFx0XHRjdXJyZW50ID0gY3VycmVudC5tdXN0SW5zZXJ0KGtleSwgdmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gY3VycmVudDtcblx0fVxuXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYXRvcjxbc3RyaW5nLCBUXT4ge1xuXHRcdGlmICh0aGlzLmxlZnQpIHtcblx0XHRcdHlpZWxkKiB0aGlzLmxlZnQ7XG5cdFx0fVxuXHRcdHlpZWxkIFt0aGlzLmtleSwgdGhpcy52YWx1ZV07XG5cdFx0aWYgKHRoaXMucmlnaHQpIHtcblx0XHRcdHlpZWxkKiB0aGlzLnJpZ2h0O1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBFbXB0eU5hbWVzcGFjZTxUPiBpbXBsZW1lbnRzIEl0ZXJhYmxlPFtzdHJpbmcsIFRdPiB7XG5cdC8vIGR1bW15IHZhbHVlcyB0byBtYWtlIHRoZSB0eXBlY2hlY2tlciBoYXBweVxuXHRrZXk6IHN0cmluZyA9IHVuZGVmaW5lZCBhcyBhbnkgYXMgc3RyaW5nO1xuXHR2YWx1ZTogVCA9IHVuZGVmaW5lZCBhcyBhbnkgYXMgVDtcblx0bGVmdDogTmFtZXNwYWNlPFQ+IHwgbnVsbCA9IHVuZGVmaW5lZCBhcyBhbnkgYXMgbnVsbDtcblx0cmlnaHQ6IE5hbWVzcGFjZTxUPiB8IG51bGwgPSB1bmRlZmluZWQgYXMgYW55IGFzIG51bGw7XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHsgcmV0dXJuIFwiXCI7IH1cblx0Z2V0KF9rZXk6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdG11c3RHZXQoa2V5OiBzdHJpbmcpOiBUIHsgdGhyb3cgYGtleSAke2tleX0gbm90IGZvdW5kYDsgfVxuXHRpbnNlcnQoa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogTmFtZXNwYWNlPFQ+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gbmV3IE5hbWVzcGFjZShrZXksIHZhbHVlLCBudWxsLCBudWxsKTtcblx0fVxuXHRtdXN0SW5zZXJ0KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IE5hbWVzcGFjZTxUPiB7XG5cdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2Uoa2V5LCB2YWx1ZSwgbnVsbCwgbnVsbCk7XG5cdH1cblx0bXVzdEluc2VydE1hbnkob3RoZXI6IE5hbWVzcGFjZTxUPik6IE5hbWVzcGFjZTxUPiB7XG5cdFx0bGV0IGN1cnJlbnQ6IE5hbWVzcGFjZTxUPiA9IHRoaXM7XG5cdFx0Zm9yIChsZXQgW2tleSwgdmFsdWVdIG9mIG90aGVyKSB7XG5cdFx0XHRjdXJyZW50ID0gY3VycmVudC5tdXN0SW5zZXJ0KGtleSwgdmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gY3VycmVudDtcblx0fVxuXHQqW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmF0b3I8W3N0cmluZywgVF0+IHt9XG59XG5cbmNvbnN0IG91ck5hbWVzcGFjZSA9IFwib3VyTmFtZXNwYWNlXCI7XG5cbmNvbnN0IHRoZWlyTmFtZXNwYWNlID0gXCJ0aGVpck5hbWVzcGFjZVwiO1xuXG5jb25zdCB1bnBhY2tBbmRNYXliZUFkZFRvT3VycyA9IFwidW5wYWNrQW5kTWF5YmVBZGRUb091cnNcIjtcblxuY29uc3QgdW5wYWNrQW5kTWF5YmVBZGRUb091cnNGbiA9IGBjb25zdCAke3VucGFja0FuZE1heWJlQWRkVG9PdXJzfSA9IChbaW5zZXJ0YWJsZSwgcmV0XSkgPT4ge1xuXHRpZiAoaW5zZXJ0YWJsZSkge1xuXHRcdCR7b3VyTmFtZXNwYWNlfSA9ICR7b3VyTmFtZXNwYWNlfS5tdXN0SW5zZXJ0TWFueShpbnNlcnRhYmxlKTtcblx0fVxuXHRyZXR1cm4gcmV0O1xufTtgXG5cbmNvbnN0IG5ld0F0b20gPSBcIm5ld0F0b21cIjtcblxuY29uc3QgbmV3TGlzdCA9IFwibmV3TGlzdFwiO1xuXG5jb25zdCBuZXdMaXN0RnJvbUFyZ3MgPSBcIm5ld0xpc3RGcm9tQXJnc1wiO1xuXG5jb25zdCBuZXdCbG9jayA9IFwibmV3QmxvY2tcIjtcblxuZnVuY3Rpb24gc3RyaW5nTWFwKHN0cjogc3RyaW5nLCBwcmVkaWNhdGU6IChjaGFyOiBzdHJpbmcpID0+IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBvdXQgPSBcIlwiO1xuXHRmb3IgKGxldCBjaGFyIG9mIHN0cikge1xuXHRcdG91dCArPSBwcmVkaWNhdGUoY2hhcik7XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuZnVuY3Rpb24gdG9KYXZhc2NyaXB0U3RyaW5nKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGVzYyA9IHN0cmluZ01hcChzdHIsIGNoYXIgPT4ge1xuXHRcdGlmIChjaGFyID09PSBcIlxcXFxcIikge1xuXHRcdFx0cmV0dXJuIFwiXFxcXFxcXFxcIjtcblx0XHR9IGVsc2UgaWYgKGNoYXIgPT09ICdcIicpIHtcblx0XHRcdHJldHVybiAnXFxcXFwiJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGNoYXI7XG5cdFx0fVxuXHR9KTtcblx0cmV0dXJuIGBcIiR7ZXNjfVwiYDtcbn1cblxuY2xhc3MgQ29tcGlsZXIge1xuXHR2YXJOYW1lczogTmFtZXNwYWNlPHN0cmluZz47XG5cdGJvZHk6IEV4cHJlc3Npb25bXTtcblx0dGVtcG9yYXJpZXNJbmRleDogbnVtYmVyO1xuXHRjb2RlID0gXCJcIjtcblxuXHRjb25zdHJ1Y3Rvcih2YXJOYW1lczogTmFtZXNwYWNlPHN0cmluZz4sIGJvZHk6IEV4cHJlc3Npb25bXSwgdGVtcG9yYXJpZXNPZmZzZXQgPSAwKSB7XG5cdFx0dGhpcy52YXJOYW1lcyA9IHZhck5hbWVzO1xuXHRcdHRoaXMuYm9keSA9IGJvZHk7XG5cdFx0dGhpcy50ZW1wb3Jhcmllc0luZGV4ID0gdGVtcG9yYXJpZXNPZmZzZXQ7XG5cdH1cblxuXHRjb21waWxlKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuYm9keS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuY29kZSA9IFwicmV0dXJuIFtudWxsLCBudWxsXTtcIlxuXHRcdH1cblx0XHRpZiAodGhpcy5jb2RlICE9PSBcIlwiKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb2RlO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5ib2R5Lmxlbmd0aC0xOyBpKyspIHtcblx0XHRcdGxldCBleHByID0gdGhpcy5ib2R5W2ldITtcblx0XHRcdGlmIChleHByLmtpbmQgIT09IFwiY2FsbFwiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb2RlICs9IHRoaXMuZXhwcihleHByKSArIFwiO1wiO1xuXHRcdH1cblx0XHRsZXQgbGFzdCA9IHRoaXMuZXhwcih0aGlzLmJvZHlbdGhpcy5ib2R5Lmxlbmd0aC0xXSEpO1xuXHRcdHRoaXMuY29kZSArPSBgcmV0dXJuIFtudWxsLCAke2xhc3R9XTtgXG5cdFx0cmV0dXJuIHRoaXMuY29kZTtcblx0fVxuXG5cdGV4cHIoZXhwcjogRXhwcmVzc2lvbik6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChleHByLmtpbmQpIHtcblx0XHRjYXNlIFwidW5pdFwiOlxuXHRcdFx0cmV0dXJuIFwibnVsbFwiO1xuXHRcdGNhc2UgXCJudW1iZXJcIjpcblx0XHRcdHJldHVybiBgJHtleHByLnZhbHVlfW5gO1xuXHRcdGNhc2UgXCJzdHJpbmdcIjpcblx0XHRcdHJldHVybiBgJHt0b0phdmFzY3JpcHRTdHJpbmcoZXhwci52YWx1ZSl9YFxuXHRcdGNhc2UgXCJhdG9tXCI6XG5cdFx0XHRyZXR1cm4gYCgke25ld0F0b219KCR7dG9KYXZhc2NyaXB0U3RyaW5nKGV4cHIudmFsdWUpfSkpYDtcblx0XHRjYXNlIFwicmVmXCI6XG5cdFx0XHRyZXR1cm4gdGhpcy52YXJOYW1lcy5nZXQoZXhwci52YWx1ZSlcblx0XHRcdFx0Pz8gYCgke291ck5hbWVzcGFjZX0ubXVzdEdldCgke3RvSmF2YXNjcmlwdFN0cmluZyhleHByLnZhbHVlKX0pKWA7XG5cdFx0Y2FzZSBcImNhbGxcIjpcblx0XHRcdGxldCBmaXJzdCA9IHRoaXMuZXhwcihleHByLmZpcnN0KTtcblx0XHRcdGxldCBhcmdzID0gZXhwci5hcmd1bWVudHMubWFwKGFyZyA9PiB0aGlzLmV4cHIoYXJnKSkuam9pbihcIiwgXCIpO1xuXHRcdFx0cmV0dXJuIGAoJHt1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc30oJHtmaXJzdH0oJHtvdXJOYW1lc3BhY2V9LCAke2FyZ3N9KSkpYDtcblx0XHRjYXNlIFwibGlzdFwiOlxuXHRcdFx0bGV0IGVsZW1lbnRzID0gZXhwci5lbGVtZW50cy5tYXAoZSA9PiB0aGlzLmV4cHIoZSkpLmpvaW4oXCIsIFwiKTtcblx0XHRcdHJldHVybiBgKCR7bmV3TGlzdH0oJHtlbGVtZW50c30pKWA7XG5cdFx0Y2FzZSBcImJsb2NrXCI6XG5cdFx0XHRsZXQgY29udGVudCA9IG5ldyBDb21waWxlcih0aGlzLnZhck5hbWVzLCBleHByLmV4cHJlc3Npb25zKS5jb21waWxlKCk7XG5cdFx0XHQvLyBUT0RPOiBjaGVjayBhcmcgbGVuZ3RoID09PSAxIGZvciBiYXNpYyBibG9ja1xuXHRcdFx0cmV0dXJuIGAoJHtuZXdCbG9ja30oJHtvdXJOYW1lc3BhY2V9LCBmdW5jdGlvbigke3RoZWlyTmFtZXNwYWNlfSwgLi4uXykge1xcbmBcblx0XHRcdFx0KyBgbGV0ICR7b3VyTmFtZXNwYWNlfSA9IHRoaXM7XFxuYFxuXHRcdFx0XHQrIHVucGFja0FuZE1heWJlQWRkVG9PdXJzRm4gKyAnXFxuXFxuJ1xuXHRcdFx0XHQrIGNvbnRlbnQgKyBcIlxcbn0pKVwiO1xuXHRcdH1cblx0fVxufVxuXG4vLyBUT0RPOiBwZXJzaXN0ZW50IGFycmF5XG5jbGFzcyBSdW50aW1lTGlzdCB7XG5cdGVsZW1lbnRzOiBSdW50aW1lVHlwZVtdO1xuXG5cdGNvbnN0cnVjdG9yKC4uLmVsZW1lbnRzOiBSdW50aW1lVHlwZVtdKSB7XG5cdFx0dGhpcy5lbGVtZW50cyA9IGVsZW1lbnRzO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gXCJbXCIgKyB0aGlzLmVsZW1lbnRzLm1hcChlID0+IHJ1bnRpbWVUeXBlU3RyaW5nKGUpKS5qb2luKFwiIFwiKSArIFwiXVwiO1xuXHR9XG59XG5cbnR5cGUgUnVudGltZVR5cGUgPSBudWxsIHwgYmlnaW50IHwgc3RyaW5nIHwgQXRvbSB8IFJ1bnRpbWVMaXN0IHwgUnVudGltZUJsb2NrO1xuXG50eXBlIFJ1bnRpbWVCbG9jayA9IChuczogTmFtZXNwYWNlPFJ1bnRpbWVUeXBlPiwgLi4uYXJnczogKFJ1bnRpbWVUeXBlIHwgdW5kZWZpbmVkKVtdKVxuXHQ9PiBbTmFtZXNwYWNlPFJ1bnRpbWVUeXBlPiB8IG51bGwsIFJ1bnRpbWVUeXBlXTtcblxuZnVuY3Rpb24gcnVudGltZVR5cGVTdHJpbmcodjogUnVudGltZVR5cGUpOiBzdHJpbmcge1xuXHRpZiAodiA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBcIigpXCI7XG5cdH0gZWxzZSBpZiAodHlwZW9mIHYgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdHJldHVybiBcImJsb2NrXCI7XG5cdH0gZWxzZSBpZiAodHlwZW9mIHYgPT09IFwib2JqZWN0XCIgJiYgJ2tpbmQnIGluIHYgJiYgdi5raW5kID09PSBcImF0b21cIikge1xuXHRcdHJldHVybiBgKGF0b20gJHt0b0phdmFzY3JpcHRTdHJpbmcodi52YWx1ZSl9KWA7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHYudG9TdHJpbmcoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBwcmludGxuKHM6IHN0cmluZykge1xuXHRjb25zb2xlLmxvZyhzKTtcbn1cblxuZnVuY3Rpb24gY2hlY2tBcmd1bWVudExlbmd0aChleHBlY3RlZDogbnVtYmVyLCBnb3Q6IHsgbGVuZ3RoOiBudW1iZXJ9KTogdm9pZCB7XG5cdGlmIChleHBlY3RlZCAhPT0gZ290Lmxlbmd0aC0xKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBleHBlY3RlZCAke2V4cGVjdGVkfSBhcmd1bWVudHMsIGdvdCAke2dvdC5sZW5ndGgtMX1gKTtcblx0fVxufVxuXG4vLyBUT0RPOiBiZXR0ZXIgZXJyb3IgaGFuZGxpbmdcbmZ1bmN0aW9uIGFyZ3VtZW50RXJyb3IoKTogRXJyb3Ige1xuXHRyZXR1cm4gbmV3IEVycm9yKFwiYmFkIGFyZ3VtZW50IHR5cGUocylcIik7XG59XG5cbmNvbnN0IGJ1aWx0aW5CbG9ja3M6IFtzdHJpbmcsIFJ1bnRpbWVCbG9ja11bXSA9IFtcblx0W1wiK1wiLCBmdW5jdGlvbihfLCB4LCB5KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgeCAhPT0gXCJiaWdpbnRcIiB8fCB0eXBlb2YgeSAhPT0gXCJiaWdpbnRcIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gW251bGwsIHgreV07XG5cdH1dLFxuXHRbXCJwcmludGxuXCIsIGZ1bmN0aW9uKF8sIC4uLmFyZ3MpIHtcblx0XHRwcmludGxuKGFyZ3MubWFwKHYgPT4gcnVudGltZVR5cGVTdHJpbmcodiEpKS5qb2luKFwiIFwiKSk7XG5cdFx0cmV0dXJuIFtudWxsLCBudWxsXTtcblx0fV0sXG5dO1xuXG5jb25zdCBidWlsdGluTmFtZXNwYWNlID0gYnVpbHRpbkJsb2Nrcy5yZWR1Y2UoXG5cdChuczogTmFtZXNwYWNlPFJ1bnRpbWVUeXBlPiwgW3N0ciwgYmxvY2tdKSA9PiB7XG5cdFx0cmV0dXJuIG5zLm11c3RJbnNlcnQoc3RyLCBibG9jayk7XG5cdH0sXG5cdG5ldyBFbXB0eU5hbWVzcGFjZTxSdW50aW1lVHlwZT4oKSxcbik7XG5cbmNvbnN0IGludGVybmFsczogeyBbbmFtZTogc3RyaW5nXTogRnVuY3Rpb24gfSA9IHtcblx0W25ld0F0b21dOiAodmFsdWU6IHN0cmluZyk6IEF0b20gPT4ge1xuXHRcdHJldHVybiB7a2luZDogXCJhdG9tXCIsIHZhbHVlfTtcblx0fSxcblx0W25ld0xpc3RdOiAoLi4uZWxlbWVudHM6IFJ1bnRpbWVUeXBlW10pOiBSdW50aW1lTGlzdCA9PiB7XG5cdFx0cmV0dXJuIG5ldyBSdW50aW1lTGlzdCguLi5lbGVtZW50cyk7XG5cdH0sXG5cdFtuZXdCbG9ja106IChuczogTmFtZXNwYWNlPFJ1bnRpbWVUeXBlPiwgYmxvY2s6IFJ1bnRpbWVCbG9jayk6IFJ1bnRpbWVCbG9jayA9PiB7XG5cdFx0cmV0dXJuIGJsb2NrLmJpbmQobnMpO1xuXHR9LFxufTtcblxuZnVuY3Rpb24gc3RyaW5nQWxsKHN0cjogc3RyaW5nLCBwcmVkaWNhdGU6IChjaGFyOiBzdHJpbmcpID0+IGJvb2xlYW4pOiBib29sZWFuIHtcblx0Zm9yIChsZXQgY2hhciBvZiBzdHIpIHtcblx0XHRpZiAoIXByZWRpY2F0ZShjaGFyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gbXVzdFN0cmluZ0ZpcnN0KHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0Zm9yIChsZXQgY2hhciBvZiBzdHIpIHtcblx0XHRyZXR1cm4gY2hhcjtcblx0fVxuXHR0aHJvdyBuZXcgRXJyb3IoXCJlbXB0eSBzdHJpbmdcIik7XG59XG5cbmNvbnN0IGVzY2FwZWRTeW1ib2xzOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0ge1xuXHRcIiFcIjogXCJFeGNsYW1hdGlvbk1hcmtcIixcblx0XCIkXCI6IFwiRG9sbGFyXCIsXG5cdFwiJVwiOiBcIlBlcmNlbnRcIixcblx0XCImXCI6IFwiQW1wZXJzYW5kXCIsXG5cdFwiKlwiOiBcIkFzdGVyaXNrXCIsXG5cdFwiK1wiOiBcIlBsdXNcIixcblx0XCIsXCI6IFwiQ29tbWFcIixcblx0XCItXCI6IFwiTWludXNcIixcblx0XCIuXCI6IFwiUGVyaW9kXCIsXG5cdFwiL1wiOiBcIlNsYXNoXCIsXG5cdFwiOlwiOiBcIkNvbG9uXCIsXG5cdFwiO1wiOiBcIlNlbWljb2xvblwiLFxuXHRcIjxcIjogXCJMZXNzVGhhblwiLFxuXHRcIj1cIjogXCJFcXVhbGl0eVNpZ25cIixcblx0XCI+XCI6IFwiR3JlYXRlclRoYW5cIixcblx0XCI/XCI6IFwiUXVlc3Rpb25NYXJrXCIsXG5cdFwiQFwiOiBcIkF0U2lnblwiLFxuXHRcIlxcXFxcIjogXCJCYWNrc2xhc2hcIixcblx0XCJeXCI6IFwiQ2FyZXRcIixcblx0XCJgXCI6IFwiQWNjZW50XCIsXG5cdFwifFwiOiBcIlZlcnRpY2FsQmFyXCIsXG5cdFwiflwiOiBcIlRpbGRlXCIsXG59O1xuXG5mdW5jdGlvbiB0b0phdmFzY3JpcHRWYXJOYW1lKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKHN0ci5sZW5ndGggPT09IDApIHtcblx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHR9XG5cblx0aWYgKGlzSWRlbnRTdGFydChtdXN0U3RyaW5nRmlyc3Qoc3RyKSkgJiYgc3RyaW5nQWxsKHN0ciwgaXNJZGVudCkpIHtcblx0XHQvLyBUT0RPOiBjaGVjayBzdGlsbCB2YWxpZCB3aXRoIG5vbiBhc2NpaSBpZGVudHNcblx0XHRyZXR1cm4gYGlkZW50XyR7c3RyfWA7XG5cdH0gZWxzZSBpZiAoc3RyaW5nQWxsKHN0ciwgaXNTeW1ib2wpKSB7XG5cdFx0bGV0IGVzY2FwZWQgPSBzdHJpbmdNYXAoc3RyLCBjaGFyID0+IHtcblx0XHRcdGxldCBlc2MgPSBlc2NhcGVkU3ltYm9sc1tjaGFyXTtcblx0XHRcdGlmIChlc2MgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gYFUke2NoYXIuY29kZVBvaW50QXQoMCl9YDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBlc2M7XG5cdFx0fSlcblx0XHRyZXR1cm4gYHN5bWJvbF8ke2VzY2FwZWR9YDtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHR9XG59XG5cbmNvbnN0IGJ1aWx0aW5OYW1lc3BhY2VWYXJOYW1lcyA9ICgoKSA9PiB7XG5cdGxldCBuczogTmFtZXNwYWNlPHN0cmluZz4gPSBuZXcgRW1wdHlOYW1lc3BhY2U8c3RyaW5nPigpO1xuXHRmb3IgKGxldCBbbmFtZSwgX10gb2YgYnVpbHRpbk5hbWVzcGFjZSkge1xuXHRcdG5zID0gbnMubXVzdEluc2VydChuYW1lLCB0b0phdmFzY3JpcHRWYXJOYW1lKG5hbWUpKTtcblx0fTtcblx0cmV0dXJuIG5zO1xufSkoKTtcblxuZnVuY3Rpb24gcnVuRXhwcmVzc2lvbnMoZXhwcnM6IEV4cHJlc3Npb25bXSk6IHZvaWQge1xuXHRsZXQgY29kZSA9IFwiJ3VzZSBzdHJpY3QnO1xcblxcblwiO1xuXHRjb25zdCBpbnRlcm5hbHNOYW1lID0gXCJpbnRlcm5hbHNcIjtcblx0Zm9yIChsZXQgbmFtZSBvZiBPYmplY3Qua2V5cyhpbnRlcm5hbHMpKSB7XG5cdFx0Y29kZSArPSBgY29uc3QgJHtuYW1lfSA9ICR7aW50ZXJuYWxzTmFtZX0uJHtuYW1lfTtcXG5gO1xuXHR9XG5cdGNvZGUgKz0gXCJcXG5cIjtcblxuXHRmb3IgKGxldCBbbmFtZSwgdmFyTmFtZV0gb2YgYnVpbHRpbk5hbWVzcGFjZVZhck5hbWVzKSB7XG5cdFx0Y29kZSArPSBgY29uc3QgJHt2YXJOYW1lfSA9ICR7b3VyTmFtZXNwYWNlfS5tdXN0R2V0KCR7dG9KYXZhc2NyaXB0U3RyaW5nKG5hbWUpfSk7XFxuYDtcblx0fVxuXHRjb2RlICs9IGBcXG4ke3VucGFja0FuZE1heWJlQWRkVG9PdXJzRm59XFxuXFxuYDtcblxuXHRjb2RlICs9IG5ldyBDb21waWxlcihidWlsdGluTmFtZXNwYWNlVmFyTmFtZXMsIGV4cHJzKS5jb21waWxlKCk7XG5cdGNvbnNvbGUubG9nKGNvZGUpO1xuXHRuZXcgRnVuY3Rpb24oaW50ZXJuYWxzTmFtZSwgb3VyTmFtZXNwYWNlLCBjb2RlKShpbnRlcm5hbHMsIGJ1aWx0aW5OYW1lc3BhY2UpO1xufVxuXG5mdW5jdGlvbiBydW4oKSB7XG5cdGxldCBjb2RlID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29kZVwiKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcblxuXHRsZXQgdG9rZW5zID0gW107XG5cdGZvciAobGV0IHRvayBvZiBuZXcgTGV4ZXIoXCJ0ZXh0YXJlYVwiLCBjb2RlKSkge1xuXHRcdGlmICh0b2sua2luZCA9PT0gXCJhdG9tXCJcblx0XHRcdHx8IHRvay5raW5kID09PSBcIm51bWJlclwiXG5cdFx0XHR8fCB0b2sua2luZCA9PT0gXCJyZWZcIlxuXHRcdFx0fHwgdG9rLmtpbmQgPT09IFwic3RyaW5nXCJcblx0XHRcdHx8IHRvay5raW5kID09PSBcInN5bWJvbFwiXG5cdFx0KSB7XG5cdFx0XHR0b2tlbnMucHVzaChgJHt0b2sua2luZH0gKCR7dG9rLnZhbHVlfSlgKVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0b2tlbnMucHVzaChgJHt0b2sua2luZH1gKTtcblx0XHR9XG5cdH07XG5cdGNvbnNvbGUubG9nKHRva2Vucy5qb2luKFwiLCBcIikpO1xuXG5cdGxldCBwYXJzZXIgPSBuZXcgUGFyc2VyKFxuXHRcdG5ldyBMZXhlcihcInRleHRhcmVhXCIsIGNvZGUpLFxuXHRcdFtcblx0XHRcdFtcIj1cIiwgXCI8LVwiXSxcblx0XHRcdFtcInw+XCJdLFxuXHRcdF0sXG5cdFx0W1xuXHRcdFx0W1wiLT5cIl0sXG5cdFx0XHRbXCImJlwiLCBcInx8XCJdLFxuXHRcdFx0W1wiPT1cIiwgXCIhPVwiXSxcblx0XHRcdFtcIjxcIiwgXCI8PVwiLCBcIj5cIiwgXCI+PVwiXSxcblx0XHRcdFtcIi4uXCIsIFwiLi48XCIsIFwiPC4uXCIsIFwiPC4uPFwiXSxcblx0XHRcdFtcIisrXCJdLFxuXHRcdFx0W1wiK1wiLCBcIi1cIl0sXG5cdFx0XHRbXCIqXCIsIFwiL1wiLCBcIi8vXCIsIFwiJSVcIl0sXG5cdFx0XHRbXCJAXCJdLFxuXHRcdFx0W1wiLlwiXSxcblx0XHRdLFxuXHQpO1xuXHRsZXQgZXhwcnMgPSBwYXJzZXIucGFyc2UoKTtcblx0Zm9yIChsZXQgZXhwciBvZiBleHBycykge1xuXHRcdGNvbnNvbGUubG9nKGV4cHJlc3Npb25TdHJpbmcoZXhwcikpO1xuXHR9XG5cblx0cnVuRXhwcmVzc2lvbnMoZXhwcnMpO1xufTsiXX0=