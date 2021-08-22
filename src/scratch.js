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
function newPrecedenceTable(table, factor) {
    let prec = {};
    table.forEach((level, i) => level.forEach(symbol => prec[symbol] = (i + 1) * factor));
    return prec;
}
class Parser {
    // TODO: check duplicate symbols
    constructor(lexer, lowerThanCall, higherThanCall) {
        this.lexer = lexer;
        this.precedenceTable = {
            ...newPrecedenceTable(lowerThanCall, -1),
            "call": 0,
            ...newPrecedenceTable(higherThanCall, 1)
        };
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
                if (!(valOrSym.value in precedenceTable)) {
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
    for (let name in internals) {
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
        ["=", "->"],
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyYXRjaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNjcmF0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLFNBQVMsUUFBUTtJQUNiLE9BQU8sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsYUFBYSxDQUFDLEdBQWEsRUFBRSxPQUFlO0lBQ3BELE9BQU8sSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLFFBQVEsR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUErR0QsU0FBUyxhQUFhLENBQUMsR0FBYSxFQUFFLElBQW9CO0lBQ3pELE9BQU8sRUFBQyxHQUFHLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBQyxDQUFDO0FBQ3RFLENBQUM7QUFFRCwwQkFBMEI7QUFFMUIsU0FBUyxPQUFPLENBQUMsSUFBWTtJQUM1QixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLFlBQVksQ0FBQyxJQUFZO0lBQ2pDLE9BQU8sYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsT0FBTyxDQUFDLElBQVk7SUFDNUIsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEMsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLGdCQUFnQixDQUFDLElBQVk7SUFDckMsT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFF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QUM7UUFDTixDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7UUFDWixDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7UUFDWixDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQztRQUN0QixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQztRQUM1QixDQUFDLElBQUksQ0FBQztRQUNOLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztRQUNWLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ3RCLENBQUMsR0FBRyxDQUFDO1FBQ0wsQ0FBQyxHQUFHLENBQUM7S0FDTCxDQUNELENBQUM7SUFDRixJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDM0IsS0FBSyxJQUFJLElBQUksSUFBSSxLQUFLLEVBQUU7UUFDdkIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0tBQ3BDO0lBRUQsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ3ZCLENBQUM7QUFBQSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiZnVuY3Rpb24gaW50ZXJuYWwoKTogRXJyb3Ige1xuICAgIHJldHVybiBuZXcgRXJyb3IoXCJpbnRlcm5hbCBlcnJvclwiKTtcbn07XG5cbmZ1bmN0aW9uIHBvc2l0aW9uRXJyb3IocG9zOiBQb3NpdGlvbiwgbWVzc2FnZTogc3RyaW5nKTogRXJyb3Ige1xuXHRyZXR1cm4gbmV3IEVycm9yKGAke3Bvcy5wYXRofXwke3Bvcy5saW5lfSBjb2wgJHtwb3MuY29sdW1ufXwgJHttZXNzYWdlfWApO1xufVxuXG50eXBlIFJlZiA9IHtcblx0a2luZDogXCJyZWZcIjtcblx0dmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgQXRvbSA9IHtcblx0a2luZDogXCJhdG9tXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIFFTeW1ib2wgPSB7XG5cdGtpbmQ6IFwic3ltYm9sXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIFFOdW1iZXIgPSB7XG5cdGtpbmQ6IFwibnVtYmVyXCI7XG5cdHZhbHVlOiBiaWdpbnQ7XG59O1xuXG50eXBlIFFTdHJpbmcgPSB7XG5cdGtpbmQ6IFwic3RyaW5nXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIE9wZW5CcmFja2V0ID0ge1xuXHRraW5kOiBcIihcIjtcbn07XG5cbnR5cGUgQ2xvc2VkQnJhY2tldCA9IHtcblx0a2luZDogXCIpXCI7XG59O1xuXG50eXBlIE9wZW5DdXJseSA9IHtcblx0a2luZDogXCJ7XCI7XG59O1xuXG50eXBlIENsb3NlZEN1cmx5ID0ge1xuXHRraW5kOiBcIn1cIjtcbn07XG5cbnR5cGUgT3BlblNxdWFyZSA9IHtcblx0a2luZDogXCJbXCI7XG59O1xuXG50eXBlIENsb3NlZFNxdWFyZSA9IHtcblx0a2luZDogXCJdXCI7XG59O1xuXG50eXBlIEVuZE9mTGluZSA9IHtcblx0a2luZDogXCJlb2xcIjtcbn07XG5cbnR5cGUgVW5pdCA9IHtcblx0a2luZDogXCJ1bml0XCI7XG59XG5cbnR5cGUgQ2FsbGFibGUgPSAoUmVmIHwgQmxvY2sgfCBDYWxsKSAmIFBvc2l0aW9uO1xuXG50eXBlIENhbGwgPSB7XG5cdGtpbmQ6IFwiY2FsbFwiO1xuXHRmaXJzdDogQ2FsbGFibGU7XG5cdGFyZ3VtZW50czogRXhwcmVzc2lvbltdO1xufVxuXG50eXBlIExpc3QgPSB7XG5cdGtpbmQ6IFwibGlzdFwiO1xuXHRlbGVtZW50czogRXhwcmVzc2lvbltdO1xufVxuXG50eXBlIEJsb2NrID0ge1xuXHRraW5kOiBcImJsb2NrXCI7XG5cdGV4cHJlc3Npb25zOiBFeHByZXNzaW9uW107XG59XG5cbnR5cGUgVG9rZW5LaW5kID1cblx0fCBSZWZcblx0fCBBdG9tXG5cdHwgUVN5bWJvbFxuXHR8IFFOdW1iZXJcblx0fCBRU3RyaW5nXG5cdHwgT3BlbkJyYWNrZXRcblx0fCBDbG9zZWRCcmFja2V0XG5cdHwgT3BlbkN1cmx5XG5cdHwgQ2xvc2VkQ3VybHlcblx0fCBPcGVuU3F1YXJlXG5cdHwgQ2xvc2VkU3F1YXJlXG5cdHwgRW5kT2ZMaW5lO1xuXG50eXBlIEV4cHJlc3Npb25LaW5kID1cblx0fCBSZWZcblx0fCBBdG9tXG5cdHwgUU51bWJlclxuXHR8IFFTdHJpbmdcblx0fCBVbml0XG5cdHwgQ2FsbFxuXHR8IExpc3Rcblx0fCBCbG9jaztcblxudHlwZSBQb3NpdGlvbiA9IHtcblx0cGF0aDogc3RyaW5nO1xuXHRsaW5lOiBudW1iZXI7XG5cdGNvbHVtbjogbnVtYmVyO1xufTtcblxudHlwZSBUb2tlbiA9IFRva2VuS2luZCAmIFBvc2l0aW9uO1xuXG50eXBlIEV4cHJlc3Npb24gPSBFeHByZXNzaW9uS2luZCAmIFBvc2l0aW9uO1xuXG5mdW5jdGlvbiBuZXdFeHByZXNzaW9uKHBvczogUG9zaXRpb24sIGV4cHI6IEV4cHJlc3Npb25LaW5kKTogRXhwcmVzc2lvbiB7XG5cdHJldHVybiB7Li4uZXhwciwgcGF0aDogcG9zLnBhdGgsIGxpbmU6IHBvcy5saW5lLCBjb2x1bW46IHBvcy5jb2x1bW59O1xufVxuXG4vLyBUT0RPOiBzdXBwb3J0IG5vbiBhc2NpaVxuXG5mdW5jdGlvbiBpc1NwYWNlKGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15cXHMkLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNJZGVudFN0YXJ0KGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15bYS16QS1aX10kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNJZGVudChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eWzAtOWEtekEtWl9dJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzUmVzZXJ2ZWRTeW1ib2woY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBbJ1wiJywgXCInXCIsICcoJywgJyknLCAneycsICd9JywgJ1snLCAnXScsICcjJ10uaW5jbHVkZXMoY2hhcik7XG59O1xuXG5mdW5jdGlvbiBpc1N5bWJvbChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGlzUmVzZXJ2ZWRTeW1ib2woY2hhcikgfHwgKGNoYXIgPT0gJ18nKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fTtcblx0cmV0dXJuIC9eW1xcdTAwMjEtXFx1MDAyRlxcdTAwM0EtXFx1MDA0MFxcdTAwNUItXFx1MDA2MFxcdTAwN0ItXFx1MDA3RV0kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNOdW1iZXJTdGFydChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eWzAtOV0kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNOdW1iZXIoY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlswLTlfXSQvLnRlc3QoY2hhcik7XG59O1xuXG5jbGFzcyBMZXhlciBpbXBsZW1lbnRzIEl0ZXJhYmxlPFRva2VuPiB7XG5cdHBhdGg6IHN0cmluZztcblx0Y2hhcnM6IEl0ZXJhdG9yPHN0cmluZz47XG5cdGxhc3RDaGFyOiB7Y2hhcjogc3RyaW5nLCB1c2U6IGJvb2xlYW59IHwgbnVsbCA9IG51bGw7XG5cdGxpbmUgPSAxO1xuXHRjb2x1bW4gPSAxO1xuXHRsYXN0TmV3bGluZSA9IGZhbHNlO1xuXG5cdGxhc3RUb2tlbjoge3Rva2VuOiBUb2tlbiwgdXNlOiBib29sZWFufSB8IG51bGwgPSBudWxsO1xuXHRmaW5pc2hlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgYnlDaGFyOiBJdGVyYWJsZTxzdHJpbmc+KSB7XG5cdFx0dGhpcy5wYXRoID0gcGF0aDtcblx0XHR0aGlzLmNoYXJzID0gYnlDaGFyW1N5bWJvbC5pdGVyYXRvcl0oKTtcblx0fVxuXG5cdG5leHRDaGFyKCk6IHtjaGFyOiBzdHJpbmcsIGxpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXJ9IHwgbnVsbCB7XG5cdFx0bGV0IGNoYXI6IHN0cmluZztcblx0XHRpZiAodGhpcy5sYXN0Q2hhciAmJiB0aGlzLmxhc3RDaGFyLnVzZSkge1xuXHRcdFx0dGhpcy5sYXN0Q2hhci51c2UgPSBmYWxzZTtcblx0XHRcdGNoYXIgPSB0aGlzLmxhc3RDaGFyLmNoYXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCB7ZG9uZSwgdmFsdWV9ID0gdGhpcy5jaGFycy5uZXh0KCk7XG5cdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH07XG5cdFx0XHRjaGFyID0gdmFsdWU7XG5cdFx0fTtcblx0XHR0aGlzLmxhc3RDaGFyID0ge2NoYXIsIHVzZTogZmFsc2V9O1xuXG5cdFx0aWYgKGNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdGlmICh0aGlzLmxhc3ROZXdsaW5lKSB7XG5cdFx0XHRcdHRoaXMuY29sdW1uID0gMTtcblx0XHRcdFx0cmV0dXJuIHtjaGFyLCBsaW5lOiB0aGlzLmxpbmUrKywgY29sdW1uOiB0aGlzLmNvbHVtbn07IFxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7Y2hhciwgbGluZTogdGhpcy5saW5lKyssIGNvbHVtbjogdGhpcy5jb2x1bW59OyBcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLmxhc3ROZXdsaW5lKSB7XG5cdFx0XHRcdHRoaXMuY29sdW1uID0gMjtcblx0XHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSwgY29sdW1uOiAxfTsgXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSwgY29sdW1uOiB0aGlzLmNvbHVtbisrfTsgXG5cdFx0XHR9O1xuXHRcdH07XG5cdH07XG5cblx0dW5yZWFkQ2hhcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGFzdENoYXIgfHwgdGhpcy5sYXN0Q2hhci51c2UpIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fTtcblx0XHR0aGlzLmxhc3RDaGFyLnVzZSA9IHRydWU7XG5cdFx0aWYgKHRoaXMubGFzdE5ld2xpbmUpIHtcblx0XHRcdHRoaXMubGluZS0tO1xuXHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbHVtbi0tO1xuXHRcdH07XG5cdH07XG5cblx0dGFrZVdoaWxlKHByZWRpY2F0ZTogKGNoYXI6IHN0cmluZykgPT4gYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0bGV0IHN0ciA9IFwiXCI7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBjaGFyID0gdGhpcy5uZXh0Q2hhcigpPy5jaGFyO1xuXHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdHJldHVybiBzdHI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByZWRpY2F0ZShjaGFyKSkge1xuXHRcdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdFx0cmV0dXJuIHN0cjtcblx0XHRcdH07XG5cdFx0XHRzdHIgKz0gY2hhcjtcblx0XHR9O1xuXHR9O1xuXG5cdGZpbmlzaGluZ0VvbCgpOiBUb2tlbiB7XG5cdFx0dGhpcy5maW5pc2hlZCA9IHRydWU7XG5cdFx0cmV0dXJuIHsgcGF0aDogdGhpcy5wYXRoLCBsaW5lOiB0aGlzLmxpbmUsIGNvbHVtbjogdGhpcy5jb2x1bW4sIGtpbmQ6IFwiZW9sXCIgfVxuXHR9O1xuXG5cdHdpdGhQb3NpdGlvbihwb3NpdGlvbjoge2xpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXJ9LCBraW5kOiBUb2tlbktpbmQpOiBUb2tlbiB7XG5cdFx0cmV0dXJuIHsgcGF0aDogdGhpcy5wYXRoLCBsaW5lOiBwb3NpdGlvbi5saW5lLCBjb2x1bW46IHBvc2l0aW9uLmNvbHVtbiwgLi4ua2luZCB9XG5cdH07XG5cblx0bmV4dFRva2VuKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMubGFzdFRva2VuICYmIHRoaXMubGFzdFRva2VuLnVzZSkge1xuXHRcdFx0dGhpcy5sYXN0VG9rZW4udXNlID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4gdGhpcy5sYXN0VG9rZW4udG9rZW47XG5cdFx0fVxuXHRcdGxldCB0b2tlbiA9IHRoaXMuZ2V0TmV4dFRva2VuKCk7XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHRoaXMubGFzdFRva2VuID0ge3Rva2VuLCB1c2U6IGZhbHNlfTtcblx0XHRyZXR1cm4gdG9rZW47XG5cdH1cblxuXHRnZXROZXh0VG9rZW4oKTogVG9rZW4gfCBudWxsIHtcblx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdGlmICghdGhpcy5maW5pc2hlZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9O1xuXG5cdFx0aWYgKGlzU3BhY2UoY2hhci5jaGFyKSkge1xuXHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXFxuJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oY2hhciwge2tpbmQ6IFwiZW9sXCJ9KTtcblx0XHRcdH07XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjaGFyID0gdGhpcy5uZXh0Q2hhcigpO1xuXHRcdFx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKCFpc1NwYWNlKGNoYXIuY2hhcikpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXFxuJykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihjaGFyLCB7a2luZDogXCJlb2xcIn0pOztcblx0XHRcdFx0fTtcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGxldCBzdGFydCA9IGNoYXI7XG5cdFx0aWYgKGlzUmVzZXJ2ZWRTeW1ib2woY2hhci5jaGFyKSkge1xuXHRcdFx0c3dpdGNoIChjaGFyLmNoYXIpIHtcblx0XHRcdGNhc2UgJ1wiJzpcblx0XHRcdFx0bGV0IHN0ciA9IFwiXCI7XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3N0cmluZyBub3QgY2xvc2VkIHdpdGggXCInKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXCInKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcInN0cmluZ1wiLCB2YWx1ZTogc3RyfSk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAoY2hhci5jaGFyICE9ICdcXHInKSB7XG5cdFx0XHRcdFx0XHRzdHIgKz0gY2hhci5jaGFyO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIFwiJ1wiOlxuXHRcdFx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRcdFx0aWYgKCFjaGFyIHx8ICFpc0lkZW50U3RhcnQoY2hhci5jaGFyKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcImJhcmUgJ1wiKVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJhdG9tXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc0lkZW50KX0pO1xuXHRcdFx0Y2FzZSAnKCc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiKFwifSk7XG5cdFx0XHRjYXNlICcpJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCIpXCJ9KTtcblx0XHRcdGNhc2UgJ3snOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIntcIn0pO1xuXHRcdFx0Y2FzZSAnfSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwifVwifSk7XG5cdFx0XHRjYXNlICdbJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJbXCJ9KTtcblx0XHRcdGNhc2UgJ10nOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIl1cIn0pO1xuXHRcdFx0Y2FzZSAnIyc6XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGlmIChjaGFyLmNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihjaGFyLCB7a2luZDogXCJlb2xcIn0pO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKGlzSWRlbnRTdGFydChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwicmVmXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc0lkZW50KX0pO1xuXHRcdH0gZWxzZSBpZiAoaXNOdW1iZXJTdGFydChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdGxldCBudW0gPSB0aGlzLnRha2VXaGlsZShpc051bWJlcikucmVwbGFjZShcIl9cIiwgXCJcIik7XG5cdFx0XHRpZiAoKG51bS5sZW5ndGggPiAxKSAmJiBudW1bMF0gPT0gJzAnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgemVybyBwYWRkZWQgbnVtYmVyICR7bnVtfWApXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJudW1iZXJcIiwgdmFsdWU6IEJpZ0ludChudW0pfSk7XG5cdFx0fSBlbHNlIGlmIChpc1N5bWJvbChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwic3ltYm9sXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc1N5bWJvbCl9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVE9ETzogcXVvdGUgY2hhciB3aGVuIG5lY2Vzc2FyeVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGB1bmtub3duIGNoYXJhY3RlciAke2NoYXJ9YCk7XG5cdFx0fTtcblx0fTtcblxuXHR1bnJlYWRUb2tlbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGFzdFRva2VuIHx8IHRoaXMubGFzdFRva2VuLnVzZSkge1xuXHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHR9O1xuXHRcdHRoaXMubGFzdFRva2VuLnVzZSA9IHRydWU7XG5cdH07XG5cblx0cGVla1Rva2VuKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0bGV0IHRva2VuID0gdGhpcy5uZXh0VG9rZW4oKTtcblx0XHR0aGlzLnVucmVhZFRva2VuKCk7XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9XG5cblx0bXVzdE5leHRUb2tlbih0az86IFRva2VuS2luZCk6IFRva2VuIHtcblx0XHRsZXQgdG9rZW4gPSB0aGlzLm5leHRUb2tlbigpO1xuXHRcdGlmICghdG9rZW4gfHwgKHRrICYmIHRva2VuLmtpbmQgIT09IHRrLmtpbmQpKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9rZW47XG5cdH1cblxuXHRbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYXRvcjxUb2tlbj4ge1xuXHRcdHJldHVybiBuZXcgVG9rZW5JdGVyYXRvcih0aGlzKTtcblx0fTtcbn07XG5cbmNsYXNzIFRva2VuSXRlcmF0b3IgaW1wbGVtZW50cyBJdGVyYXRvcjxUb2tlbj4ge1xuXHRsZXhlcjogTGV4ZXI7XG5cblx0Y29uc3RydWN0b3IobGV4ZXI6IExleGVyKSB7XG5cdFx0dGhpcy5sZXhlciA9IGxleGVyO1xuXHR9O1xuXG5cdG5leHQoKTogSXRlcmF0b3JSZXN1bHQ8VG9rZW4+IHtcblx0XHRsZXQgdG9rZW4gPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdC8vIHRoZSB0eXBlIG9mIEl0ZXJhdG9yIHJlcXVpcmVzIHRoYXQgd2UgYWx3YXlzIHJldHVybiBhIHZhbGlkIFRva2VuXG5cdFx0XHQvLyBzbyB3ZSByZXR1cm4gZW9sIGhlcmVcblx0XHRcdHJldHVybiB7ZG9uZTogdHJ1ZSwgdmFsdWU6IHtraW5kOiBcImVvbFwifX07XG5cdFx0fTtcblx0XHRyZXR1cm4ge2RvbmU6IGZhbHNlLCB2YWx1ZTogdG9rZW59O1xuXHR9O1xufTtcblxuZnVuY3Rpb24gY29sbGFwc2VFeHByZXNzaW9ucyhwb3M6IFBvc2l0aW9uLCBleHByczogRXhwcmVzc2lvbltdKTogRXhwcmVzc2lvbiB7XG5cdHN3aXRjaCAoZXhwcnMubGVuZ3RoKSB7XG5cdFx0Y2FzZSAwOlxuXHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24ocG9zLCB7a2luZDogXCJ1bml0XCJ9KTtcblx0XHRjYXNlIDE6XG5cdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihwb3MsIGV4cHJzWzBdISk7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdGxldCBmaXJzdCA9IGV4cHJzWzBdITtcblx0XHRcdGlmIChmaXJzdC5raW5kICE9PSBcInJlZlwiXG5cdFx0XHRcdCYmIGZpcnN0LmtpbmQgIT09IFwiYmxvY2tcIlxuXHRcdFx0XHQmJiBmaXJzdC5raW5kICE9PSBcImNhbGxcIlxuXHRcdFx0KSB7XG5cdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IoZmlyc3QsIFwiY2FuIG9ubHkgY2FsbCBpZGVudCwgYmxvY2sgb3IgY2FsbFwiKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKFxuXHRcdFx0XHRwb3MsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiBcImNhbGxcIixcblx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRhcmd1bWVudHM6IGV4cHJzLnNsaWNlKDEpLFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHR9XG59XG5cbnR5cGUgVmFsdWVPclN5bWJvbCA9IEV4cHJlc3Npb24gfCBRU3ltYm9sJlBvc2l0aW9uO1xuXG5pbnRlcmZhY2UgUHJlY2VkZW5jZVRhYmxlIHsgW2tleTogc3RyaW5nXTogbnVtYmVyOyB9O1xuXG5mdW5jdGlvbiBuZXdQcmVjZWRlbmNlVGFibGUodGFibGU6IHN0cmluZ1tdW10sIGZhY3RvcjogbnVtYmVyKTogUHJlY2VkZW5jZVRhYmxlIHtcblx0bGV0IHByZWM6IFByZWNlZGVuY2VUYWJsZSA9IHt9O1xuXHR0YWJsZS5mb3JFYWNoKChsZXZlbCwgaSkgPT4gbGV2ZWwuZm9yRWFjaChzeW1ib2wgPT4gcHJlY1tzeW1ib2xdID0gKGkgKyAxKSAqIGZhY3RvcikpO1xuXHRyZXR1cm4gcHJlYztcbn1cblxuY2xhc3MgUGFyc2VyIHtcblx0bGV4ZXI6IExleGVyO1xuXHRwcmVjZWRlbmNlVGFibGU6IFByZWNlZGVuY2VUYWJsZTtcblxuXHQvLyBUT0RPOiBjaGVjayBkdXBsaWNhdGUgc3ltYm9sc1xuXHRjb25zdHJ1Y3RvcihsZXhlcjogTGV4ZXIsIGxvd2VyVGhhbkNhbGw6IHN0cmluZ1tdW10sIGhpZ2hlclRoYW5DYWxsOiBzdHJpbmdbXVtdKSB7XG5cdFx0dGhpcy5sZXhlciA9IGxleGVyO1xuXHRcdHRoaXMucHJlY2VkZW5jZVRhYmxlID0ge1xuXHRcdFx0Li4ubmV3UHJlY2VkZW5jZVRhYmxlKGxvd2VyVGhhbkNhbGwsIC0xKSxcblx0XHRcdFwiY2FsbFwiOiAwLFxuXHRcdFx0Li4ubmV3UHJlY2VkZW5jZVRhYmxlKGhpZ2hlclRoYW5DYWxsLCAxKVxuXHRcdH07XG5cdH1cblxuXHRwYXJzZSgpOiBFeHByZXNzaW9uW10ge1xuXHRcdGxldCBleHByZXNzaW9ucyA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgc3RhcnQgPSB0aGlzLmxleGVyLnBlZWtUb2tlbigpO1xuXHRcdFx0aWYgKCFzdGFydCkge1xuXHRcdFx0XHRyZXR1cm4gZXhwcmVzc2lvbnM7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdmFsdWVzT3JTeW1ib2xzOiBWYWx1ZU9yU3ltYm9sW10gPSBbXTtcblx0XHRcdHdoaWxlKHRydWUpIHtcblx0XHRcdFx0bGV0IG5leHQgPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwiZW9sXCIpIHtcblx0XHRcdFx0XHRpZiAodmFsdWVzT3JTeW1ib2xzW3ZhbHVlc09yU3ltYm9scy5sZW5ndGgtMV0/LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZXNPclN5bWJvbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRleHByZXNzaW9ucy5wdXNoKHRoaXMuY29sbGFwc2Uoc3RhcnQsIHZhbHVlc09yU3ltYm9scykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNhbGxPclZhbHVlKCk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBvcGVuQnJhY2tldCA9IHRoaXMubGV4ZXIubXVzdE5leHRUb2tlbih7a2luZDogJygnfSk7XG5cdFx0bGV0IHZhbHVlc09yU3ltYm9sczogVmFsdWVPclN5bWJvbFtdID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJleHBlY3RlZCAnKScsIGdvdCBlb2ZcIik7XG5cdFx0XHR9XG5cdFx0XHRpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwiKVwiKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2gobmV4dCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNvbGxhcHNlKG9wZW5CcmFja2V0LCB2YWx1ZXNPclN5bWJvbHMpO1xuXHR9XG5cblx0Ly8gVE9ETzogYWxsb3cgc3ltYm9scyB3aXRoIGhpZ2hlciBwcmVjZWRlbmNlIHRoYW4gY2FsbCBpbiBsaXN0c1xuXHRsaXN0KCk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBvcGVuU3F1YXJlID0gdGhpcy5sZXhlci5tdXN0TmV4dFRva2VuKHtraW5kOiBcIltcIn0pO1xuXHRcdGxldCBlbGVtZW50czogRXhwcmVzc2lvbltdID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJleHBlY3RlZCAnXScsIGdvdCBlb2ZcIik7XG5cdFx0XHR9XG5cdFx0XHRpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwiXVwiKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXdFeHByZXNzaW9uKG9wZW5TcXVhcmUsIHtraW5kOiBcImxpc3RcIiwgZWxlbWVudHN9KTtcblx0fVxuXG5cdGJsb2NrKCk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBvcGVuQ3VybHkgPSB0aGlzLmxleGVyLm11c3ROZXh0VG9rZW4oe2tpbmQ6IFwie1wifSk7XG5cdFx0bGV0IGV4cHJlc3Npb25zID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBzdGFydCA9IHRoaXMubGV4ZXIucGVla1Rva2VuKCk7XG5cdFx0XHRsZXQgdmFsdWVzT3JTeW1ib2xzOiBWYWx1ZU9yU3ltYm9sW10gPSBbXTtcblx0XHRcdHdoaWxlKHRydWUpIHtcblx0XHRcdFx0bGV0IG5leHQgPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJleHBlY3RlZCAnfScsIGdvdCBlb2ZcIik7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlc09yU3ltYm9sc1t2YWx1ZXNPclN5bWJvbHMubGVuZ3RoLTFdPy5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJ9XCIpIHtcblx0XHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZXNPclN5bWJvbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRleHByZXNzaW9ucy5wdXNoKHRoaXMuY29sbGFwc2Uoc3RhcnQhLCB2YWx1ZXNPclN5bWJvbHMpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmxleGVyLm11c3ROZXh0VG9rZW4oKS5raW5kID09PSAnfScpIHtcblx0XHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24ob3BlbkN1cmx5LCB7a2luZDogXCJibG9ja1wiLCBleHByZXNzaW9uc30pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHZhbHVlKCk6IEV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJ1bmV4cGVjdGVkIGVvZlwiKTtcblx0XHR9IGVsc2UgaWYgKFsnKScsICddJywgJ30nLCBcImVvbFwiXS5pbmNsdWRlcyh0b2tlbi5raW5kKSkge1xuXHRcdFx0dGhyb3cgcG9zaXRpb25FcnJvcih0b2tlbiwgYHVuZXhwZWN0ZWQgJHt0b2tlbi5raW5kfWApXG5cdFx0fSBlbHNlIGlmIChbXCJzdHJpbmdcIiwgXCJudW1iZXJcIiwgXCJyZWZcIiwgXCJhdG9tXCJdLmluY2x1ZGVzKHRva2VuLmtpbmQpKSB7XG5cdFx0XHRyZXR1cm4gdG9rZW4gYXMgRXhwcmVzc2lvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3dpdGNoICh0b2tlbi5raW5kKSB7XG5cdFx0XHRjYXNlIFwic3ltYm9sXCI6XG5cdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IodG9rZW4sIGB1bmV4cGVjdGVkIHN5bWJvbCAke3Rva2VuLnZhbHVlfWApO1xuXHRcdFx0Y2FzZSAnKCc6XG5cdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY2FsbE9yVmFsdWUoKTtcblx0XHRcdGNhc2UgJ3snOlxuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmJsb2NrKCk7XG5cdFx0XHRjYXNlICdbJzpcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5saXN0KCk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbGxhcHNlKHN0YXJ0OiBQb3NpdGlvbiwgdmFsc09yU3ltczogVmFsdWVPclN5bWJvbFtdKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IHBhcnNlciA9IG5ldyBPcGVyYXRvclBhcnNlcihzdGFydCwgdGhpcy5wcmVjZWRlbmNlVGFibGUsIHZhbHNPclN5bXMpO1xuXHRcdHJldHVybiBwYXJzZXIucGFyc2UoKTtcblx0fVxufVxuXG5jbGFzcyBPcGVyYXRvclBhcnNlciB7XG5cdHN0YXJ0OiBQb3NpdGlvbjtcblx0cHJlY2VkZW5jZVRhYmxlOiBQcmVjZWRlbmNlVGFibGU7XG5cdHZhbHNPclN5bXM6IFZhbHVlT3JTeW1ib2xbXTtcblx0cG9zaXRpb24gPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHN0YXJ0OiBQb3NpdGlvbiwgcHJlY2VkZW5jZVRhYmxlOiBQcmVjZWRlbmNlVGFibGUsIHZhbHNPclN5bXM6IFZhbHVlT3JTeW1ib2xbXSkge1xuXHRcdGlmICh2YWxzT3JTeW1zWzBdPy5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRsZXQgc3ltID0gdmFsc09yU3ltc1swXTtcblx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3Ioc3ltLCBgdW5leHBlY3RlZCBzeW1ib2wgJHtzeW0udmFsdWV9YCk7XG5cdFx0fVxuXHRcdGxldCBsYXN0U3ltID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgdmFsT3JTeW0gb2YgdmFsc09yU3ltcykge1xuXHRcdFx0aWYgKHZhbE9yU3ltLmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0aWYgKGxhc3RTeW0pIHtcblx0XHRcdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKFxuXHRcdFx0XHRcdFx0dmFsT3JTeW0sXG5cdFx0XHRcdFx0XHRgc3ltYm9sICR7dmFsT3JTeW0udmFsdWV9IGRpcmVjdGx5IGZvbGxvd3MgYW5vdGhlciBzeW1ib2xgLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCEodmFsT3JTeW0udmFsdWUgaW4gcHJlY2VkZW5jZVRhYmxlKSkge1xuXHRcdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IoXG5cdFx0XHRcdFx0XHR2YWxPclN5bSxcblx0XHRcdFx0XHRcdGB1bmtub3duIG9wZXJhdG9yICR7dmFsT3JTeW0udmFsdWV9YFxuXHRcdFx0XHRcdClcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0U3ltID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhc3RTeW0gPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHZhbHNPclN5bXNbdmFsc09yU3ltcy5sZW5ndGggLSAxXT8ua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0bGV0IHN5bSA9IHZhbHNPclN5bXNbdmFsc09yU3ltcy5sZW5ndGggLSAxXSBhcyAoUVN5bWJvbCZQb3NpdGlvbik7XG5cdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKHN5bSwgYHVuZXhwZWN0ZWQgc3ltYm9sICR7c3ltLnZhbHVlfWApO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhcnQgPSBzdGFydDtcblx0XHR0aGlzLnByZWNlZGVuY2VUYWJsZSA9IHByZWNlZGVuY2VUYWJsZTtcblx0XHR0aGlzLnZhbHNPclN5bXMgPSB2YWxzT3JTeW1zO1xuXHR9XG5cblx0cHJlY2VkZW5jZShzeW06IFFTeW1ib2wpOiBudW1iZXIge1xuXHRcdGxldCBwcmVjID0gdGhpcy5wcmVjZWRlbmNlVGFibGVbc3ltLnZhbHVlXTtcblx0XHRpZiAocHJlYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJlYztcblx0fVxuXG5cdG5leHQoKTogVmFsdWVPclN5bWJvbCB8IG51bGwge1xuXHRcdGxldCBwb3NpdGlvbiA9IHRoaXMucG9zaXRpb247XG5cdFx0dGhpcy5wb3NpdGlvbisrO1xuXHRcdGlmIChwb3NpdGlvbiA+PSB0aGlzLnZhbHNPclN5bXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMudmFsc09yU3ltc1twb3NpdGlvbl0hO1xuXHRcdH1cblx0fVxuXG5cdHBlZWsoKTogVmFsdWVPclN5bWJvbCB8IG51bGwge1xuXHRcdGlmICh0aGlzLnBvc2l0aW9uID49IHRoaXMudmFsc09yU3ltcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy52YWxzT3JTeW1zW3RoaXMucG9zaXRpb25dITtcblx0XHR9XG5cdH1cblxuXHRza2lwKG46IG51bWJlcik6IHZvaWQge1xuXHRcdGxldCBuZXh0ID0gdGhpcy5wb3NpdGlvbiArIG47XG5cdFx0aWYgKG4gPT09IDAgfHwgbmV4dCA+IHRoaXMudmFsc09yU3ltcy5sZW5ndGggfHwgbmV4dCA8IDApIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fVxuXHRcdHRoaXMucG9zaXRpb24gPSBuZXh0O1xuXHR9XG5cblx0cGFyc2UoKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IGV4cHJzID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5uZXh0KCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbGxhcHNlRXhwcmVzc2lvbnModGhpcy5zdGFydCwgZXhwcnMpO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMub3BlcmF0b3JMb3dlcihcblx0XHRcdFx0XHRuZXh0LFxuXHRcdFx0XHRcdGNvbGxhcHNlRXhwcmVzc2lvbnMoZXhwcnNbMF0gPz8gdGhpcy5zdGFydCwgZXhwcnMpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IG9wID0gdGhpcy5vcGVyYXRvcihuZXh0KTtcblx0XHRcdFx0aWYgKCFvcCkge1xuXHRcdFx0XHRcdGV4cHJzLnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZXhwcnMucHVzaChvcCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvcGVyYXRvckxvd2VyKHN5bTogUVN5bWJvbCZQb3NpdGlvbiwgbGVmdDogRXhwcmVzc2lvbik6IEV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IGtpbmQgPSBcImNhbGxcIjtcblx0XHRsZXQgZmlyc3QgPSBuZXdFeHByZXNzaW9uKFxuXHRcdFx0c3ltLFxuXHRcdFx0eyBraW5kOiBcInJlZlwiLCB2YWx1ZTogc3ltLnZhbHVlIH0sXG5cdFx0KSBhcyBSZWYmUG9zaXRpb247XG5cdFx0bGV0IHJpZ2h0OiBFeHByZXNzaW9uW10gPSBbXTtcblx0XHRjb25zdCBjb2xsYXBzZVJpZ2h0ID0gKCk6IEV4cHJlc3Npb24gPT4ge1xuXHRcdFx0bGV0IHBvc2l0aW9uID0gcmlnaHRbMF07XG5cdFx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29sbGFwc2VFeHByZXNzaW9ucyhwb3NpdGlvbiwgcmlnaHQpO1xuXHRcdH07XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLm5leHQoKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihsZWZ0LCB7XG5cdFx0XHRcdFx0a2luZCxcblx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRhcmd1bWVudHM6IFtsZWZ0LCBjb2xsYXBzZVJpZ2h0KCldLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdGlmICh0aGlzLnByZWNlZGVuY2UobmV4dCkgPCB0aGlzLnByZWNlZGVuY2Uoc3ltKSkge1xuXHRcdFx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKGxlZnQsIHtcblx0XHRcdFx0XHRcdGtpbmQsXG5cdFx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW1xuXHRcdFx0XHRcdFx0XHRsZWZ0LFxuXHRcdFx0XHRcdFx0XHR0aGlzLm9wZXJhdG9yTG93ZXIoXG5cdFx0XHRcdFx0XHRcdFx0bmV4dCxcblx0XHRcdFx0XHRcdFx0XHRjb2xsYXBzZVJpZ2h0KCksXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMub3BlcmF0b3JMb3dlcihuZXh0LFxuXHRcdFx0XHRcdFx0bmV3RXhwcmVzc2lvbihsZWZ0LCB7XG5cdFx0XHRcdFx0XHRcdGtpbmQsXG5cdFx0XHRcdFx0XHRcdGZpcnN0LFxuXHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtsZWZ0LCBjb2xsYXBzZVJpZ2h0KCldLFxuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgb3AgPSB0aGlzLm9wZXJhdG9yKG5leHQpO1xuXHRcdFx0XHRpZiAoIW9wKSB7XG5cdFx0XHRcdFx0cmlnaHQucHVzaChuZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyaWdodC5wdXNoKG9wKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG9wZXJhdG9yKGxlZnQ6IEV4cHJlc3Npb24pOiBFeHByZXNzaW9uIHwgbnVsbCB7XG5cdFx0bGV0IHN5bSA9IHRoaXMubmV4dCgpO1xuXHRcdGlmICghc3ltIHx8IHN5bS5raW5kICE9PSBcInN5bWJvbFwiIHx8IHRoaXMucHJlY2VkZW5jZShzeW0pIDwgMCkge1xuXHRcdFx0dGhpcy5za2lwKC0xKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRsZXQgcmlnaHQgPSB0aGlzLm5leHQoKTtcblx0XHRpZiAoIXJpZ2h0IHx8IHJpZ2h0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGtpbmQgPSBcImNhbGxcIjtcblx0XHRsZXQgZmlyc3QgPSBuZXdFeHByZXNzaW9uKFxuXHRcdFx0c3ltLFxuXHRcdFx0e2tpbmQ6IFwicmVmXCIsIHZhbHVlOiBzeW0udmFsdWV9LFxuXHRcdCkgYXMgUmVmJlBvc2l0aW9uO1xuXHRcdGxldCBjdXJyZW50OiBDYWxsID0geyBraW5kLCBmaXJzdCwgYXJndW1lbnRzOiBbbGVmdCwgcmlnaHRdIH07XG5cdFx0bGV0IGN1cnJlbnRFeHByID0gbmV3RXhwcmVzc2lvbihsZWZ0LCBjdXJyZW50KTtcblxuXHRcdGxldCBuZXh0U3ltID0gdGhpcy5wZWVrKCk7XG5cdFx0aWYgKCFuZXh0U3ltIHx8IG5leHRTeW0ua2luZCAhPT0gXCJzeW1ib2xcIikge1xuXHRcdFx0cmV0dXJuIGN1cnJlbnRFeHByO1xuXHRcdH1cblx0XHRpZiAodGhpcy5wcmVjZWRlbmNlKG5leHRTeW0pID4gdGhpcy5wcmVjZWRlbmNlKHN5bSkpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5vcGVyYXRvcihyaWdodCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnRFeHByO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24obGVmdCwge2tpbmQsIGZpcnN0LCBhcmd1bWVudHM6IFtsZWZ0LCBuZXh0XX0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMub3BlcmF0b3IoY3VycmVudEV4cHIpO1xuXHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdHJldHVybiBjdXJyZW50RXhwcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXh0O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBleHByZXNzaW9uU3RyaW5nKGV4cHI6IEV4cHJlc3Npb24pOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGV4cHIua2luZCkge1xuXHRjYXNlIFwidW5pdFwiOlxuXHRcdHJldHVybiBcIigpXCI7XG5cdGNhc2UgXCJjYWxsXCI6XG5cdFx0bGV0IGZpcnN0ID0gZXhwcmVzc2lvblN0cmluZyhleHByLmZpcnN0KTtcblx0XHRpZiAoZXhwci5hcmd1bWVudHMubGVuZ3RoIDwgMSkge1xuXHRcdFx0cmV0dXJuIGAoJHtmaXJzdH0gKCkpYDtcblx0XHR9XG5cdFx0bGV0IGFyZ3MgPSBleHByLmFyZ3VtZW50cy5tYXAoYXJnID0+IGV4cHJlc3Npb25TdHJpbmcoYXJnKSkuam9pbihcIiBcIik7XG5cdFx0cmV0dXJuIGAoJHtmaXJzdH0gJHthcmdzfSlgO1xuXHRjYXNlIFwibGlzdFwiOlxuXHRcdGxldCBlbGVtZW50cyA9IGV4cHIuZWxlbWVudHMubWFwKGFyZyA9PiBleHByZXNzaW9uU3RyaW5nKGFyZykpLmpvaW4oXCIgXCIpO1xuXHRcdHJldHVybiBgWyR7ZWxlbWVudHN9XWA7XG5cdGNhc2UgXCJibG9ja1wiOlxuXHRcdGxldCBleHBycyA9IGV4cHIuZXhwcmVzc2lvbnMubWFwKGFyZyA9PiBleHByZXNzaW9uU3RyaW5nKGFyZykpLmpvaW4oXCJcXG5cIik7XG5cdFx0aWYgKGV4cHIuZXhwcmVzc2lvbnMubGVuZ3RoIDwgMikge1xuXHRcdFx0cmV0dXJuIGB7ICR7ZXhwcnN9IH1gO1xuXHRcdH1cblx0XHRyZXR1cm4gYHtcXG4ke2V4cHJzfVxcbn1gO1xuXHRkZWZhdWx0OlxuXHRcdHJldHVybiBleHByLnZhbHVlLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuY2xhc3MgTmFtZXNwYWNlPFQ+IGltcGxlbWVudHMgSXRlcmFibGU8W3N0cmluZywgVF0+e1xuXHRrZXk6IHN0cmluZztcblx0dmFsdWU6IFQ7XG5cdGxlZnQ6IE5hbWVzcGFjZTxUPiB8IG51bGwgPSBudWxsO1xuXHRyaWdodDogTmFtZXNwYWNlPFQ+IHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0a2V5OiBzdHJpbmcsXG5cdFx0dmFsdWU6IFQsXG5cdFx0bGVmdDogTmFtZXNwYWNlPFQ+IHwgbnVsbCxcblx0XHRyaWdodDogTmFtZXNwYWNlPFQ+IHwgbnVsbFxuXHQpIHtcblx0XHR0aGlzLmtleSA9IGtleTtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy5sZWZ0ID0gbGVmdDtcblx0XHR0aGlzLnJpZ2h0ID0gcmlnaHQ7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdGxldCBzdHIgPSBcIlwiO1xuXHRcdGlmICh0aGlzLmxlZnQpIHtcblx0XHRcdHN0ciArPSB0aGlzLmxlZnQudG9TdHJpbmcoKSArIFwiLCBcIjtcblx0XHR9XG5cdFx0c3RyICs9IGAke3RoaXMua2V5fTogJHt0aGlzLnZhbHVlfWA7XG5cdFx0aWYgKHRoaXMucmlnaHQpIHtcblx0XHRcdHN0ciArPSBcIiwgXCIgKyB0aGlzLnJpZ2h0LnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdHI7XG5cdH1cblxuXHRnZXQoa2V5OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMubXVzdEdldChrZXkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRtdXN0R2V0KGtleTogc3RyaW5nKTogVCB7XG5cdFx0bGV0IGN1cnJlbnQ6IE5hbWVzcGFjZTxUPiA9IHRoaXM7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGlmIChrZXkgPCBjdXJyZW50LmtleSkge1xuXHRcdFx0XHRpZiAoIWN1cnJlbnQubGVmdCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihga2V5ICR7a2V5fSBub3QgZm91bmRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXJyZW50ID0gY3VycmVudC5sZWZ0O1xuXHRcdFx0fSBlbHNlIGlmIChrZXkgPiBjdXJyZW50LmtleSkge1xuXHRcdFx0XHRpZiAoIWN1cnJlbnQucmlnaHQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGtleSAke2tleX0gbm90IGZvdW5kYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VycmVudCA9IGN1cnJlbnQucmlnaHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gY3VycmVudC52YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpbnNlcnQoa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogTmFtZXNwYWNlPFQ+IHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMubXVzdEluc2VydChrZXksIHZhbHVlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0bXVzdEluc2VydChrZXk6IHN0cmluZywgdmFsdWU6IFQpOiBOYW1lc3BhY2U8VD4ge1xuXHRcdGlmIChrZXkgPCB0aGlzLmtleSkge1xuXHRcdFx0aWYgKCF0aGlzLmxlZnQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2UoXG5cdFx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdFx0dGhpcy52YWx1ZSxcblx0XHRcdFx0XHRuZXcgTmFtZXNwYWNlKGtleSwgdmFsdWUsIG51bGwsIG51bGwpLFxuXHRcdFx0XHRcdHRoaXMucmlnaHQsXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IE5hbWVzcGFjZShcblx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdHRoaXMudmFsdWUsXG5cdFx0XHRcdHRoaXMubGVmdC5tdXN0SW5zZXJ0KGtleSwgdmFsdWUpLFxuXHRcdFx0XHR0aGlzLnJpZ2h0LFxuXHRcdFx0KTtcblx0XHR9IGVsc2UgaWYgKGtleSA+IHRoaXMua2V5KSB7XG5cdFx0XHRpZiAoIXRoaXMucmlnaHQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2UoXG5cdFx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdFx0dGhpcy52YWx1ZSxcblx0XHRcdFx0XHR0aGlzLmxlZnQsXG5cdFx0XHRcdFx0bmV3IE5hbWVzcGFjZShrZXksIHZhbHVlLCBudWxsLCBudWxsKSxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgTmFtZXNwYWNlKFxuXHRcdFx0XHR0aGlzLmtleSxcblx0XHRcdFx0dGhpcy52YWx1ZSxcblx0XHRcdFx0dGhpcy5sZWZ0LFxuXHRcdFx0XHR0aGlzLnJpZ2h0Lm11c3RJbnNlcnQoa2V5LCB2YWx1ZSksXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGR1cGxpY2F0ZSBrZXkgJHtrZXl9YClcblx0XHR9XG5cdH1cblxuXHRtdXN0SW5zZXJ0TWFueShvdGhlcjogTmFtZXNwYWNlPFQ+KTogTmFtZXNwYWNlPFQ+IHtcblx0XHRsZXQgY3VycmVudDogTmFtZXNwYWNlPFQ+ID0gdGhpcztcblx0XHRmb3IgKGxldCBba2V5LCB2YWx1ZV0gb2Ygb3RoZXIpIHtcblx0XHRcdGN1cnJlbnQgPSBjdXJyZW50Lm11c3RJbnNlcnQoa2V5LCB2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBjdXJyZW50O1xuXHR9XG5cblx0KltTeW1ib2wuaXRlcmF0b3JdKCk6IEl0ZXJhdG9yPFtzdHJpbmcsIFRdPiB7XG5cdFx0aWYgKHRoaXMubGVmdCkge1xuXHRcdFx0eWllbGQqIHRoaXMubGVmdDtcblx0XHR9XG5cdFx0eWllbGQgW3RoaXMua2V5LCB0aGlzLnZhbHVlXTtcblx0XHRpZiAodGhpcy5yaWdodCkge1xuXHRcdFx0eWllbGQqIHRoaXMucmlnaHQ7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEVtcHR5TmFtZXNwYWNlPFQ+IGltcGxlbWVudHMgSXRlcmFibGU8W3N0cmluZywgVF0+IHtcblx0Ly8gZHVtbXkgdmFsdWVzIHRvIG1ha2UgdGhlIHR5cGVjaGVja2VyIGhhcHB5XG5cdGtleTogc3RyaW5nID0gdW5kZWZpbmVkIGFzIGFueSBhcyBzdHJpbmc7XG5cdHZhbHVlOiBUID0gdW5kZWZpbmVkIGFzIGFueSBhcyBUO1xuXHRsZWZ0OiBOYW1lc3BhY2U8VD4gfCBudWxsID0gdW5kZWZpbmVkIGFzIGFueSBhcyBudWxsO1xuXHRyaWdodDogTmFtZXNwYWNlPFQ+IHwgbnVsbCA9IHVuZGVmaW5lZCBhcyBhbnkgYXMgbnVsbDtcblxuXHR0b1N0cmluZygpOiBzdHJpbmcgeyByZXR1cm4gXCJcIjsgfVxuXHRnZXQoX2tleTogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0bXVzdEdldChrZXk6IHN0cmluZyk6IFQgeyB0aHJvdyBga2V5ICR7a2V5fSBub3QgZm91bmRgOyB9XG5cdGluc2VydChrZXk6IHN0cmluZywgdmFsdWU6IFQpOiBOYW1lc3BhY2U8VD4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBuZXcgTmFtZXNwYWNlKGtleSwgdmFsdWUsIG51bGwsIG51bGwpO1xuXHR9XG5cdG11c3RJbnNlcnQoa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogTmFtZXNwYWNlPFQ+IHtcblx0XHRyZXR1cm4gbmV3IE5hbWVzcGFjZShrZXksIHZhbHVlLCBudWxsLCBudWxsKTtcblx0fVxuXHRtdXN0SW5zZXJ0TWFueShvdGhlcjogTmFtZXNwYWNlPFQ+KTogTmFtZXNwYWNlPFQ+IHtcblx0XHRsZXQgY3VycmVudDogTmFtZXNwYWNlPFQ+ID0gdGhpcztcblx0XHRmb3IgKGxldCBba2V5LCB2YWx1ZV0gb2Ygb3RoZXIpIHtcblx0XHRcdGN1cnJlbnQgPSBjdXJyZW50Lm11c3RJbnNlcnQoa2V5LCB2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBjdXJyZW50O1xuXHR9XG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYXRvcjxbc3RyaW5nLCBUXT4ge31cbn1cblxuY29uc3Qgb3VyTmFtZXNwYWNlID0gXCJvdXJOYW1lc3BhY2VcIjtcblxuY29uc3QgdGhlaXJOYW1lc3BhY2UgPSBcInRoZWlyTmFtZXNwYWNlXCI7XG5cbmNvbnN0IHVucGFja0FuZE1heWJlQWRkVG9PdXJzID0gXCJ1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc1wiO1xuXG5jb25zdCB1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc0ZuID0gYGNvbnN0ICR7dW5wYWNrQW5kTWF5YmVBZGRUb091cnN9ID0gKFtpbnNlcnRhYmxlLCByZXRdKSA9PiB7XG5cdGlmIChpbnNlcnRhYmxlKSB7XG5cdFx0JHtvdXJOYW1lc3BhY2V9ID0gJHtvdXJOYW1lc3BhY2V9Lm11c3RJbnNlcnRNYW55KGluc2VydGFibGUpO1xuXHR9XG5cdHJldHVybiByZXQ7XG59O2BcblxuY29uc3QgbmV3QXRvbSA9IFwibmV3QXRvbVwiO1xuXG5jb25zdCBuZXdMaXN0ID0gXCJuZXdMaXN0XCI7XG5cbmNvbnN0IG5ld0xpc3RGcm9tQXJncyA9IFwibmV3TGlzdEZyb21BcmdzXCI7XG5cbmNvbnN0IG5ld0Jsb2NrID0gXCJuZXdCbG9ja1wiO1xuXG5mdW5jdGlvbiBzdHJpbmdNYXAoc3RyOiBzdHJpbmcsIHByZWRpY2F0ZTogKGNoYXI6IHN0cmluZykgPT4gc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IG91dCA9IFwiXCI7XG5cdGZvciAobGV0IGNoYXIgb2Ygc3RyKSB7XG5cdFx0b3V0ICs9IHByZWRpY2F0ZShjaGFyKTtcblx0fVxuXHRyZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiB0b0phdmFzY3JpcHRTdHJpbmcoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgZXNjID0gc3RyaW5nTWFwKHN0ciwgY2hhciA9PiB7XG5cdFx0aWYgKGNoYXIgPT09IFwiXFxcXFwiKSB7XG5cdFx0XHRyZXR1cm4gXCJcXFxcXFxcXFwiO1xuXHRcdH0gZWxzZSBpZiAoY2hhciA9PT0gJ1wiJykge1xuXHRcdFx0cmV0dXJuICdcXFxcXCInO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gY2hhcjtcblx0XHR9XG5cdH0pO1xuXHRyZXR1cm4gYFwiJHtlc2N9XCJgO1xufVxuXG5jbGFzcyBDb21waWxlciB7XG5cdHZhck5hbWVzOiBOYW1lc3BhY2U8c3RyaW5nPjtcblx0Ym9keTogRXhwcmVzc2lvbltdO1xuXHR0ZW1wb3Jhcmllc0luZGV4OiBudW1iZXI7XG5cdGNvZGUgPSBcIlwiO1xuXG5cdGNvbnN0cnVjdG9yKHZhck5hbWVzOiBOYW1lc3BhY2U8c3RyaW5nPiwgYm9keTogRXhwcmVzc2lvbltdLCB0ZW1wb3Jhcmllc09mZnNldCA9IDApIHtcblx0XHR0aGlzLnZhck5hbWVzID0gdmFyTmFtZXM7XG5cdFx0dGhpcy5ib2R5ID0gYm9keTtcblx0XHR0aGlzLnRlbXBvcmFyaWVzSW5kZXggPSB0ZW1wb3Jhcmllc09mZnNldDtcblx0fVxuXG5cdGNvbXBpbGUoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5ib2R5Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5jb2RlID0gXCJyZXR1cm4gW251bGwsIG51bGxdO1wiXG5cdFx0fVxuXHRcdGlmICh0aGlzLmNvZGUgIT09IFwiXCIpIHtcblx0XHRcdHJldHVybiB0aGlzLmNvZGU7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmJvZHkubGVuZ3RoLTE7IGkrKykge1xuXHRcdFx0bGV0IGV4cHIgPSB0aGlzLmJvZHlbaV0hO1xuXHRcdFx0aWYgKGV4cHIua2luZCAhPT0gXCJjYWxsXCIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvZGUgKz0gdGhpcy5leHByKGV4cHIpICsgXCI7XCI7XG5cdFx0fVxuXHRcdGxldCBsYXN0ID0gdGhpcy5leHByKHRoaXMuYm9keVt0aGlzLmJvZHkubGVuZ3RoLTFdISk7XG5cdFx0dGhpcy5jb2RlICs9IGByZXR1cm4gW251bGwsICR7bGFzdH1dO2Bcblx0XHRyZXR1cm4gdGhpcy5jb2RlO1xuXHR9XG5cblx0ZXhwcihleHByOiBFeHByZXNzaW9uKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKGV4cHIua2luZCkge1xuXHRcdGNhc2UgXCJ1bml0XCI6XG5cdFx0XHRyZXR1cm4gXCJudWxsXCI7XG5cdFx0Y2FzZSBcIm51bWJlclwiOlxuXHRcdFx0cmV0dXJuIGAke2V4cHIudmFsdWV9bmA7XG5cdFx0Y2FzZSBcInN0cmluZ1wiOlxuXHRcdFx0cmV0dXJuIGAke3RvSmF2YXNjcmlwdFN0cmluZyhleHByLnZhbHVlKX1gXG5cdFx0Y2FzZSBcImF0b21cIjpcblx0XHRcdHJldHVybiBgKCR7bmV3QXRvbX0oJHt0b0phdmFzY3JpcHRTdHJpbmcoZXhwci52YWx1ZSl9KSlgO1xuXHRcdGNhc2UgXCJyZWZcIjpcblx0XHRcdHJldHVybiB0aGlzLnZhck5hbWVzLmdldChleHByLnZhbHVlKVxuXHRcdFx0XHQ/PyBgKCR7b3VyTmFtZXNwYWNlfS5tdXN0R2V0KCR7dG9KYXZhc2NyaXB0U3RyaW5nKGV4cHIudmFsdWUpfSkpYDtcblx0XHRjYXNlIFwiY2FsbFwiOlxuXHRcdFx0bGV0IGZpcnN0ID0gdGhpcy5leHByKGV4cHIuZmlyc3QpO1xuXHRcdFx0bGV0IGFyZ3MgPSBleHByLmFyZ3VtZW50cy5tYXAoYXJnID0+IHRoaXMuZXhwcihhcmcpKS5qb2luKFwiLCBcIik7XG5cdFx0XHRyZXR1cm4gYCgke3VucGFja0FuZE1heWJlQWRkVG9PdXJzfSgke2ZpcnN0fSgke291ck5hbWVzcGFjZX0sICR7YXJnc30pKSlgO1xuXHRcdGNhc2UgXCJsaXN0XCI6XG5cdFx0XHRsZXQgZWxlbWVudHMgPSBleHByLmVsZW1lbnRzLm1hcChlID0+IHRoaXMuZXhwcihlKSkuam9pbihcIiwgXCIpO1xuXHRcdFx0cmV0dXJuIGAoJHtuZXdMaXN0fSgke2VsZW1lbnRzfSkpYDtcblx0XHRjYXNlIFwiYmxvY2tcIjpcblx0XHRcdGxldCBjb250ZW50ID0gbmV3IENvbXBpbGVyKHRoaXMudmFyTmFtZXMsIGV4cHIuZXhwcmVzc2lvbnMpLmNvbXBpbGUoKTtcblx0XHRcdC8vIFRPRE86IGNoZWNrIGFyZyBsZW5ndGggPT09IDEgZm9yIGJhc2ljIGJsb2NrXG5cdFx0XHRyZXR1cm4gYCgke25ld0Jsb2NrfSgke291ck5hbWVzcGFjZX0sIGZ1bmN0aW9uKCR7dGhlaXJOYW1lc3BhY2V9LCAuLi5fKSB7XFxuYFxuXHRcdFx0XHQrIGBsZXQgJHtvdXJOYW1lc3BhY2V9ID0gdGhpcztcXG5gXG5cdFx0XHRcdCsgdW5wYWNrQW5kTWF5YmVBZGRUb091cnNGbiArICdcXG5cXG4nXG5cdFx0XHRcdCsgY29udGVudCArIFwiXFxufSkpXCI7XG5cdFx0fVxuXHR9XG59XG5cbi8vIFRPRE86IHBlcnNpc3RlbnQgYXJyYXlcbmNsYXNzIFJ1bnRpbWVMaXN0IHtcblx0ZWxlbWVudHM6IFJ1bnRpbWVUeXBlW107XG5cblx0Y29uc3RydWN0b3IoLi4uZWxlbWVudHM6IFJ1bnRpbWVUeXBlW10pIHtcblx0XHR0aGlzLmVsZW1lbnRzID0gZWxlbWVudHM7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBcIltcIiArIHRoaXMuZWxlbWVudHMubWFwKGUgPT4gcnVudGltZVR5cGVTdHJpbmcoZSkpLmpvaW4oXCIgXCIpICsgXCJdXCI7XG5cdH1cbn1cblxudHlwZSBSdW50aW1lVHlwZSA9IG51bGwgfCBiaWdpbnQgfCBzdHJpbmcgfCBBdG9tIHwgUnVudGltZUxpc3QgfCBSdW50aW1lQmxvY2s7XG5cbnR5cGUgUnVudGltZUJsb2NrID0gKG5zOiBOYW1lc3BhY2U8UnVudGltZVR5cGU+LCAuLi5hcmdzOiAoUnVudGltZVR5cGUgfCB1bmRlZmluZWQpW10pXG5cdD0+IFtOYW1lc3BhY2U8UnVudGltZVR5cGU+IHwgbnVsbCwgUnVudGltZVR5cGVdO1xuXG5mdW5jdGlvbiBydW50aW1lVHlwZVN0cmluZyh2OiBSdW50aW1lVHlwZSk6IHN0cmluZyB7XG5cdGlmICh2ID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIFwiKClcIjtcblx0fSBlbHNlIGlmICh0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0cmV0dXJuIFwiYmxvY2tcIjtcblx0fSBlbHNlIGlmICh0eXBlb2YgdiA9PT0gXCJvYmplY3RcIiAmJiAna2luZCcgaW4gdiAmJiB2LmtpbmQgPT09IFwiYXRvbVwiKSB7XG5cdFx0cmV0dXJuIGAoYXRvbSAke3RvSmF2YXNjcmlwdFN0cmluZyh2LnZhbHVlKX0pYDtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gdi50b1N0cmluZygpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHByaW50bG4oczogc3RyaW5nKSB7XG5cdGNvbnNvbGUubG9nKHMpO1xufVxuXG5mdW5jdGlvbiBjaGVja0FyZ3VtZW50TGVuZ3RoKGV4cGVjdGVkOiBudW1iZXIsIGdvdDogeyBsZW5ndGg6IG51bWJlcn0pOiB2b2lkIHtcblx0aWYgKGV4cGVjdGVkICE9PSBnb3QubGVuZ3RoLTEpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYGV4cGVjdGVkICR7ZXhwZWN0ZWR9IGFyZ3VtZW50cywgZ290ICR7Z290Lmxlbmd0aC0xfWApO1xuXHR9XG59XG5cbi8vIFRPRE86IGJldHRlciBlcnJvciBoYW5kbGluZ1xuZnVuY3Rpb24gYXJndW1lbnRFcnJvcigpOiBFcnJvciB7XG5cdHJldHVybiBuZXcgRXJyb3IoXCJiYWQgYXJndW1lbnQgdHlwZShzKVwiKTtcbn1cblxuY29uc3QgYnVpbHRpbkJsb2NrczogW3N0cmluZywgUnVudGltZUJsb2NrXVtdID0gW1xuXHRbXCIrXCIsIGZ1bmN0aW9uKF8sIHgsIHkpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiB4ICE9PSBcImJpZ2ludFwiIHx8IHR5cGVvZiB5ICE9PSBcImJpZ2ludFwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBbbnVsbCwgeCt5XTtcblx0fV0sXG5cdFtcInByaW50bG5cIiwgZnVuY3Rpb24oXywgLi4uYXJncykge1xuXHRcdHByaW50bG4oYXJncy5tYXAodiA9PiBydW50aW1lVHlwZVN0cmluZyh2ISkpLmpvaW4oXCIgXCIpKTtcblx0XHRyZXR1cm4gW251bGwsIG51bGxdO1xuXHR9XSxcbl07XG5cbmNvbnN0IGJ1aWx0aW5OYW1lc3BhY2UgPSBidWlsdGluQmxvY2tzLnJlZHVjZShcblx0KG5zOiBOYW1lc3BhY2U8UnVudGltZVR5cGU+LCBbc3RyLCBibG9ja10pID0+IHtcblx0XHRyZXR1cm4gbnMubXVzdEluc2VydChzdHIsIGJsb2NrKTtcblx0fSxcblx0bmV3IEVtcHR5TmFtZXNwYWNlPFJ1bnRpbWVUeXBlPigpLFxuKTtcblxuY29uc3QgaW50ZXJuYWxzOiB7IFtuYW1lOiBzdHJpbmddOiBGdW5jdGlvbiB9ID0ge1xuXHRbbmV3QXRvbV06ICh2YWx1ZTogc3RyaW5nKTogQXRvbSA9PiB7XG5cdFx0cmV0dXJuIHtraW5kOiBcImF0b21cIiwgdmFsdWV9O1xuXHR9LFxuXHRbbmV3TGlzdF06ICguLi5lbGVtZW50czogUnVudGltZVR5cGVbXSk6IFJ1bnRpbWVMaXN0ID0+IHtcblx0XHRyZXR1cm4gbmV3IFJ1bnRpbWVMaXN0KC4uLmVsZW1lbnRzKTtcblx0fSxcblx0W25ld0Jsb2NrXTogKG5zOiBOYW1lc3BhY2U8UnVudGltZVR5cGU+LCBibG9jazogUnVudGltZUJsb2NrKTogUnVudGltZUJsb2NrID0+IHtcblx0XHRyZXR1cm4gYmxvY2suYmluZChucyk7XG5cdH0sXG59O1xuXG5mdW5jdGlvbiBzdHJpbmdBbGwoc3RyOiBzdHJpbmcsIHByZWRpY2F0ZTogKGNoYXI6IHN0cmluZykgPT4gYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRmb3IgKGxldCBjaGFyIG9mIHN0cikge1xuXHRcdGlmICghcHJlZGljYXRlKGNoYXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBtdXN0U3RyaW5nRmlyc3Qoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRmb3IgKGxldCBjaGFyIG9mIHN0cikge1xuXHRcdHJldHVybiBjaGFyO1xuXHR9XG5cdHRocm93IG5ldyBFcnJvcihcImVtcHR5IHN0cmluZ1wiKTtcbn1cblxuY29uc3QgZXNjYXBlZFN5bWJvbHM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XG5cdFwiIVwiOiBcIkV4Y2xhbWF0aW9uTWFya1wiLFxuXHRcIiRcIjogXCJEb2xsYXJcIixcblx0XCIlXCI6IFwiUGVyY2VudFwiLFxuXHRcIiZcIjogXCJBbXBlcnNhbmRcIixcblx0XCIqXCI6IFwiQXN0ZXJpc2tcIixcblx0XCIrXCI6IFwiUGx1c1wiLFxuXHRcIixcIjogXCJDb21tYVwiLFxuXHRcIi1cIjogXCJNaW51c1wiLFxuXHRcIi5cIjogXCJQZXJpb2RcIixcblx0XCIvXCI6IFwiU2xhc2hcIixcblx0XCI6XCI6IFwiQ29sb25cIixcblx0XCI7XCI6IFwiU2VtaWNvbG9uXCIsXG5cdFwiPFwiOiBcIkxlc3NUaGFuXCIsXG5cdFwiPVwiOiBcIkVxdWFsaXR5U2lnblwiLFxuXHRcIj5cIjogXCJHcmVhdGVyVGhhblwiLFxuXHRcIj9cIjogXCJRdWVzdGlvbk1hcmtcIixcblx0XCJAXCI6IFwiQXRTaWduXCIsXG5cdFwiXFxcXFwiOiBcIkJhY2tzbGFzaFwiLFxuXHRcIl5cIjogXCJDYXJldFwiLFxuXHRcImBcIjogXCJBY2NlbnRcIixcblx0XCJ8XCI6IFwiVmVydGljYWxCYXJcIixcblx0XCJ+XCI6IFwiVGlsZGVcIixcbn07XG5cbmZ1bmN0aW9uIHRvSmF2YXNjcmlwdFZhck5hbWUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IGludGVybmFsKCk7XG5cdH1cblxuXHRpZiAoaXNJZGVudFN0YXJ0KG11c3RTdHJpbmdGaXJzdChzdHIpKSAmJiBzdHJpbmdBbGwoc3RyLCBpc0lkZW50KSkge1xuXHRcdC8vIFRPRE86IGNoZWNrIHN0aWxsIHZhbGlkIHdpdGggbm9uIGFzY2lpIGlkZW50c1xuXHRcdHJldHVybiBgaWRlbnRfJHtzdHJ9YDtcblx0fSBlbHNlIGlmIChzdHJpbmdBbGwoc3RyLCBpc1N5bWJvbCkpIHtcblx0XHRsZXQgZXNjYXBlZCA9IHN0cmluZ01hcChzdHIsIGNoYXIgPT4ge1xuXHRcdFx0bGV0IGVzYyA9IGVzY2FwZWRTeW1ib2xzW2NoYXJdO1xuXHRcdFx0aWYgKGVzYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBgVSR7Y2hhci5jb2RlUG9pbnRBdCgwKX1gO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGVzYztcblx0XHR9KVxuXHRcdHJldHVybiBgc3ltYm9sXyR7ZXNjYXBlZH1gO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IGludGVybmFsKCk7XG5cdH1cbn1cblxuY29uc3QgYnVpbHRpbk5hbWVzcGFjZVZhck5hbWVzID0gKCgpID0+IHtcblx0bGV0IG5zOiBOYW1lc3BhY2U8c3RyaW5nPiA9IG5ldyBFbXB0eU5hbWVzcGFjZTxzdHJpbmc+KCk7XG5cdGZvciAobGV0IFtuYW1lLCBfXSBvZiBidWlsdGluTmFtZXNwYWNlKSB7XG5cdFx0bnMgPSBucy5tdXN0SW5zZXJ0KG5hbWUsIHRvSmF2YXNjcmlwdFZhck5hbWUobmFtZSkpO1xuXHR9O1xuXHRyZXR1cm4gbnM7XG59KSgpO1xuXG5mdW5jdGlvbiBydW5FeHByZXNzaW9ucyhleHByczogRXhwcmVzc2lvbltdKTogdm9pZCB7XG5cdGxldCBjb2RlID0gXCIndXNlIHN0cmljdCc7XFxuXFxuXCI7XG5cdGNvbnN0IGludGVybmFsc05hbWUgPSBcImludGVybmFsc1wiO1xuXHRmb3IgKGxldCBuYW1lIGluIGludGVybmFscykge1xuXHRcdGNvZGUgKz0gYGNvbnN0ICR7bmFtZX0gPSAke2ludGVybmFsc05hbWV9LiR7bmFtZX07XFxuYDtcblx0fVxuXHRjb2RlICs9IFwiXFxuXCI7XG5cblx0Zm9yIChsZXQgW25hbWUsIHZhck5hbWVdIG9mIGJ1aWx0aW5OYW1lc3BhY2VWYXJOYW1lcykge1xuXHRcdGNvZGUgKz0gYGNvbnN0ICR7dmFyTmFtZX0gPSAke291ck5hbWVzcGFjZX0ubXVzdEdldCgke3RvSmF2YXNjcmlwdFN0cmluZyhuYW1lKX0pO1xcbmA7XG5cdH1cblx0Y29kZSArPSBgXFxuJHt1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc0ZufVxcblxcbmA7XG5cblx0Y29kZSArPSBuZXcgQ29tcGlsZXIoYnVpbHRpbk5hbWVzcGFjZVZhck5hbWVzLCBleHBycykuY29tcGlsZSgpO1xuXHRjb25zb2xlLmxvZyhjb2RlKTtcblx0bmV3IEZ1bmN0aW9uKGludGVybmFsc05hbWUsIG91ck5hbWVzcGFjZSwgY29kZSkoaW50ZXJuYWxzLCBidWlsdGluTmFtZXNwYWNlKTtcbn1cblxuZnVuY3Rpb24gcnVuKCkge1xuXHRsZXQgY29kZSA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvZGVcIikgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG5cblx0bGV0IHRva2VucyA9IFtdO1xuXHRmb3IgKGxldCB0b2sgb2YgbmV3IExleGVyKFwidGV4dGFyZWFcIiwgY29kZSkpIHtcblx0XHRpZiAodG9rLmtpbmQgPT09IFwiYXRvbVwiXG5cdFx0XHR8fCB0b2sua2luZCA9PT0gXCJudW1iZXJcIlxuXHRcdFx0fHwgdG9rLmtpbmQgPT09IFwicmVmXCJcblx0XHRcdHx8IHRvay5raW5kID09PSBcInN0cmluZ1wiXG5cdFx0XHR8fCB0b2sua2luZCA9PT0gXCJzeW1ib2xcIlxuXHRcdCkge1xuXHRcdFx0dG9rZW5zLnB1c2goYCR7dG9rLmtpbmR9ICgke3Rvay52YWx1ZX0pYClcblx0XHR9IGVsc2Uge1xuXHRcdFx0dG9rZW5zLnB1c2goYCR7dG9rLmtpbmR9YCk7XG5cdFx0fVxuXHR9O1xuXHRjb25zb2xlLmxvZyh0b2tlbnMuam9pbihcIiwgXCIpKTtcblxuXHRsZXQgcGFyc2VyID0gbmV3IFBhcnNlcihcblx0XHRuZXcgTGV4ZXIoXCJ0ZXh0YXJlYVwiLCBjb2RlKSxcblx0XHRbXG5cdFx0XHRbXCI9XCIsIFwiLT5cIl0sXG5cdFx0XHRbXCJ8PlwiXSxcblx0XHRdLFxuXHRcdFtcblx0XHRcdFtcIi0+XCJdLFxuXHRcdFx0W1wiJiZcIiwgXCJ8fFwiXSxcblx0XHRcdFtcIj09XCIsIFwiIT1cIl0sXG5cdFx0XHRbXCI8XCIsIFwiPD1cIiwgXCI+XCIsIFwiPj1cIl0sXG5cdFx0XHRbXCIuLlwiLCBcIi4uPFwiLCBcIjwuLlwiLCBcIjwuLjxcIl0sXG5cdFx0XHRbXCIrK1wiXSxcblx0XHRcdFtcIitcIiwgXCItXCJdLFxuXHRcdFx0W1wiKlwiLCBcIi9cIiwgXCIvL1wiLCBcIiUlXCJdLFxuXHRcdFx0W1wiQFwiXSxcblx0XHRcdFtcIi5cIl0sXG5cdFx0XSxcblx0KTtcblx0bGV0IGV4cHJzID0gcGFyc2VyLnBhcnNlKCk7XG5cdGZvciAobGV0IGV4cHIgb2YgZXhwcnMpIHtcblx0XHRjb25zb2xlLmxvZyhleHByZXNzaW9uU3RyaW5nKGV4cHIpKTtcblx0fVxuXG5cdHJ1bkV4cHJlc3Npb25zKGV4cHJzKTtcbn07Il19