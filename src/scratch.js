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
const internalNamespaceInsertMap = "namespaceInsertMap";
const unpackAndMaybeAddToOurs = "unpackAndMaybeAddToOurs";
const unpackAndMaybeAddToOursDefinition = `const ${unpackAndMaybeAddToOurs} = ([insertable, ret]) => {
	if (insertable) {
		${ourNamespace} = ${internalNamespaceInsertMap}(${ourNamespace}, insertable);
	}
	return ret;
};`;
const internalNewAtom = "newAtom";
const internalNewList = "newList";
const internalNewBlock = "newBlock";
const internalMatch = "match";
const internalIsList = "isList";
const internalIsMap = "isMap";
const internalNewMatchError = "internalNewMatchError";
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
const symbolAssign = "=";
function asAssignment(call) {
    if (call.first.kind !== "ref"
        || call.first.value !== symbolAssign
        || call.arguments.length !== 2) {
        return null;
    }
    return { assignee: call.arguments[0], value: call.arguments[1] };
}
const symbolDefine = "->";
const identDefine = "def";
function asDefine(call) {
    if (call.first.kind !== "ref"
        || (call.first.value !== symbolDefine && call.first.value !== identDefine)
        || call.arguments.length !== 2) {
        return null;
    }
    let args = call.arguments[0];
    if (args.kind !== "list") {
        return null;
    }
    if (!args.elements.every(e => e.kind === "atom")) {
        return null;
    }
    ;
    let block = call.arguments[1];
    if (block.kind !== "block") {
        return null;
    }
    return { args: args.elements, block };
}
function newJavascriptNumber(n) {
    return `${n}n`;
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
            let assign = asAssignment(expr);
            if (!assign) {
                this.code += this.expr(expr) + ";";
            }
            else {
                this.assignment(assign.assignee, this.addTemporaryWith(this.expr(assign.assignee)), this.addTemporaryWith(this.expr(assign.value)));
            }
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
                return newJavascriptNumber(expr.value);
            case "string":
                return `${toJavascriptString(expr.value)}`;
            case "atom":
                return `(${internalNewAtom}(${toJavascriptString(expr.value)}))`;
            case "ref":
                return this.varNames.get(expr.value)
                    ?? `(${ourNamespace}.mustGet(${toJavascriptString(expr.value)}))`;
            case "call":
                let define = asDefine(expr);
                if (!define) {
                    let first = this.expr(expr.first);
                    let args = expr.arguments.map(arg => this.expr(arg)).join(", ");
                    return `(${unpackAndMaybeAddToOurs}(${first}(${ourNamespace}, ${args})))`;
                }
                else {
                    return this.define(define.args, define.block);
                }
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
    define(args, block) {
        let next = this.varNames;
        let variableHeader = "";
        let jsArgs = "";
        for (let i = 0; i < args.length; i++) {
            let arg = args[i];
            let temp = `_${i}`;
            let varName = toJavascriptVarName(arg.value);
            let maybeNext = next.insert(arg.value, varName);
            if (maybeNext !== undefined) {
                next = maybeNext;
                variableHeader += `const ${varName} = ${temp};\n`;
            }
            variableHeader += `${ourNamespace} = ${ourNamespace}.mustInsert(`
                + `${toJavascriptString(arg.value)}, ${temp});\n`;
            jsArgs += `, ${temp}`;
        }
        let content = new Compiler(this.varNames, block.expressions, args.length).compile();
        return `(${internalNewBlock}(${ourNamespace}, function(${theirNamespace}${jsArgs}) {\n`
            + `if (arguments.length-1 !== ${args.length}) {\n`
            // TODO: throw MatchError
            + `\tthrow new Error(\`expected ${args.length} argument(s), got \${arguments.length-1}\`);\n`
            + "}\n"
            + `let ${ourNamespace} = this;\n`
            + unpackAndMaybeAddToOursDefinition + '\n'
            + variableHeader + '\n\n'
            + content + "\n}))";
    }
    assignment(assignee, tempAssignee, tempValue) {
        if (assignee.kind === "unit"
            || assignee.kind === "number"
            || assignee.kind === "string") {
            this.code += `if (${tempAssignee} !== ${tempValue}) {\n`
                + `\tthrow ${internalNewMatchError}(${tempAssignee}, ${tempValue});\n`
                + "}\n";
        }
        else if (assignee.kind === "atom") {
            let varName = toJavascriptVarName(assignee.value);
            let next = this.varNames.insert(assignee.value, varName);
            if (next !== undefined) {
                this.varNames = next;
                this.code += `const ${varName} = ${tempValue};\n`;
            }
            this.code += `${ourNamespace} = ${ourNamespace}.mustInsert(`
                + `${toJavascriptString(assignee.value)}, ${tempValue});\n`;
        }
        else if (assignee.kind === "list") {
            let expectedLength = newJavascriptNumber(assignee.elements.length);
            this.code += `if (!${internalIsList}(${tempValue})) {\n`
                + `\tthrow ${internalNewMatchError}(${tempAssignee}, ${tempValue});\n`
                + "}\n"
                + `if (${tempValue}.len() !== ${expectedLength}) {\n`
                + `\tthrow ${internalNewMatchError}(\n`
                + `\t\t${tempAssignee},\n`
                + `\t\t${tempValue},\n`
                + `\t\t\`expected length ${assignee.elements.length}, got \${${tempValue}.len()}\`,\n`
                + `\t);\n`
                + "}\n";
            for (let i = 0; i < assignee.elements.length; i++) {
                let element = assignee.elements[i];
                let elementAssignee = this.addTemporaryWith(`(${tempAssignee}.at(${newJavascriptNumber(i)}))`);
                let elementValue = this.addTemporaryWith(`(${tempValue}.at(${newJavascriptNumber(i)}))`);
                this.assignment(element, elementAssignee, elementValue);
            }
        }
        else {
            let temp = this.newTemporary();
            this.code += `const ${temp} = `
                + `${internalMatch}(${tempAssignee}, ${tempValue});\n`
                + `if (${internalIsMap}(${temp})) {\n`
                + `\t${ourNamespace} = ${internalNamespaceInsertMap}(${ourNamespace}, ${temp});\n`
                + "}\n";
        }
    }
    newTemporary() {
        let name = `_${this.temporariesIndex}`;
        this.temporariesIndex++;
        return name;
    }
    addTemporaryWith(expr) {
        let name = this.newTemporary();
        this.code += `const ${name} = ${expr};\n`;
        return name;
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
class MatchError extends Error {
    constructor(matcher, value, message) {
        let err = `failed pattern match ${valueString(matcher)} with ${valueString(value)}`;
        if (message !== undefined) {
            err += ": " + message;
        }
        super(err);
        this.name = "MatchError";
    }
}
const emptyNamespace = new Namespace();
function match(matcher, value) {
    if (matcher === null
        || typeof matcher === "boolean"
        || typeof matcher === "bigint"
        || typeof matcher === "string") {
        if (matcher !== value) {
            throw new MatchError(matcher, value);
        }
        ;
        return null;
    }
    else if (matcher instanceof RuntimeAtom) {
        return RuntimeMap.fromRuntimeValues(emptyNamespace, new RuntimeList(matcher, value));
    }
    else if (typeof matcher === "function") {
        let result = matcher(emptyNamespace, value)[1];
        if (result === null || result instanceof RuntimeMap) {
            return result;
        }
        else {
            throw new Error("matcher block must return null or map");
        }
    }
    else if (matcher instanceof RuntimeList) {
        if (!(value instanceof RuntimeList)) {
            throw new MatchError(matcher, value);
        }
        if (matcher.len() !== value.len()) {
            throw new MatchError(matcher, value, `expected length ${matcher.len()}, got ${value.len()}`);
        }
        let results = RuntimeMap.fromRuntimeValues(emptyNamespace);
        for (let i = 0n; i < matcher.len(); i++) {
            let result = match(matcher.at(i), value.at(i));
            if (result instanceof RuntimeMap) {
                results = results.insertMany(result);
            }
        }
        return results;
    }
    else if (matcher instanceof RuntimeMap) {
        if (!(value instanceof RuntimeMap)) {
            throw new MatchError(matcher, value);
        }
        let results = RuntimeMap.fromRuntimeValues(new Namespace());
        for (let kv of matcher) {
            let key = kv.at(0n);
            let found = value.tryGet(key);
            if (found === undefined) {
                throw new MatchError(matcher, value, `key ${valueString(key)} not found`);
            }
            let result = match(kv.at(1n), found);
            if (result instanceof RuntimeMap) {
                results = results.insertMany(result);
            }
        }
        return results;
    }
    else if (matcher instanceof Mut) {
        if (!(value instanceof Mut)) {
            throw new MatchError(matcher, value);
        }
        return match(matcher.value, value.value);
    }
    else if (matcher instanceof Return) {
        if (!(value instanceof Return)) {
            throw new MatchError(matcher, value);
        }
        return match(matcher.value, value.value);
    }
    else if (matcher instanceof Unique) {
        if (!matcher.equals(value)) {
            throw new MatchError(matcher, value);
        }
        ;
        return null;
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
function namespaceInsertMap(namespace, map) {
    for (let atomAndValue of map) {
        let atom = atomAndValue.at(0n);
        if (!(atom instanceof RuntimeAtom)) {
            throw new Error(`namespace insert: expected atom, got ${valueString(atom)}`);
        }
        namespace = namespace.mustInsert(atom.value, atomAndValue.at(1n));
    }
    return namespace;
}
function defineBlock(_, matcher, block) {
    checkArgumentLength(2, arguments);
    if (typeof block !== "function") {
        throw argumentError();
    }
    let fn = (ns, ...args) => {
        let matchee = new RuntimeList(...args);
        let result = match(matcher, matchee);
        let callNamespace = block.namespace;
        if (result instanceof RuntimeMap) {
            callNamespace = namespaceInsertMap(callNamespace, result);
        }
        return block.original.call(callNamespace, ns);
    };
    return [null, createNewBlock(block.namespace, fn)];
}
const stopValue = new Unique();
const builtinBlocks = [
    ["get", function (ns, str) {
            checkArgumentLength(1, arguments);
            if (typeof str !== "string") {
                throw argumentError();
            }
            return [null, ns.mustGet(str)];
        }],
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
            let callNamespace = namespaceInsertMap(block.namespace, atomsAndValues);
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
    [symbolAssign, function (_, assignee, value) {
            checkArgumentLength(2, arguments);
            let result = match(assignee, value);
            if (result instanceof RuntimeMap) {
                return [result, null];
            }
            else {
                return [null, null];
            }
        }],
    [identDefine, defineBlock],
    [symbolDefine, defineBlock],
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
                let result;
                try {
                    result = match(matcher, value);
                }
                catch (err) {
                    if (err instanceof MatchError) {
                        continue;
                    }
                    else {
                        throw err;
                    }
                }
                let callNamespace = block.namespace;
                if (result instanceof RuntimeMap) {
                    callNamespace = namespaceInsertMap(callNamespace, result);
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
    ["append", function (_, list, value) {
            checkArgumentLength(2, arguments);
            if (!(list instanceof RuntimeList)) {
                throw argumentError();
            }
            return [null, list.append(value)];
        }],
    ["toList", function (ns, iterator) {
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
    [".", function (_, map, key) {
            checkArgumentLength(2, arguments);
            if (!(map instanceof RuntimeMap)) {
                throw argumentError();
            }
            return [null, map.get(key)];
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
    ["stop", stopValue]
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
    [internalNewAtom]: (value) => {
        return new RuntimeAtom(value);
    },
    [internalNewList]: (...elements) => {
        return new RuntimeList(...elements);
    },
    [internalNewBlock]: createNewBlock,
    [internalNamespaceInsertMap]: namespaceInsertMap,
    [internalMatch]: match,
    [internalIsList]: (maybeList) => {
        return maybeList instanceof RuntimeList;
    },
    [internalIsMap]: (maybeMap) => {
        return maybeMap instanceof RuntimeMap;
    },
    [internalNewMatchError]: (matcher, value, message) => {
        return new MatchError(matcher, value, message);
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
        [symbolAssign, "<-"],
        ["|>"],
    ], [
        [symbolDefine],
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyYXRjaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNjcmF0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLFNBQVMsUUFBUTtJQUNiLE9BQU8sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBRUQsU0FBUyxXQUFXO0lBQ25CLE1BQU0sSUFBSSxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7QUFDaEMsQ0FBQztBQUVELFNBQVMsYUFBYSxDQUFDLEdBQWEsRUFBRSxPQUFlO0lBQ3BELE9BQU8sSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLFFBQVEsR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUErR0QsU0FBUyxhQUFhLENBQUMsR0FBYSxFQUFFLElBQW9CO0lBQ3pELE9BQU8sRUFBQyxHQUFHLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBQyxDQUFDO0FBQ3RFLENBQUM7QUFFRCwwQkFBMEI7QUFFMUIsU0FBUyxPQUFPLENBQUMsSUFBWTtJQUM1QixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLFlBQVksQ0FBQyxJQUFZO0lBQ2pDLE9BQU8sYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsT0FBTyxDQUFDLElBQVk7SUFDNUIsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEMsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLGdCQUFnQixDQUFDLElBQVk7SUFDckMsT0FBTyxDQUFDLEdB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SSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsTUFBTSxDQUFDO1FBQzVCLENBQUMsSUFBSSxDQUFDO1FBQ04sQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDO1FBQ1YsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxHQUFHLENBQUM7UUFDckIsQ0FBQyxHQUFHLENBQUM7UUFDTCxDQUFDLEdBQUcsQ0FBQztLQUNMLENBQ0QsQ0FBQztJQUNGLElBQUksS0FBSyxHQUFHLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztJQUMzQixLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssRUFBRTtRQUN2QixPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7S0FDcEM7SUFFRCxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDdkIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImZ1bmN0aW9uIGludGVybmFsKCk6IEVycm9yIHtcbiAgICByZXR1cm4gbmV3IEVycm9yKFwiaW50ZXJuYWwgZXJyb3JcIik7XG59XG5cbmZ1bmN0aW9uIHVucmVhY2hhYmxlKCk6IG5ldmVyIHtcblx0dGhyb3cgbmV3IEVycm9yKFwidW5yZWFjaGFibGVcIik7XG59XG5cbmZ1bmN0aW9uIHBvc2l0aW9uRXJyb3IocG9zOiBQb3NpdGlvbiwgbWVzc2FnZTogc3RyaW5nKTogRXJyb3Ige1xuXHRyZXR1cm4gbmV3IEVycm9yKGAke3Bvcy5wYXRofXwke3Bvcy5saW5lfSBjb2wgJHtwb3MuY29sdW1ufXwgJHttZXNzYWdlfWApO1xufVxuXG50eXBlIFJlZiA9IHtcblx0a2luZDogXCJyZWZcIjtcblx0dmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgQXRvbSA9IHtcblx0a2luZDogXCJhdG9tXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIFFTeW1ib2wgPSB7XG5cdGtpbmQ6IFwic3ltYm9sXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIFFOdW1iZXIgPSB7XG5cdGtpbmQ6IFwibnVtYmVyXCI7XG5cdHZhbHVlOiBiaWdpbnQ7XG59O1xuXG50eXBlIFFTdHJpbmcgPSB7XG5cdGtpbmQ6IFwic3RyaW5nXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIE9wZW5CcmFja2V0ID0ge1xuXHRraW5kOiBcIihcIjtcbn07XG5cbnR5cGUgQ2xvc2VkQnJhY2tldCA9IHtcblx0a2luZDogXCIpXCI7XG59O1xuXG50eXBlIE9wZW5DdXJseSA9IHtcblx0a2luZDogXCJ7XCI7XG59O1xuXG50eXBlIENsb3NlZEN1cmx5ID0ge1xuXHRraW5kOiBcIn1cIjtcbn07XG5cbnR5cGUgT3BlblNxdWFyZSA9IHtcblx0a2luZDogXCJbXCI7XG59O1xuXG50eXBlIENsb3NlZFNxdWFyZSA9IHtcblx0a2luZDogXCJdXCI7XG59O1xuXG50eXBlIEVuZE9mTGluZSA9IHtcblx0a2luZDogXCJlb2xcIjtcbn07XG5cbnR5cGUgVW5pdCA9IHtcblx0a2luZDogXCJ1bml0XCI7XG59XG5cbnR5cGUgQ2FsbGFibGUgPSAoUmVmIHwgQmxvY2sgfCBDYWxsKSAmIFBvc2l0aW9uO1xuXG50eXBlIENhbGwgPSB7XG5cdGtpbmQ6IFwiY2FsbFwiO1xuXHRmaXJzdDogQ2FsbGFibGU7XG5cdGFyZ3VtZW50czogRXhwcmVzc2lvbltdO1xufVxuXG50eXBlIExpc3QgPSB7XG5cdGtpbmQ6IFwibGlzdFwiO1xuXHRlbGVtZW50czogRXhwcmVzc2lvbltdO1xufVxuXG50eXBlIEJsb2NrID0ge1xuXHRraW5kOiBcImJsb2NrXCI7XG5cdGV4cHJlc3Npb25zOiBFeHByZXNzaW9uW107XG59XG5cbnR5cGUgVG9rZW5LaW5kID1cblx0fCBSZWZcblx0fCBBdG9tXG5cdHwgUVN5bWJvbFxuXHR8IFFOdW1iZXJcblx0fCBRU3RyaW5nXG5cdHwgT3BlbkJyYWNrZXRcblx0fCBDbG9zZWRCcmFja2V0XG5cdHwgT3BlbkN1cmx5XG5cdHwgQ2xvc2VkQ3VybHlcblx0fCBPcGVuU3F1YXJlXG5cdHwgQ2xvc2VkU3F1YXJlXG5cdHwgRW5kT2ZMaW5lO1xuXG50eXBlIEV4cHJlc3Npb25LaW5kID1cblx0fCBSZWZcblx0fCBBdG9tXG5cdHwgUU51bWJlclxuXHR8IFFTdHJpbmdcblx0fCBVbml0XG5cdHwgQ2FsbFxuXHR8IExpc3Rcblx0fCBCbG9jaztcblxudHlwZSBQb3NpdGlvbiA9IHtcblx0cGF0aDogc3RyaW5nO1xuXHRsaW5lOiBudW1iZXI7XG5cdGNvbHVtbjogbnVtYmVyO1xufTtcblxudHlwZSBUb2tlbiA9IFRva2VuS2luZCAmIFBvc2l0aW9uO1xuXG50eXBlIEV4cHJlc3Npb24gPSBFeHByZXNzaW9uS2luZCAmIFBvc2l0aW9uO1xuXG5mdW5jdGlvbiBuZXdFeHByZXNzaW9uKHBvczogUG9zaXRpb24sIGV4cHI6IEV4cHJlc3Npb25LaW5kKTogRXhwcmVzc2lvbiB7XG5cdHJldHVybiB7Li4uZXhwciwgcGF0aDogcG9zLnBhdGgsIGxpbmU6IHBvcy5saW5lLCBjb2x1bW46IHBvcy5jb2x1bW59O1xufVxuXG4vLyBUT0RPOiBzdXBwb3J0IG5vbiBhc2NpaVxuXG5mdW5jdGlvbiBpc1NwYWNlKGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15cXHMkLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNJZGVudFN0YXJ0KGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15bYS16QS1aX10kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNJZGVudChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eWzAtOWEtekEtWl9dJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzUmVzZXJ2ZWRTeW1ib2woY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBbJ1wiJywgXCInXCIsICcoJywgJyknLCAneycsICd9JywgJ1snLCAnXScsICcjJ10uaW5jbHVkZXMoY2hhcik7XG59O1xuXG5mdW5jdGlvbiBpc1N5bWJvbChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGlzUmVzZXJ2ZWRTeW1ib2woY2hhcikgfHwgKGNoYXIgPT0gJ18nKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fTtcblx0cmV0dXJuIC9eW1xcdTAwMjEtXFx1MDAyRlxcdTAwM0EtXFx1MDA0MFxcdTAwNUItXFx1MDA2MFxcdTAwN0ItXFx1MDA3RV0kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNOdW1iZXJTdGFydChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eWzAtOV0kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNOdW1iZXIoY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlswLTlfXSQvLnRlc3QoY2hhcik7XG59O1xuXG5jbGFzcyBMZXhlciBpbXBsZW1lbnRzIEl0ZXJhYmxlPFRva2VuPiB7XG5cdHBhdGg6IHN0cmluZztcblx0Y2hhcnM6IEl0ZXJhdG9yPHN0cmluZz47XG5cdGxhc3RDaGFyOiB7Y2hhcjogc3RyaW5nLCB1c2U6IGJvb2xlYW59IHwgbnVsbCA9IG51bGw7XG5cdGxpbmUgPSAxO1xuXHRjb2x1bW4gPSAxO1xuXHRsYXN0TmV3bGluZSA9IGZhbHNlO1xuXG5cdGxhc3RUb2tlbjoge3Rva2VuOiBUb2tlbiwgdXNlOiBib29sZWFufSB8IG51bGwgPSBudWxsO1xuXHRmaW5pc2hlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgYnlDaGFyOiBJdGVyYWJsZTxzdHJpbmc+KSB7XG5cdFx0dGhpcy5wYXRoID0gcGF0aDtcblx0XHR0aGlzLmNoYXJzID0gYnlDaGFyW1N5bWJvbC5pdGVyYXRvcl0oKTtcblx0fVxuXG5cdG5leHRDaGFyKCk6IHtjaGFyOiBzdHJpbmcsIGxpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXJ9IHwgbnVsbCB7XG5cdFx0bGV0IGNoYXI6IHN0cmluZztcblx0XHRpZiAodGhpcy5sYXN0Q2hhciAmJiB0aGlzLmxhc3RDaGFyLnVzZSkge1xuXHRcdFx0dGhpcy5sYXN0Q2hhci51c2UgPSBmYWxzZTtcblx0XHRcdGNoYXIgPSB0aGlzLmxhc3RDaGFyLmNoYXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCB7ZG9uZSwgdmFsdWV9ID0gdGhpcy5jaGFycy5uZXh0KCk7XG5cdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH07XG5cdFx0XHRjaGFyID0gdmFsdWU7XG5cdFx0fTtcblx0XHR0aGlzLmxhc3RDaGFyID0ge2NoYXIsIHVzZTogZmFsc2V9O1xuXG5cdFx0aWYgKGNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdGlmICh0aGlzLmxhc3ROZXdsaW5lKSB7XG5cdFx0XHRcdHRoaXMuY29sdW1uID0gMTtcblx0XHRcdFx0cmV0dXJuIHtjaGFyLCBsaW5lOiB0aGlzLmxpbmUrKywgY29sdW1uOiB0aGlzLmNvbHVtbn07IFxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7Y2hhciwgbGluZTogdGhpcy5saW5lKyssIGNvbHVtbjogdGhpcy5jb2x1bW59OyBcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLmxhc3ROZXdsaW5lKSB7XG5cdFx0XHRcdHRoaXMuY29sdW1uID0gMjtcblx0XHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSwgY29sdW1uOiAxfTsgXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSwgY29sdW1uOiB0aGlzLmNvbHVtbisrfTsgXG5cdFx0XHR9O1xuXHRcdH07XG5cdH07XG5cblx0dW5yZWFkQ2hhcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGFzdENoYXIgfHwgdGhpcy5sYXN0Q2hhci51c2UpIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fTtcblx0XHR0aGlzLmxhc3RDaGFyLnVzZSA9IHRydWU7XG5cdFx0aWYgKHRoaXMubGFzdE5ld2xpbmUpIHtcblx0XHRcdHRoaXMubGluZS0tO1xuXHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbHVtbi0tO1xuXHRcdH07XG5cdH07XG5cblx0dGFrZVdoaWxlKHByZWRpY2F0ZTogKGNoYXI6IHN0cmluZykgPT4gYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0bGV0IHN0ciA9IFwiXCI7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBjaGFyID0gdGhpcy5uZXh0Q2hhcigpPy5jaGFyO1xuXHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdHJldHVybiBzdHI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByZWRpY2F0ZShjaGFyKSkge1xuXHRcdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdFx0cmV0dXJuIHN0cjtcblx0XHRcdH07XG5cdFx0XHRzdHIgKz0gY2hhcjtcblx0XHR9O1xuXHR9O1xuXG5cdGZpbmlzaGluZ0VvbCgpOiBUb2tlbiB7XG5cdFx0dGhpcy5maW5pc2hlZCA9IHRydWU7XG5cdFx0cmV0dXJuIHsgcGF0aDogdGhpcy5wYXRoLCBsaW5lOiB0aGlzLmxpbmUsIGNvbHVtbjogdGhpcy5jb2x1bW4sIGtpbmQ6IFwiZW9sXCIgfVxuXHR9O1xuXG5cdHdpdGhQb3NpdGlvbihwb3NpdGlvbjoge2xpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXJ9LCBraW5kOiBUb2tlbktpbmQpOiBUb2tlbiB7XG5cdFx0cmV0dXJuIHsgcGF0aDogdGhpcy5wYXRoLCBsaW5lOiBwb3NpdGlvbi5saW5lLCBjb2x1bW46IHBvc2l0aW9uLmNvbHVtbiwgLi4ua2luZCB9XG5cdH07XG5cblx0bmV4dFRva2VuKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMubGFzdFRva2VuICYmIHRoaXMubGFzdFRva2VuLnVzZSkge1xuXHRcdFx0dGhpcy5sYXN0VG9rZW4udXNlID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4gdGhpcy5sYXN0VG9rZW4udG9rZW47XG5cdFx0fVxuXHRcdGxldCB0b2tlbiA9IHRoaXMuZ2V0TmV4dFRva2VuKCk7XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHRoaXMubGFzdFRva2VuID0ge3Rva2VuLCB1c2U6IGZhbHNlfTtcblx0XHRyZXR1cm4gdG9rZW47XG5cdH1cblxuXHRnZXROZXh0VG9rZW4oKTogVG9rZW4gfCBudWxsIHtcblx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdGlmICghdGhpcy5maW5pc2hlZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9O1xuXG5cdFx0aWYgKGlzU3BhY2UoY2hhci5jaGFyKSkge1xuXHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXFxuJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oY2hhciwge2tpbmQ6IFwiZW9sXCJ9KTtcblx0XHRcdH07XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjaGFyID0gdGhpcy5uZXh0Q2hhcigpO1xuXHRcdFx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKCFpc1NwYWNlKGNoYXIuY2hhcikpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXFxuJykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihjaGFyLCB7a2luZDogXCJlb2xcIn0pOztcblx0XHRcdFx0fTtcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGxldCBzdGFydCA9IGNoYXI7XG5cdFx0aWYgKGlzUmVzZXJ2ZWRTeW1ib2woY2hhci5jaGFyKSkge1xuXHRcdFx0c3dpdGNoIChjaGFyLmNoYXIpIHtcblx0XHRcdGNhc2UgJ1wiJzpcblx0XHRcdFx0bGV0IHN0ciA9IFwiXCI7XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3N0cmluZyBub3QgY2xvc2VkIHdpdGggXCInKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXCInKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcInN0cmluZ1wiLCB2YWx1ZTogc3RyfSk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAoY2hhci5jaGFyICE9ICdcXHInKSB7XG5cdFx0XHRcdFx0XHRzdHIgKz0gY2hhci5jaGFyO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIFwiJ1wiOlxuXHRcdFx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRcdFx0aWYgKCFjaGFyIHx8ICFpc0lkZW50U3RhcnQoY2hhci5jaGFyKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcImJhcmUgJ1wiKVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJhdG9tXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc0lkZW50KX0pO1xuXHRcdFx0Y2FzZSAnKCc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiKFwifSk7XG5cdFx0XHRjYXNlICcpJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCIpXCJ9KTtcblx0XHRcdGNhc2UgJ3snOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIntcIn0pO1xuXHRcdFx0Y2FzZSAnfSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwifVwifSk7XG5cdFx0XHRjYXNlICdbJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJbXCJ9KTtcblx0XHRcdGNhc2UgJ10nOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIl1cIn0pO1xuXHRcdFx0Y2FzZSAnIyc6XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGlmIChjaGFyLmNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihjaGFyLCB7a2luZDogXCJlb2xcIn0pO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKGlzSWRlbnRTdGFydChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwicmVmXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc0lkZW50KX0pO1xuXHRcdH0gZWxzZSBpZiAoaXNOdW1iZXJTdGFydChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdGxldCBudW0gPSB0aGlzLnRha2VXaGlsZShpc051bWJlcikucmVwbGFjZShcIl9cIiwgXCJcIik7XG5cdFx0XHRpZiAoKG51bS5sZW5ndGggPiAxKSAmJiBudW1bMF0gPT0gJzAnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgemVybyBwYWRkZWQgbnVtYmVyICR7bnVtfWApXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJudW1iZXJcIiwgdmFsdWU6IEJpZ0ludChudW0pfSk7XG5cdFx0fSBlbHNlIGlmIChpc1N5bWJvbChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwic3ltYm9sXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc1N5bWJvbCl9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVE9ETzogcXVvdGUgY2hhciB3aGVuIG5lY2Vzc2FyeVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGB1bmtub3duIGNoYXJhY3RlciAke2NoYXJ9YCk7XG5cdFx0fTtcblx0fTtcblxuXHR1bnJlYWRUb2tlbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGFzdFRva2VuIHx8IHRoaXMubGFzdFRva2VuLnVzZSkge1xuXHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHR9O1xuXHRcdHRoaXMubGFzdFRva2VuLnVzZSA9IHRydWU7XG5cdH07XG5cblx0cGVla1Rva2VuKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0bGV0IHRva2VuID0gdGhpcy5uZXh0VG9rZW4oKTtcblx0XHR0aGlzLnVucmVhZFRva2VuKCk7XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9XG5cblx0bXVzdE5leHRUb2tlbih0az86IFRva2VuS2luZCk6IFRva2VuIHtcblx0XHRsZXQgdG9rZW4gPSB0aGlzLm5leHRUb2tlbigpO1xuXHRcdGlmICghdG9rZW4gfHwgKHRrICYmIHRva2VuLmtpbmQgIT09IHRrLmtpbmQpKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9rZW47XG5cdH1cblxuXHRbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYXRvcjxUb2tlbj4ge1xuXHRcdHJldHVybiBuZXcgVG9rZW5JdGVyYXRvcih0aGlzKTtcblx0fTtcbn07XG5cbmNsYXNzIFRva2VuSXRlcmF0b3IgaW1wbGVtZW50cyBJdGVyYXRvcjxUb2tlbj4ge1xuXHRsZXhlcjogTGV4ZXI7XG5cblx0Y29uc3RydWN0b3IobGV4ZXI6IExleGVyKSB7XG5cdFx0dGhpcy5sZXhlciA9IGxleGVyO1xuXHR9O1xuXG5cdG5leHQoKTogSXRlcmF0b3JSZXN1bHQ8VG9rZW4+IHtcblx0XHRsZXQgdG9rZW4gPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdC8vIHRoZSB0eXBlIG9mIEl0ZXJhdG9yIHJlcXVpcmVzIHRoYXQgd2UgYWx3YXlzIHJldHVybiBhIHZhbGlkIFRva2VuXG5cdFx0XHQvLyBzbyB3ZSByZXR1cm4gZW9sIGhlcmVcblx0XHRcdHJldHVybiB7ZG9uZTogdHJ1ZSwgdmFsdWU6IHtraW5kOiBcImVvbFwifX07XG5cdFx0fTtcblx0XHRyZXR1cm4ge2RvbmU6IGZhbHNlLCB2YWx1ZTogdG9rZW59O1xuXHR9O1xufTtcblxuZnVuY3Rpb24gY29sbGFwc2VFeHByZXNzaW9ucyhwb3M6IFBvc2l0aW9uLCBleHByczogRXhwcmVzc2lvbltdKTogRXhwcmVzc2lvbiB7XG5cdHN3aXRjaCAoZXhwcnMubGVuZ3RoKSB7XG5cdFx0Y2FzZSAwOlxuXHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24ocG9zLCB7a2luZDogXCJ1bml0XCJ9KTtcblx0XHRjYXNlIDE6XG5cdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihwb3MsIGV4cHJzWzBdISk7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdGxldCBmaXJzdCA9IGV4cHJzWzBdITtcblx0XHRcdGlmIChmaXJzdC5raW5kICE9PSBcInJlZlwiXG5cdFx0XHRcdCYmIGZpcnN0LmtpbmQgIT09IFwiYmxvY2tcIlxuXHRcdFx0XHQmJiBmaXJzdC5raW5kICE9PSBcImNhbGxcIlxuXHRcdFx0KSB7XG5cdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IoZmlyc3QsIFwiY2FuIG9ubHkgY2FsbCBpZGVudCwgYmxvY2sgb3IgY2FsbFwiKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKFxuXHRcdFx0XHRwb3MsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiBcImNhbGxcIixcblx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRhcmd1bWVudHM6IGV4cHJzLnNsaWNlKDEpLFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHR9XG59XG5cbnR5cGUgVmFsdWVPclN5bWJvbCA9IEV4cHJlc3Npb24gfCBRU3ltYm9sJlBvc2l0aW9uO1xuXG5pbnRlcmZhY2UgUHJlY2VkZW5jZVRhYmxlIHsgW2tleTogc3RyaW5nXTogbnVtYmVyOyB9O1xuXG5jbGFzcyBQYXJzZXIge1xuXHRsZXhlcjogTGV4ZXI7XG5cdHByZWNlZGVuY2VUYWJsZTogUHJlY2VkZW5jZVRhYmxlO1xuXG5cdC8vIFRPRE86IGNoZWNrIGR1cGxpY2F0ZSBzeW1ib2xzXG5cdGNvbnN0cnVjdG9yKGxleGVyOiBMZXhlciwgbG93ZXJUaGFuQ2FsbDogc3RyaW5nW11bXSwgaGlnaGVyVGhhbkNhbGw6IHN0cmluZ1tdW10pIHtcblx0XHR0aGlzLmxleGVyID0gbGV4ZXI7XG5cdFx0dGhpcy5wcmVjZWRlbmNlVGFibGUgPSB7fTtcblx0XHRsZXQgaW5zZXJ0UHJlY2VkZW5jZSA9ICh0YWJsZTogc3RyaW5nW11bXSwgZmFjdG9yOiBudW1iZXIpID0+IHtcblx0XHRcdHRhYmxlLmZvckVhY2goKGxldmVsLCBpKSA9PiBsZXZlbC5mb3JFYWNoKHN5bWJvbCA9PiB7XG5cdFx0XHRcdGlmICghc3RyaW5nQWxsKHN5bWJvbCwgaXNTeW1ib2wpIHx8IHRoaXMucHJlY2VkZW5jZVRhYmxlLmhhc093blByb3BlcnR5KHN5bWJvbCkpIHtcblx0XHRcdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucHJlY2VkZW5jZVRhYmxlW3N5bWJvbF0gPSAoaSArIDEpICogZmFjdG9yO1xuXHRcdFx0fSkpO1xuXHRcdH07XG5cdFx0aW5zZXJ0UHJlY2VkZW5jZShsb3dlclRoYW5DYWxsLCAtMSksXG5cdFx0dGhpcy5wcmVjZWRlbmNlVGFibGVbXCJjYWxsXCJdID0gMDtcblx0XHRpbnNlcnRQcmVjZWRlbmNlKGhpZ2hlclRoYW5DYWxsLCAxKVxuXHR9XG5cblx0cGFyc2UoKTogRXhwcmVzc2lvbltdIHtcblx0XHRsZXQgZXhwcmVzc2lvbnMgPSBbXTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IHN0YXJ0ID0gdGhpcy5sZXhlci5wZWVrVG9rZW4oKTtcblx0XHRcdGlmICghc3RhcnQpIHtcblx0XHRcdFx0cmV0dXJuIGV4cHJlc3Npb25zO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHZhbHVlc09yU3ltYm9sczogVmFsdWVPclN5bWJvbFtdID0gW107XG5cdFx0XHR3aGlsZSh0cnVlKSB7XG5cdFx0XHRcdGxldCBuZXh0ID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlc09yU3ltYm9sc1t2YWx1ZXNPclN5bWJvbHMubGVuZ3RoLTFdPy5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKG5leHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0XHR2YWx1ZXNPclN5bWJvbHMucHVzaCh0aGlzLnZhbHVlKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWVzT3JTeW1ib2xzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZXhwcmVzc2lvbnMucHVzaCh0aGlzLmNvbGxhcHNlKHN0YXJ0LCB2YWx1ZXNPclN5bWJvbHMpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjYWxsT3JWYWx1ZSgpOiBFeHByZXNzaW9uIHtcblx0XHRsZXQgb3BlbkJyYWNrZXQgPSB0aGlzLmxleGVyLm11c3ROZXh0VG9rZW4oe2tpbmQ6ICcoJ30pO1xuXHRcdGxldCB2YWx1ZXNPclN5bWJvbHM6IFZhbHVlT3JTeW1ib2xbXSA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMubGV4ZXIubmV4dFRva2VuKCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiZXhwZWN0ZWQgJyknLCBnb3QgZW9mXCIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5leHQua2luZCA9PT0gXCJlb2xcIikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcIilcIikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKG5leHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHR2YWx1ZXNPclN5bWJvbHMucHVzaCh0aGlzLnZhbHVlKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jb2xsYXBzZShvcGVuQnJhY2tldCwgdmFsdWVzT3JTeW1ib2xzKTtcblx0fVxuXG5cdC8vIFRPRE86IGFsbG93IHN5bWJvbHMgd2l0aCBoaWdoZXIgcHJlY2VkZW5jZSB0aGFuIGNhbGwgaW4gbGlzdHNcblx0bGlzdCgpOiBFeHByZXNzaW9uIHtcblx0XHRsZXQgb3BlblNxdWFyZSA9IHRoaXMubGV4ZXIubXVzdE5leHRUb2tlbih7a2luZDogXCJbXCJ9KTtcblx0XHRsZXQgZWxlbWVudHM6IEV4cHJlc3Npb25bXSA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMubGV4ZXIubmV4dFRva2VuKCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiZXhwZWN0ZWQgJ10nLCBnb3QgZW9mXCIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5leHQua2luZCA9PT0gXCJlb2xcIikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcIl1cIikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0ZWxlbWVudHMucHVzaCh0aGlzLnZhbHVlKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihvcGVuU3F1YXJlLCB7a2luZDogXCJsaXN0XCIsIGVsZW1lbnRzfSk7XG5cdH1cblxuXHRibG9jaygpOiBFeHByZXNzaW9uIHtcblx0XHRsZXQgb3BlbkN1cmx5ID0gdGhpcy5sZXhlci5tdXN0TmV4dFRva2VuKHtraW5kOiBcIntcIn0pO1xuXHRcdGxldCBleHByZXNzaW9ucyA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgc3RhcnQgPSB0aGlzLmxleGVyLnBlZWtUb2tlbigpO1xuXHRcdFx0bGV0IHZhbHVlc09yU3ltYm9sczogVmFsdWVPclN5bWJvbFtdID0gW107XG5cdFx0XHR3aGlsZSh0cnVlKSB7XG5cdFx0XHRcdGxldCBuZXh0ID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiZXhwZWN0ZWQgJ30nLCBnb3QgZW9mXCIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJlb2xcIikge1xuXHRcdFx0XHRcdGlmICh2YWx1ZXNPclN5bWJvbHNbdmFsdWVzT3JTeW1ib2xzLmxlbmd0aC0xXT8ua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwifVwiKSB7XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKG5leHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0XHR2YWx1ZXNPclN5bWJvbHMucHVzaCh0aGlzLnZhbHVlKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodmFsdWVzT3JTeW1ib2xzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZXhwcmVzc2lvbnMucHVzaCh0aGlzLmNvbGxhcHNlKHN0YXJ0ISwgdmFsdWVzT3JTeW1ib2xzKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5sZXhlci5tdXN0TmV4dFRva2VuKCkua2luZCA9PT0gJ30nKSB7XG5cdFx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKG9wZW5DdXJseSwge2tpbmQ6IFwiYmxvY2tcIiwgZXhwcmVzc2lvbnN9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR2YWx1ZSgpOiBFeHByZXNzaW9uIHtcblx0XHRjb25zdCB0b2tlbiA9IHRoaXMubGV4ZXIubmV4dFRva2VuKCk7XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwidW5leHBlY3RlZCBlb2ZcIik7XG5cdFx0fSBlbHNlIGlmIChbJyknLCAnXScsICd9JywgXCJlb2xcIl0uaW5jbHVkZXModG9rZW4ua2luZCkpIHtcblx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IodG9rZW4sIGB1bmV4cGVjdGVkICR7dG9rZW4ua2luZH1gKVxuXHRcdH0gZWxzZSBpZiAoW1wic3RyaW5nXCIsIFwibnVtYmVyXCIsIFwicmVmXCIsIFwiYXRvbVwiXS5pbmNsdWRlcyh0b2tlbi5raW5kKSkge1xuXHRcdFx0cmV0dXJuIHRva2VuIGFzIEV4cHJlc3Npb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN3aXRjaCAodG9rZW4ua2luZCkge1xuXHRcdFx0Y2FzZSBcInN5bWJvbFwiOlxuXHRcdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKHRva2VuLCBgdW5leHBlY3RlZCBzeW1ib2wgJHt0b2tlbi52YWx1ZX1gKTtcblx0XHRcdGNhc2UgJygnOlxuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNhbGxPclZhbHVlKCk7XG5cdFx0XHRjYXNlICd7Jzpcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5ibG9jaygpO1xuXHRcdFx0Y2FzZSAnWyc6XG5cdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMubGlzdCgpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjb2xsYXBzZShzdGFydDogUG9zaXRpb24sIHZhbHNPclN5bXM6IFZhbHVlT3JTeW1ib2xbXSk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBwYXJzZXIgPSBuZXcgT3BlcmF0b3JQYXJzZXIoc3RhcnQsIHRoaXMucHJlY2VkZW5jZVRhYmxlLCB2YWxzT3JTeW1zKTtcblx0XHRyZXR1cm4gcGFyc2VyLnBhcnNlKCk7XG5cdH1cbn1cblxuY2xhc3MgT3BlcmF0b3JQYXJzZXIge1xuXHRzdGFydDogUG9zaXRpb247XG5cdHByZWNlZGVuY2VUYWJsZTogUHJlY2VkZW5jZVRhYmxlO1xuXHR2YWxzT3JTeW1zOiBWYWx1ZU9yU3ltYm9sW107XG5cdHBvc2l0aW9uID0gMDtcblxuXHRjb25zdHJ1Y3RvcihzdGFydDogUG9zaXRpb24sIHByZWNlZGVuY2VUYWJsZTogUHJlY2VkZW5jZVRhYmxlLCB2YWxzT3JTeW1zOiBWYWx1ZU9yU3ltYm9sW10pIHtcblx0XHRpZiAodmFsc09yU3ltc1swXT8ua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0bGV0IHN5bSA9IHZhbHNPclN5bXNbMF07XG5cdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKHN5bSwgYHVuZXhwZWN0ZWQgc3ltYm9sICR7c3ltLnZhbHVlfWApO1xuXHRcdH1cblx0XHRsZXQgbGFzdFN5bSA9IGZhbHNlO1xuXHRcdGZvciAobGV0IHZhbE9yU3ltIG9mIHZhbHNPclN5bXMpIHtcblx0XHRcdGlmICh2YWxPclN5bS5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdGlmIChsYXN0U3ltKSB7XG5cdFx0XHRcdFx0dGhyb3cgcG9zaXRpb25FcnJvcihcblx0XHRcdFx0XHRcdHZhbE9yU3ltLFxuXHRcdFx0XHRcdFx0YHN5bWJvbCAke3ZhbE9yU3ltLnZhbHVlfSBkaXJlY3RseSBmb2xsb3dzIGFub3RoZXIgc3ltYm9sYCxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcHJlY2VkZW5jZVRhYmxlLmhhc093blByb3BlcnR5KHZhbE9yU3ltLnZhbHVlKSkge1xuXHRcdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IoXG5cdFx0XHRcdFx0XHR2YWxPclN5bSxcblx0XHRcdFx0XHRcdGB1bmtub3duIG9wZXJhdG9yICR7dmFsT3JTeW0udmFsdWV9YFxuXHRcdFx0XHRcdClcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0U3ltID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhc3RTeW0gPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHZhbHNPclN5bXNbdmFsc09yU3ltcy5sZW5ndGggLSAxXT8ua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0bGV0IHN5bSA9IHZhbHNPclN5bXNbdmFsc09yU3ltcy5sZW5ndGggLSAxXSBhcyAoUVN5bWJvbCZQb3NpdGlvbik7XG5cdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKHN5bSwgYHVuZXhwZWN0ZWQgc3ltYm9sICR7c3ltLnZhbHVlfWApO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhcnQgPSBzdGFydDtcblx0XHR0aGlzLnByZWNlZGVuY2VUYWJsZSA9IHByZWNlZGVuY2VUYWJsZTtcblx0XHR0aGlzLnZhbHNPclN5bXMgPSB2YWxzT3JTeW1zO1xuXHR9XG5cblx0cHJlY2VkZW5jZShzeW06IFFTeW1ib2wpOiBudW1iZXIge1xuXHRcdGxldCBwcmVjID0gdGhpcy5wcmVjZWRlbmNlVGFibGVbc3ltLnZhbHVlXTtcblx0XHRpZiAocHJlYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJlYztcblx0fVxuXG5cdG5leHQoKTogVmFsdWVPclN5bWJvbCB8IG51bGwge1xuXHRcdGxldCBwb3NpdGlvbiA9IHRoaXMucG9zaXRpb247XG5cdFx0dGhpcy5wb3NpdGlvbisrO1xuXHRcdGlmIChwb3NpdGlvbiA+PSB0aGlzLnZhbHNPclN5bXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMudmFsc09yU3ltc1twb3NpdGlvbl0hO1xuXHRcdH1cblx0fVxuXG5cdHBlZWsoKTogVmFsdWVPclN5bWJvbCB8IG51bGwge1xuXHRcdGlmICh0aGlzLnBvc2l0aW9uID49IHRoaXMudmFsc09yU3ltcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy52YWxzT3JTeW1zW3RoaXMucG9zaXRpb25dITtcblx0XHR9XG5cdH1cblxuXHRza2lwKG46IG51bWJlcik6IHZvaWQge1xuXHRcdGxldCBuZXh0ID0gdGhpcy5wb3NpdGlvbiArIG47XG5cdFx0aWYgKG4gPT09IDAgfHwgbmV4dCA+IHRoaXMudmFsc09yU3ltcy5sZW5ndGggfHwgbmV4dCA8IDApIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fVxuXHRcdHRoaXMucG9zaXRpb24gPSBuZXh0O1xuXHR9XG5cblx0cGFyc2UoKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IGV4cHJzID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5uZXh0KCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbGxhcHNlRXhwcmVzc2lvbnModGhpcy5zdGFydCwgZXhwcnMpO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMub3BlcmF0b3JMb3dlcihcblx0XHRcdFx0XHRuZXh0LFxuXHRcdFx0XHRcdGNvbGxhcHNlRXhwcmVzc2lvbnMoZXhwcnNbMF0gPz8gdGhpcy5zdGFydCwgZXhwcnMpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IG9wID0gdGhpcy5vcGVyYXRvcihuZXh0KTtcblx0XHRcdFx0aWYgKCFvcCkge1xuXHRcdFx0XHRcdGV4cHJzLnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZXhwcnMucHVzaChvcCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvcGVyYXRvckxvd2VyKHN5bTogUVN5bWJvbCZQb3NpdGlvbiwgbGVmdDogRXhwcmVzc2lvbik6IEV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IGtpbmQgPSBcImNhbGxcIjtcblx0XHRsZXQgZmlyc3QgPSBuZXdFeHByZXNzaW9uKFxuXHRcdFx0c3ltLFxuXHRcdFx0eyBraW5kOiBcInJlZlwiLCB2YWx1ZTogc3ltLnZhbHVlIH0sXG5cdFx0KSBhcyBSZWYmUG9zaXRpb247XG5cdFx0bGV0IHJpZ2h0OiBFeHByZXNzaW9uW10gPSBbXTtcblx0XHRjb25zdCBjb2xsYXBzZVJpZ2h0ID0gKCk6IEV4cHJlc3Npb24gPT4ge1xuXHRcdFx0bGV0IHBvc2l0aW9uID0gcmlnaHRbMF07XG5cdFx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29sbGFwc2VFeHByZXNzaW9ucyhwb3NpdGlvbiwgcmlnaHQpO1xuXHRcdH07XG5cblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLm5leHQoKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihsZWZ0LCB7XG5cdFx0XHRcdFx0a2luZCxcblx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRhcmd1bWVudHM6IFtsZWZ0LCBjb2xsYXBzZVJpZ2h0KCldLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdGlmICh0aGlzLnByZWNlZGVuY2UobmV4dCkgPCB0aGlzLnByZWNlZGVuY2Uoc3ltKSkge1xuXHRcdFx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKGxlZnQsIHtcblx0XHRcdFx0XHRcdGtpbmQsXG5cdFx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogW1xuXHRcdFx0XHRcdFx0XHRsZWZ0LFxuXHRcdFx0XHRcdFx0XHR0aGlzLm9wZXJhdG9yTG93ZXIoXG5cdFx0XHRcdFx0XHRcdFx0bmV4dCxcblx0XHRcdFx0XHRcdFx0XHRjb2xsYXBzZVJpZ2h0KCksXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMub3BlcmF0b3JMb3dlcihuZXh0LFxuXHRcdFx0XHRcdFx0bmV3RXhwcmVzc2lvbihsZWZ0LCB7XG5cdFx0XHRcdFx0XHRcdGtpbmQsXG5cdFx0XHRcdFx0XHRcdGZpcnN0LFxuXHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtsZWZ0LCBjb2xsYXBzZVJpZ2h0KCldLFxuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsZXQgb3AgPSB0aGlzLm9wZXJhdG9yKG5leHQpO1xuXHRcdFx0XHRpZiAoIW9wKSB7XG5cdFx0XHRcdFx0cmlnaHQucHVzaChuZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyaWdodC5wdXNoKG9wKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG9wZXJhdG9yKGxlZnQ6IEV4cHJlc3Npb24pOiBFeHByZXNzaW9uIHwgbnVsbCB7XG5cdFx0bGV0IHN5bSA9IHRoaXMubmV4dCgpO1xuXHRcdGlmICghc3ltIHx8IHN5bS5raW5kICE9PSBcInN5bWJvbFwiIHx8IHRoaXMucHJlY2VkZW5jZShzeW0pIDwgMCkge1xuXHRcdFx0dGhpcy5za2lwKC0xKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRsZXQgcmlnaHQgPSB0aGlzLm5leHQoKTtcblx0XHRpZiAoIXJpZ2h0IHx8IHJpZ2h0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGtpbmQgPSBcImNhbGxcIjtcblx0XHRsZXQgZmlyc3QgPSBuZXdFeHByZXNzaW9uKFxuXHRcdFx0c3ltLFxuXHRcdFx0e2tpbmQ6IFwicmVmXCIsIHZhbHVlOiBzeW0udmFsdWV9LFxuXHRcdCkgYXMgUmVmJlBvc2l0aW9uO1xuXHRcdGxldCBjdXJyZW50OiBDYWxsID0geyBraW5kLCBmaXJzdCwgYXJndW1lbnRzOiBbbGVmdCwgcmlnaHRdIH07XG5cdFx0bGV0IGN1cnJlbnRFeHByID0gbmV3RXhwcmVzc2lvbihsZWZ0LCBjdXJyZW50KTtcblxuXHRcdGxldCBuZXh0U3ltID0gdGhpcy5wZWVrKCk7XG5cdFx0aWYgKCFuZXh0U3ltIHx8IG5leHRTeW0ua2luZCAhPT0gXCJzeW1ib2xcIikge1xuXHRcdFx0cmV0dXJuIGN1cnJlbnRFeHByO1xuXHRcdH1cblx0XHRpZiAodGhpcy5wcmVjZWRlbmNlKG5leHRTeW0pID4gdGhpcy5wcmVjZWRlbmNlKHN5bSkpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5vcGVyYXRvcihyaWdodCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnRFeHByO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24obGVmdCwge2tpbmQsIGZpcnN0LCBhcmd1bWVudHM6IFtsZWZ0LCBuZXh0XX0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgbmV4dCA9IHRoaXMub3BlcmF0b3IoY3VycmVudEV4cHIpO1xuXHRcdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRcdHJldHVybiBjdXJyZW50RXhwcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXh0O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBleHByZXNzaW9uU3RyaW5nKGV4cHI6IEV4cHJlc3Npb24pOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGV4cHIua2luZCkge1xuXHRjYXNlIFwidW5pdFwiOlxuXHRcdHJldHVybiBcIigpXCI7XG5cdGNhc2UgXCJjYWxsXCI6XG5cdFx0bGV0IGZpcnN0ID0gZXhwcmVzc2lvblN0cmluZyhleHByLmZpcnN0KTtcblx0XHRpZiAoZXhwci5hcmd1bWVudHMubGVuZ3RoIDwgMSkge1xuXHRcdFx0cmV0dXJuIGAoJHtmaXJzdH0gKCkpYDtcblx0XHR9XG5cdFx0bGV0IGFyZ3MgPSBleHByLmFyZ3VtZW50cy5tYXAoYXJnID0+IGV4cHJlc3Npb25TdHJpbmcoYXJnKSkuam9pbihcIiBcIik7XG5cdFx0cmV0dXJuIGAoJHtmaXJzdH0gJHthcmdzfSlgO1xuXHRjYXNlIFwibGlzdFwiOlxuXHRcdGxldCBlbGVtZW50cyA9IGV4cHIuZWxlbWVudHMubWFwKGFyZyA9PiBleHByZXNzaW9uU3RyaW5nKGFyZykpLmpvaW4oXCIgXCIpO1xuXHRcdHJldHVybiBgWyR7ZWxlbWVudHN9XWA7XG5cdGNhc2UgXCJibG9ja1wiOlxuXHRcdGxldCBleHBycyA9IGV4cHIuZXhwcmVzc2lvbnMubWFwKGFyZyA9PiBleHByZXNzaW9uU3RyaW5nKGFyZykpLmpvaW4oXCJcXG5cIik7XG5cdFx0aWYgKGV4cHIuZXhwcmVzc2lvbnMubGVuZ3RoIDwgMikge1xuXHRcdFx0cmV0dXJuIGB7ICR7ZXhwcnN9IH1gO1xuXHRcdH1cblx0XHRyZXR1cm4gYHtcXG4ke2V4cHJzfVxcbn1gO1xuXHRkZWZhdWx0OlxuXHRcdHJldHVybiBleHByLnZhbHVlLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuY2xhc3MgTmFtZXNwYWNlPFQ+IGltcGxlbWVudHMgSXRlcmFibGU8W3N0cmluZywgVF0+e1xuXHRlbnRyeTogTmFtZXNwYWNlRW50cnk8VD4gfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKGVudHJ5OiBOYW1lc3BhY2VFbnRyeTxUPiB8IG51bGwgPSBudWxsKSB7XG5cdFx0dGhpcy5lbnRyeSA9IGVudHJ5O1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuZW50cnkpIHtcblx0XHRcdHJldHVybiBcIlwiO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5lbnRyeS50b1N0cmluZygpO1xuXHRcdH1cblx0fVxuXG5cdGdldChrZXk6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tdXN0R2V0KGtleSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdG11c3RHZXQoa2V5OiBzdHJpbmcpOiBUIHtcblx0XHRpZiAoIXRoaXMuZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihga2V5ICR7a2V5fSBub3QgZm91bmRgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZW50cnkubXVzdEdldChrZXkpO1xuXHR9XG5cblx0aW5zZXJ0KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IE5hbWVzcGFjZTxUPiB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiB0aGlzLm11c3RJbnNlcnQoa2V5LCB2YWx1ZSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdG11c3RJbnNlcnQoa2V5OiBzdHJpbmcsIHZhbHVlOiBUKTogTmFtZXNwYWNlPFQ+IHtcblx0XHRpZiAoIXRoaXMuZW50cnkpIHtcblx0XHRcdHJldHVybiBuZXcgTmFtZXNwYWNlKG5ldyBOYW1lc3BhY2VFbnRyeShrZXksIHZhbHVlLCBudWxsLCBudWxsKSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgTmFtZXNwYWNlKHRoaXMuZW50cnkubXVzdEluc2VydChrZXksIHZhbHVlKSk7XG5cdH1cblxuXHQqW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmF0b3I8W3N0cmluZywgVF0+IHtcblx0XHRpZiAoIXRoaXMuZW50cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0eWllbGQqIHRoaXMuZW50cnk7XG5cdH1cbn1cblxuY2xhc3MgTmFtZXNwYWNlRW50cnk8VD4gaW1wbGVtZW50cyBJdGVyYWJsZTxbc3RyaW5nLCBUXT57XG5cdGtleTogc3RyaW5nO1xuXHR2YWx1ZTogVDtcblx0bGVmdDogTmFtZXNwYWNlRW50cnk8VD4gfCBudWxsID0gbnVsbDtcblx0cmlnaHQ6IE5hbWVzcGFjZUVudHJ5PFQ+IHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0a2V5OiBzdHJpbmcsXG5cdFx0dmFsdWU6IFQsXG5cdFx0bGVmdDogTmFtZXNwYWNlRW50cnk8VD4gfCBudWxsLFxuXHRcdHJpZ2h0OiBOYW1lc3BhY2VFbnRyeTxUPiB8IG51bGxcblx0KSB7XG5cdFx0dGhpcy5rZXkgPSBrZXk7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHRcdHRoaXMubGVmdCA9IGxlZnQ7XG5cdFx0dGhpcy5yaWdodCA9IHJpZ2h0O1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRsZXQgc3RyID0gXCJcIjtcblx0XHRpZiAodGhpcy5sZWZ0KSB7XG5cdFx0XHRzdHIgKz0gdGhpcy5sZWZ0LnRvU3RyaW5nKCkgKyBcIiwgXCI7XG5cdFx0fVxuXHRcdHN0ciArPSBgJHt0aGlzLmtleX06ICR7dGhpcy52YWx1ZX1gO1xuXHRcdGlmICh0aGlzLnJpZ2h0KSB7XG5cdFx0XHRzdHIgKz0gXCIsIFwiICsgdGhpcy5yaWdodC50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RyO1xuXHR9XG5cblx0bXVzdEdldChrZXk6IHN0cmluZyk6IFQge1xuXHRcdGxldCBjdXJyZW50OiBOYW1lc3BhY2VFbnRyeTxUPiA9IHRoaXM7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGlmIChrZXkgPCBjdXJyZW50LmtleSkge1xuXHRcdFx0XHRpZiAoIWN1cnJlbnQubGVmdCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihga2V5ICR7a2V5fSBub3QgZm91bmRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXJyZW50ID0gY3VycmVudC5sZWZ0O1xuXHRcdFx0fSBlbHNlIGlmIChrZXkgPiBjdXJyZW50LmtleSkge1xuXHRcdFx0XHRpZiAoIWN1cnJlbnQucmlnaHQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGtleSAke2tleX0gbm90IGZvdW5kYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VycmVudCA9IGN1cnJlbnQucmlnaHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gY3VycmVudC52YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRtdXN0SW5zZXJ0KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IE5hbWVzcGFjZUVudHJ5PFQ+IHtcblx0XHRpZiAoa2V5IDwgdGhpcy5rZXkpIHtcblx0XHRcdGlmICghdGhpcy5sZWZ0KSB7XG5cdFx0XHRcdHJldHVybiBuZXcgTmFtZXNwYWNlRW50cnkoXG5cdFx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdFx0dGhpcy52YWx1ZSxcblx0XHRcdFx0XHRuZXcgTmFtZXNwYWNlRW50cnkoa2V5LCB2YWx1ZSwgbnVsbCwgbnVsbCksXG5cdFx0XHRcdFx0dGhpcy5yaWdodCxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgTmFtZXNwYWNlRW50cnkoXG5cdFx0XHRcdHRoaXMua2V5LFxuXHRcdFx0XHR0aGlzLnZhbHVlLFxuXHRcdFx0XHR0aGlzLmxlZnQubXVzdEluc2VydChrZXksIHZhbHVlKSxcblx0XHRcdFx0dGhpcy5yaWdodCxcblx0XHRcdCk7XG5cdFx0fSBlbHNlIGlmIChrZXkgPiB0aGlzLmtleSkge1xuXHRcdFx0aWYgKCF0aGlzLnJpZ2h0KSB7XG5cdFx0XHRcdHJldHVybiBuZXcgTmFtZXNwYWNlRW50cnkoXG5cdFx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdFx0dGhpcy52YWx1ZSxcblx0XHRcdFx0XHR0aGlzLmxlZnQsXG5cdFx0XHRcdFx0bmV3IE5hbWVzcGFjZUVudHJ5KGtleSwgdmFsdWUsIG51bGwsIG51bGwpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBOYW1lc3BhY2VFbnRyeShcblx0XHRcdFx0dGhpcy5rZXksXG5cdFx0XHRcdHRoaXMudmFsdWUsXG5cdFx0XHRcdHRoaXMubGVmdCxcblx0XHRcdFx0dGhpcy5yaWdodC5tdXN0SW5zZXJ0KGtleSwgdmFsdWUpLFxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBkdXBsaWNhdGUga2V5ICR7a2V5fWApXG5cdFx0fVxuXHR9XG5cblx0KltTeW1ib2wuaXRlcmF0b3JdKCk6IEl0ZXJhdG9yPFtzdHJpbmcsIFRdPiB7XG5cdFx0aWYgKHRoaXMubGVmdCkge1xuXHRcdFx0eWllbGQqIHRoaXMubGVmdDtcblx0XHR9XG5cdFx0eWllbGQgW3RoaXMua2V5LCB0aGlzLnZhbHVlXTtcblx0XHRpZiAodGhpcy5yaWdodCkge1xuXHRcdFx0eWllbGQqIHRoaXMucmlnaHQ7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IG91ck5hbWVzcGFjZSA9IFwib3VyTmFtZXNwYWNlXCI7XG5cbmNvbnN0IHRoZWlyTmFtZXNwYWNlID0gXCJ0aGVpck5hbWVzcGFjZVwiO1xuXG5jb25zdCBpbnRlcm5hbE5hbWVzcGFjZUluc2VydE1hcCA9IFwibmFtZXNwYWNlSW5zZXJ0TWFwXCI7XG5cbmNvbnN0IHVucGFja0FuZE1heWJlQWRkVG9PdXJzID0gXCJ1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc1wiO1xuXG5jb25zdCB1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc0RlZmluaXRpb24gPSBgY29uc3QgJHt1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc30gPSAoW2luc2VydGFibGUsIHJldF0pID0+IHtcblx0aWYgKGluc2VydGFibGUpIHtcblx0XHQke291ck5hbWVzcGFjZX0gPSAke2ludGVybmFsTmFtZXNwYWNlSW5zZXJ0TWFwfSgke291ck5hbWVzcGFjZX0sIGluc2VydGFibGUpO1xuXHR9XG5cdHJldHVybiByZXQ7XG59O2BcblxuY29uc3QgaW50ZXJuYWxOZXdBdG9tID0gXCJuZXdBdG9tXCI7XG5cbmNvbnN0IGludGVybmFsTmV3TGlzdCA9IFwibmV3TGlzdFwiO1xuXG5jb25zdCBpbnRlcm5hbE5ld0Jsb2NrID0gXCJuZXdCbG9ja1wiO1xuXG5jb25zdCBpbnRlcm5hbE1hdGNoID0gXCJtYXRjaFwiO1xuXG5jb25zdCBpbnRlcm5hbElzTGlzdCA9IFwiaXNMaXN0XCI7XG5cbmNvbnN0IGludGVybmFsSXNNYXAgPSBcImlzTWFwXCI7XG5cbmNvbnN0IGludGVybmFsTmV3TWF0Y2hFcnJvciA9IFwiaW50ZXJuYWxOZXdNYXRjaEVycm9yXCI7XG5cbmZ1bmN0aW9uIHN0cmluZ01hcChzdHI6IHN0cmluZywgcHJlZGljYXRlOiAoY2hhcjogc3RyaW5nKSA9PiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgb3V0ID0gXCJcIjtcblx0Zm9yIChsZXQgY2hhciBvZiBzdHIpIHtcblx0XHRvdXQgKz0gcHJlZGljYXRlKGNoYXIpO1xuXHR9XG5cdHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIHRvSmF2YXNjcmlwdFN0cmluZyhzdHI6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBlc2MgPSBzdHJpbmdNYXAoc3RyLCBjaGFyID0+IHtcblx0XHRpZiAoY2hhciA9PT0gXCJcXFxcXCIpIHtcblx0XHRcdHJldHVybiBcIlxcXFxcXFxcXCI7XG5cdFx0fSBlbHNlIGlmIChjaGFyID09PSAnXCInKSB7XG5cdFx0XHRyZXR1cm4gJ1xcXFxcIic7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBjaGFyO1xuXHRcdH1cblx0fSk7XG5cdHJldHVybiBgXCIke2VzY31cImA7XG59XG5cbmNvbnN0IHN5bWJvbEFzc2lnbiA9IFwiPVwiO1xuXG5mdW5jdGlvbiBhc0Fzc2lnbm1lbnQoY2FsbDogQ2FsbCk6IHthc3NpZ25lZTogRXhwcmVzc2lvbiwgdmFsdWU6IEV4cHJlc3Npb259IHwgbnVsbCB7XG5cdGlmIChjYWxsLmZpcnN0LmtpbmQgIT09IFwicmVmXCJcblx0XHR8fCBjYWxsLmZpcnN0LnZhbHVlICE9PSBzeW1ib2xBc3NpZ25cblx0XHR8fCBjYWxsLmFyZ3VtZW50cy5sZW5ndGggIT09IDIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHR9XG5cdHJldHVybiB7IGFzc2lnbmVlOiBjYWxsLmFyZ3VtZW50c1swXSEsIHZhbHVlOiBjYWxsLmFyZ3VtZW50c1sxXSEgfTtcbn1cblxuY29uc3Qgc3ltYm9sRGVmaW5lID0gXCItPlwiO1xuXG5jb25zdCBpZGVudERlZmluZSA9IFwiZGVmXCI7XG5cbmZ1bmN0aW9uIGFzRGVmaW5lKGNhbGw6IENhbGwpOiB7YXJnczogQXRvbVtdLCBibG9jazogQmxvY2t9IHwgbnVsbCB7XG5cdGlmIChjYWxsLmZpcnN0LmtpbmQgIT09IFwicmVmXCJcblx0XHR8fCAoY2FsbC5maXJzdC52YWx1ZSAhPT0gc3ltYm9sRGVmaW5lICYmIGNhbGwuZmlyc3QudmFsdWUgIT09IGlkZW50RGVmaW5lKVxuXHRcdHx8IGNhbGwuYXJndW1lbnRzLmxlbmd0aCAhPT0gMikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0bGV0IGFyZ3MgPSBjYWxsLmFyZ3VtZW50c1swXSE7XG5cdGlmIChhcmdzLmtpbmQgIT09IFwibGlzdFwiKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0aWYgKCFhcmdzLmVsZW1lbnRzLmV2ZXJ5KGUgPT4gZS5raW5kID09PSBcImF0b21cIikpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fTtcblx0bGV0IGJsb2NrID0gY2FsbC5hcmd1bWVudHNbMV0hO1xuXHRpZiAoYmxvY2sua2luZCAhPT0gXCJibG9ja1wiKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0cmV0dXJuIHsgYXJnczogYXJncy5lbGVtZW50cyBhcyBBdG9tW10sIGJsb2NrIH1cbn1cblxuZnVuY3Rpb24gbmV3SmF2YXNjcmlwdE51bWJlcihuOiBudW1iZXIgfCBiaWdpbnQpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7bn1uYDtcbn1cblxuY2xhc3MgQ29tcGlsZXIge1xuXHR2YXJOYW1lczogTmFtZXNwYWNlPHN0cmluZz47XG5cdGJvZHk6IEV4cHJlc3Npb25bXTtcblx0dGVtcG9yYXJpZXNJbmRleDogbnVtYmVyO1xuXHRjb2RlID0gXCJcIjtcblxuXHRjb25zdHJ1Y3Rvcih2YXJOYW1lczogTmFtZXNwYWNlPHN0cmluZz4sIGJvZHk6IEV4cHJlc3Npb25bXSwgdGVtcG9yYXJpZXNPZmZzZXQgPSAwKSB7XG5cdFx0dGhpcy52YXJOYW1lcyA9IHZhck5hbWVzO1xuXHRcdHRoaXMuYm9keSA9IGJvZHk7XG5cdFx0dGhpcy50ZW1wb3Jhcmllc0luZGV4ID0gdGVtcG9yYXJpZXNPZmZzZXQ7XG5cdH1cblxuXHRjb21waWxlKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuYm9keS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuY29kZSA9IFwicmV0dXJuIFtudWxsLCBudWxsXTtcIlxuXHRcdH1cblx0XHRpZiAodGhpcy5jb2RlICE9PSBcIlwiKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb2RlO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5ib2R5Lmxlbmd0aC0xOyBpKyspIHtcblx0XHRcdGxldCBleHByID0gdGhpcy5ib2R5W2ldITtcblx0XHRcdGlmIChleHByLmtpbmQgIT09IFwiY2FsbFwiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGFzc2lnbiA9IGFzQXNzaWdubWVudChleHByKTtcblx0XHRcdGlmICghYXNzaWduKSB7XG5cdFx0XHRcdHRoaXMuY29kZSArPSB0aGlzLmV4cHIoZXhwcikgKyBcIjtcIjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYXNzaWdubWVudChcblx0XHRcdFx0XHRhc3NpZ24uYXNzaWduZWUsXG5cdFx0XHRcdFx0dGhpcy5hZGRUZW1wb3JhcnlXaXRoKHRoaXMuZXhwcihhc3NpZ24uYXNzaWduZWUpKSxcblx0XHRcdFx0XHR0aGlzLmFkZFRlbXBvcmFyeVdpdGgodGhpcy5leHByKGFzc2lnbi52YWx1ZSkpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRsZXQgbGFzdCA9IHRoaXMuZXhwcih0aGlzLmJvZHlbdGhpcy5ib2R5Lmxlbmd0aC0xXSEpO1xuXHRcdHRoaXMuY29kZSArPSBgcmV0dXJuIFtudWxsLCAke2xhc3R9XTtgXG5cdFx0cmV0dXJuIHRoaXMuY29kZTtcblx0fVxuXG5cdGV4cHIoZXhwcjogRXhwcmVzc2lvbik6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChleHByLmtpbmQpIHtcblx0XHRjYXNlIFwidW5pdFwiOlxuXHRcdFx0cmV0dXJuIFwibnVsbFwiO1xuXHRcdGNhc2UgXCJudW1iZXJcIjpcblx0XHRcdHJldHVybiBuZXdKYXZhc2NyaXB0TnVtYmVyKGV4cHIudmFsdWUpO1xuXHRcdGNhc2UgXCJzdHJpbmdcIjpcblx0XHRcdHJldHVybiBgJHt0b0phdmFzY3JpcHRTdHJpbmcoZXhwci52YWx1ZSl9YFxuXHRcdGNhc2UgXCJhdG9tXCI6XG5cdFx0XHRyZXR1cm4gYCgke2ludGVybmFsTmV3QXRvbX0oJHt0b0phdmFzY3JpcHRTdHJpbmcoZXhwci52YWx1ZSl9KSlgO1xuXHRcdGNhc2UgXCJyZWZcIjpcblx0XHRcdHJldHVybiB0aGlzLnZhck5hbWVzLmdldChleHByLnZhbHVlKVxuXHRcdFx0XHQ/PyBgKCR7b3VyTmFtZXNwYWNlfS5tdXN0R2V0KCR7dG9KYXZhc2NyaXB0U3RyaW5nKGV4cHIudmFsdWUpfSkpYDtcblx0XHRjYXNlIFwiY2FsbFwiOlxuXHRcdFx0bGV0IGRlZmluZSA9IGFzRGVmaW5lKGV4cHIpO1xuXHRcdFx0aWYgKCFkZWZpbmUpIHtcblx0XHRcdFx0bGV0IGZpcnN0ID0gdGhpcy5leHByKGV4cHIuZmlyc3QpO1xuXHRcdFx0XHRsZXQgYXJncyA9IGV4cHIuYXJndW1lbnRzLm1hcChhcmcgPT4gdGhpcy5leHByKGFyZykpLmpvaW4oXCIsIFwiKTtcblx0XHRcdFx0cmV0dXJuIGAoJHt1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc30oJHtmaXJzdH0oJHtvdXJOYW1lc3BhY2V9LCAke2FyZ3N9KSkpYDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmRlZmluZShkZWZpbmUuYXJncywgZGVmaW5lLmJsb2NrKTtcblx0XHRcdH1cblx0XHRjYXNlIFwibGlzdFwiOlxuXHRcdFx0bGV0IGVsZW1lbnRzID0gZXhwci5lbGVtZW50cy5tYXAoZSA9PiB0aGlzLmV4cHIoZSkpLmpvaW4oXCIsIFwiKTtcblx0XHRcdHJldHVybiBgKCR7aW50ZXJuYWxOZXdMaXN0fSgke2VsZW1lbnRzfSkpYDtcblx0XHRjYXNlIFwiYmxvY2tcIjpcblx0XHRcdGxldCBjb250ZW50ID0gbmV3IENvbXBpbGVyKHRoaXMudmFyTmFtZXMsIGV4cHIuZXhwcmVzc2lvbnMpLmNvbXBpbGUoKTtcblx0XHRcdHJldHVybiBgKCR7aW50ZXJuYWxOZXdCbG9ja30oJHtvdXJOYW1lc3BhY2V9LCBmdW5jdGlvbigke3RoZWlyTmFtZXNwYWNlfSwgLi4uYXJncykge1xcbmBcblx0XHRcdFx0KyBcImlmIChhcmdzLmxlbmd0aCAhPT0gMCkge1xcblwiXG5cdFx0XHRcdCsgXCJcXHR0aHJvdyBuZXcgRXJyb3IoJ2Nhbm5vdCBjYWxsIGJhc2ljIGJsb2NrIHdpdGggYXJndW1lbnRzJyk7XFxuXCJcblx0XHRcdFx0KyBcIn1cXG5cIlxuXHRcdFx0XHQrIGBsZXQgJHtvdXJOYW1lc3BhY2V9ID0gdGhpcztcXG5gXG5cdFx0XHRcdCsgdW5wYWNrQW5kTWF5YmVBZGRUb091cnNEZWZpbml0aW9uICsgJ1xcblxcbidcblx0XHRcdFx0KyBjb250ZW50ICsgXCJcXG59KSlcIjtcblx0XHR9XG5cdH1cblxuXHRkZWZpbmUoYXJnczogQXRvbVtdLCBibG9jazogQmxvY2spOiBzdHJpbmcge1xuXHRcdGxldCBuZXh0ID0gdGhpcy52YXJOYW1lcztcblx0XHRsZXQgdmFyaWFibGVIZWFkZXIgPSBcIlwiO1xuXHRcdGxldCBqc0FyZ3MgPSBcIlwiO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKykge1xuXHRcdFx0bGV0IGFyZyA9IGFyZ3NbaV0hO1xuXHRcdFx0bGV0IHRlbXAgPSBgXyR7aX1gO1xuXHRcdFx0bGV0IHZhck5hbWUgPSB0b0phdmFzY3JpcHRWYXJOYW1lKGFyZy52YWx1ZSk7XG5cdFx0XHRsZXQgbWF5YmVOZXh0ID0gbmV4dC5pbnNlcnQoYXJnLnZhbHVlLCB2YXJOYW1lKTtcblx0XHRcdGlmIChtYXliZU5leHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRuZXh0ID0gbWF5YmVOZXh0O1xuXHRcdFx0XHR2YXJpYWJsZUhlYWRlciArPSBgY29uc3QgJHt2YXJOYW1lfSA9ICR7dGVtcH07XFxuYDtcblx0XHRcdH1cblx0XHRcdHZhcmlhYmxlSGVhZGVyICs9IGAke291ck5hbWVzcGFjZX0gPSAke291ck5hbWVzcGFjZX0ubXVzdEluc2VydChgXG5cdFx0XHRcdCsgYCR7dG9KYXZhc2NyaXB0U3RyaW5nKGFyZy52YWx1ZSl9LCAke3RlbXB9KTtcXG5gO1xuXHRcdFx0anNBcmdzICs9IGAsICR7dGVtcH1gO1xuXHRcdH1cblxuXHRcdGxldCBjb250ZW50ID0gbmV3IENvbXBpbGVyKHRoaXMudmFyTmFtZXMsIGJsb2NrLmV4cHJlc3Npb25zLCBhcmdzLmxlbmd0aCkuY29tcGlsZSgpO1xuXHRcdHJldHVybiBgKCR7aW50ZXJuYWxOZXdCbG9ja30oJHtvdXJOYW1lc3BhY2V9LCBmdW5jdGlvbigke3RoZWlyTmFtZXNwYWNlfSR7anNBcmdzfSkge1xcbmBcblx0XHRcdCsgYGlmIChhcmd1bWVudHMubGVuZ3RoLTEgIT09ICR7YXJncy5sZW5ndGh9KSB7XFxuYFxuXHRcdFx0Ly8gVE9ETzogdGhyb3cgTWF0Y2hFcnJvclxuXHRcdFx0KyBgXFx0dGhyb3cgbmV3IEVycm9yKFxcYGV4cGVjdGVkICR7YXJncy5sZW5ndGh9IGFyZ3VtZW50KHMpLCBnb3QgXFwke2FyZ3VtZW50cy5sZW5ndGgtMX1cXGApO1xcbmBcblx0XHRcdCsgXCJ9XFxuXCJcblx0XHRcdCtgbGV0ICR7b3VyTmFtZXNwYWNlfSA9IHRoaXM7XFxuYFxuXHRcdFx0KyB1bnBhY2tBbmRNYXliZUFkZFRvT3Vyc0RlZmluaXRpb24gKyAnXFxuJ1xuXHRcdFx0KyB2YXJpYWJsZUhlYWRlciArICdcXG5cXG4nXG5cdFx0XHQrIGNvbnRlbnQgKyBcIlxcbn0pKVwiO1xuXHR9XG5cblx0YXNzaWdubWVudChhc3NpZ25lZTogRXhwcmVzc2lvbiwgdGVtcEFzc2lnbmVlOiBzdHJpbmcsIHRlbXBWYWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGFzc2lnbmVlLmtpbmQgPT09IFwidW5pdFwiXG5cdFx0XHR8fCBhc3NpZ25lZS5raW5kID09PSBcIm51bWJlclwiXG5cdFx0XHR8fCBhc3NpZ25lZS5raW5kID09PSBcInN0cmluZ1wiXG5cdFx0KSB7XG5cdFx0XHR0aGlzLmNvZGUgKz0gYGlmICgke3RlbXBBc3NpZ25lZX0gIT09ICR7dGVtcFZhbHVlfSkge1xcbmBcblx0XHRcdFx0KyBgXFx0dGhyb3cgJHtpbnRlcm5hbE5ld01hdGNoRXJyb3J9KCR7dGVtcEFzc2lnbmVlfSwgJHt0ZW1wVmFsdWV9KTtcXG5gXG5cdFx0XHRcdCsgXCJ9XFxuXCI7XG5cdFx0fSBlbHNlIGlmIChhc3NpZ25lZS5raW5kID09PSBcImF0b21cIikge1xuXHRcdFx0bGV0IHZhck5hbWUgPSB0b0phdmFzY3JpcHRWYXJOYW1lKGFzc2lnbmVlLnZhbHVlKTtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy52YXJOYW1lcy5pbnNlcnQoYXNzaWduZWUudmFsdWUsIHZhck5hbWUpO1xuXHRcdFx0aWYgKG5leHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLnZhck5hbWVzID0gbmV4dDtcblx0XHRcdFx0dGhpcy5jb2RlICs9IGBjb25zdCAke3Zhck5hbWV9ID0gJHt0ZW1wVmFsdWV9O1xcbmA7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvZGUgKz0gYCR7b3VyTmFtZXNwYWNlfSA9ICR7b3VyTmFtZXNwYWNlfS5tdXN0SW5zZXJ0KGBcblx0XHRcdFx0KyBgJHt0b0phdmFzY3JpcHRTdHJpbmcoYXNzaWduZWUudmFsdWUpfSwgJHt0ZW1wVmFsdWV9KTtcXG5gO1xuXHRcdH0gZWxzZSBpZiAoYXNzaWduZWUua2luZCA9PT0gXCJsaXN0XCIpIHtcblx0XHRcdGxldCBleHBlY3RlZExlbmd0aCA9IG5ld0phdmFzY3JpcHROdW1iZXIoYXNzaWduZWUuZWxlbWVudHMubGVuZ3RoKTtcblx0XHRcdHRoaXMuY29kZSArPSBgaWYgKCEke2ludGVybmFsSXNMaXN0fSgke3RlbXBWYWx1ZX0pKSB7XFxuYFxuXHRcdFx0XHQrIGBcXHR0aHJvdyAke2ludGVybmFsTmV3TWF0Y2hFcnJvcn0oJHt0ZW1wQXNzaWduZWV9LCAke3RlbXBWYWx1ZX0pO1xcbmBcblx0XHRcdFx0KyBcIn1cXG5cIlxuXHRcdFx0XHQrIGBpZiAoJHt0ZW1wVmFsdWV9LmxlbigpICE9PSAke2V4cGVjdGVkTGVuZ3RofSkge1xcbmBcblx0XHRcdFx0KyBgXFx0dGhyb3cgJHtpbnRlcm5hbE5ld01hdGNoRXJyb3J9KFxcbmBcblx0XHRcdFx0KyBgXFx0XFx0JHt0ZW1wQXNzaWduZWV9LFxcbmBcblx0XHRcdFx0KyBgXFx0XFx0JHt0ZW1wVmFsdWV9LFxcbmBcblx0XHRcdFx0KyBgXFx0XFx0XFxgZXhwZWN0ZWQgbGVuZ3RoICR7YXNzaWduZWUuZWxlbWVudHMubGVuZ3RofSwgZ290IFxcJHske3RlbXBWYWx1ZX0ubGVuKCl9XFxgLFxcbmBcblx0XHRcdFx0KyBgXFx0KTtcXG5gXG5cdFx0XHRcdCsgXCJ9XFxuXCI7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFzc2lnbmVlLmVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGxldCBlbGVtZW50ID0gYXNzaWduZWUuZWxlbWVudHNbaV0hO1xuXHRcdFx0XHRsZXQgZWxlbWVudEFzc2lnbmVlID0gdGhpcy5hZGRUZW1wb3JhcnlXaXRoKFxuXHRcdFx0XHRcdGAoJHt0ZW1wQXNzaWduZWV9LmF0KCR7bmV3SmF2YXNjcmlwdE51bWJlcihpKX0pKWAsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGxldCBlbGVtZW50VmFsdWUgPSB0aGlzLmFkZFRlbXBvcmFyeVdpdGgoXG5cdFx0XHRcdFx0YCgke3RlbXBWYWx1ZX0uYXQoJHtuZXdKYXZhc2NyaXB0TnVtYmVyKGkpfSkpYCxcblx0XHRcdFx0KTtcblx0XHRcdFx0dGhpcy5hc3NpZ25tZW50KGVsZW1lbnQsIGVsZW1lbnRBc3NpZ25lZSwgZWxlbWVudFZhbHVlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHRlbXAgPSB0aGlzLm5ld1RlbXBvcmFyeSgpO1xuXHRcdFx0dGhpcy5jb2RlICs9IGBjb25zdCAke3RlbXB9ID0gYFxuXHRcdFx0XHQrIGAke2ludGVybmFsTWF0Y2h9KCR7dGVtcEFzc2lnbmVlfSwgJHt0ZW1wVmFsdWV9KTtcXG5gXG5cdFx0XHRcdCsgYGlmICgke2ludGVybmFsSXNNYXB9KCR7dGVtcH0pKSB7XFxuYFxuXHRcdFx0XHQrIGBcXHQke291ck5hbWVzcGFjZX0gPSAke2ludGVybmFsTmFtZXNwYWNlSW5zZXJ0TWFwfSgke291ck5hbWVzcGFjZX0sICR7dGVtcH0pO1xcbmBcblx0XHRcdFx0KyBcIn1cXG5cIjtcblx0XHR9XG5cdH1cblxuXHRuZXdUZW1wb3JhcnkoKTogc3RyaW5nIHtcblx0XHRsZXQgbmFtZSA9IGBfJHt0aGlzLnRlbXBvcmFyaWVzSW5kZXh9YFxuXHRcdHRoaXMudGVtcG9yYXJpZXNJbmRleCsrO1xuXHRcdHJldHVybiBuYW1lO1xuXHR9XG5cblx0YWRkVGVtcG9yYXJ5V2l0aChleHByOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGxldCBuYW1lID0gdGhpcy5uZXdUZW1wb3JhcnkoKTtcblx0XHR0aGlzLmNvZGUgKz0gYGNvbnN0ICR7bmFtZX0gPSAke2V4cHJ9O1xcbmA7XG5cdFx0cmV0dXJuIG5hbWU7XG5cdH1cbn1cblxudHlwZSBWYWx1ZSA9IFxuXHR8IG51bGxcblx0fCBib29sZWFuXG5cdHwgYmlnaW50XG5cdHwgc3RyaW5nXG5cdHwgUmV0dXJuXG5cdHwgTXV0XG5cdHwgVW5pcXVlXG5cdHwgUnVudGltZUJsb2NrXG5cdHwgUnVudGltZUF0b21cblx0fCBSdW50aW1lTGlzdFxuXHR8IFJ1bnRpbWVNYXA7XG5cbmZ1bmN0aW9uIHZhbHVlU3RyaW5nKHY6IFZhbHVlKTogc3RyaW5nIHtcblx0aWYgKHYgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gXCIoKVwiO1xuXHR9IGVsc2UgaWYgKHR5cGVvZiB2ID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRyZXR1cm4gXCJibG9ja1wiO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB2LnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gdmFsdWVFcXVhbHModjE6IFZhbHVlLCB2MjogVmFsdWUpOiBib29sZWFuIHtcblx0aWYgKHYxID09PSBudWxsXG5cdFx0fHwgdHlwZW9mIHYxID09PSBcImJvb2xlYW5cIlxuXHRcdHx8IHR5cGVvZiB2MSA9PT0gXCJiaWdpbnRcIlxuXHRcdHx8IHR5cGVvZiB2MSA9PT0gXCJzdHJpbmdcIlxuXHQpIHtcblx0XHRyZXR1cm4gdjEgPT09IHYyO1xuXHR9IGVsc2UgaWYgKHR5cGVvZiB2MSA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiB2MS5lcXVhbHModjIpO1xuXHR9XG59XG5cbmNsYXNzIFJldHVybiB7XG5cdHZhbHVlOiBWYWx1ZTtcblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogVmFsdWUpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IFZhbHVlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBSZXR1cm4pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZUVxdWFscyh0aGlzLnZhbHVlLCBvdGhlci52YWx1ZSk7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgKHJldHVybiAke3ZhbHVlU3RyaW5nKHRoaXMudmFsdWUpfSlgO1xuXHR9XG59XG5cbmNsYXNzIE11dCB7XG5cdHZhbHVlOiBWYWx1ZTtcblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogVmFsdWUpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IFZhbHVlKTogYm9vbGVhbiB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBNdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZUVxdWFscyh0aGlzLnZhbHVlLCBvdGhlci52YWx1ZSk7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgKG11dCAke3ZhbHVlU3RyaW5nKHRoaXMudmFsdWUpfSlgO1xuXHR9XG59XG5cbmNsYXNzIFVuaXF1ZSB7XG5cdGVxdWFscyhvdGhlcjogVmFsdWUpOiBib29sZWFuIHtcblx0XHRpZiAoIShvdGhlciBpbnN0YW5jZW9mIFVuaXF1ZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMgPT09IG90aGVyO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gXCJ1bmlxdWVcIjtcblx0fVxufVxuXG50eXBlIFJ1bnRpbWVCbG9jayA9IHtcblx0bmFtZXNwYWNlOiBOYW1lc3BhY2U8VmFsdWU+O1xuXHRvcmlnaW5hbDogUnVudGltZUJsb2NrRnVuY3Rpb247XG5cdChuczogTmFtZXNwYWNlPFZhbHVlPiwgLi4uYXJnczogKFZhbHVlIHwgdW5kZWZpbmVkKVtdKTpcblx0XHRSZXR1cm5UeXBlPFJ1bnRpbWVCbG9ja0Z1bmN0aW9uPjtcbn07XG5cbnR5cGUgUnVudGltZUJsb2NrRnVuY3Rpb24gPSAobnM6IE5hbWVzcGFjZTxWYWx1ZT4sIC4uLmFyZ3M6IChWYWx1ZSB8IHVuZGVmaW5lZClbXSlcblx0PT4gW1J1bnRpbWVNYXAgfCBudWxsLCBWYWx1ZV07XG5cbmNsYXNzIFJ1bnRpbWVBdG9tIHtcblx0dmFsdWU6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBWYWx1ZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghKG90aGVyIGluc3RhbmNlb2YgUnVudGltZUF0b20pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnZhbHVlID09PSBvdGhlci52YWx1ZTtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAoYXRvbSAke3ZhbHVlU3RyaW5nKHRoaXMudmFsdWUpfSlgO1xuXHR9XG59XG5cbi8vIFRPRE86IGVmZmljaWVudCBsaXN0XG5jbGFzcyBSdW50aW1lTGlzdCBpbXBsZW1lbnRzIEl0ZXJhYmxlPFZhbHVlPiB7XG5cdGVsZW1lbnRzOiBWYWx1ZVtdO1xuXG5cdGNvbnN0cnVjdG9yKC4uLmVsZW1lbnRzOiBWYWx1ZVtdKSB7XG5cdFx0dGhpcy5lbGVtZW50cyA9IGVsZW1lbnRzO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBWYWx1ZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghKG90aGVyIGluc3RhbmNlb2YgUnVudGltZUxpc3QpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmVsZW1lbnRzLmxlbmd0aCAhPT0gb3RoZXIuZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICghdmFsdWVFcXVhbHModGhpcy5lbGVtZW50c1tpXSEsIG90aGVyLmVsZW1lbnRzW2ldISkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGxlbigpOiBiaWdpbnQge1xuXHRcdHJldHVybiBCaWdJbnQodGhpcy5lbGVtZW50cy5sZW5ndGgpO1xuXHR9XG5cblx0YXQoaWR4OiBiaWdpbnQpOiBWYWx1ZSB7XG5cdFx0aWYgKGlkeCA8IDAgfHwgaWR4ID49IHRoaXMuZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFxuXHRcdFx0XHRsaXN0IG91dCBvZiBib3VuZHMgKCR7aWR4fSB3aXRoIGxlbmd0aCAke3RoaXMuZWxlbWVudHMubGVuZ3RofSlgLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudHNbTnVtYmVyKGlkeCldITtcblx0fVxuXG5cdGFwcGVuZCh2YWx1ZTogVmFsdWUpOiBSdW50aW1lTGlzdCB7XG5cdFx0bGV0IG5leHQgPSB0aGlzLmVsZW1lbnRzLnNsaWNlKCk7XG5cdFx0bmV4dC5wdXNoKHZhbHVlKTtcblx0XHRyZXR1cm4gbmV3IFJ1bnRpbWVMaXN0KC4uLm5leHQpO1xuXHR9IFxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFwiW1wiICsgdGhpcy5lbGVtZW50cy5tYXAoZSA9PiB2YWx1ZVN0cmluZyhlKSkuam9pbihcIiBcIikgKyBcIl1cIjtcblx0fVxuXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpIHtcblx0XHR5aWVsZCogdGhpcy5lbGVtZW50cztcblx0fVxufVxuXG4vLyBUT0RPOiBlZmZpY2llbnQgbWFwXG5jbGFzcyBSdW50aW1lTWFwIGltcGxlbWVudHMgSXRlcmFibGU8UnVudGltZUxpc3Q+IHtcblx0ZWxlbWVudHM6IHsga2V5OiBWYWx1ZSwgdmFsdWU6IFZhbHVlIH1bXTtcblx0XG5cdGNvbnN0cnVjdG9yKGVsZW1lbnRzOiB7IGtleTogVmFsdWUsIHZhbHVlOiBWYWx1ZSB9W10pIHtcblx0XHR0aGlzLmVsZW1lbnRzID0gZWxlbWVudHM7XG5cdH1cblxuXHRzdGF0aWMgZnJvbVJ1bnRpbWVWYWx1ZXMobnM6IE5hbWVzcGFjZTxWYWx1ZT4sIC4uLnZhbHVlczogVmFsdWVbXSk6IFJ1bnRpbWVNYXAge1xuXHRcdGxldCBlbGVtZW50cyA9IFtdO1xuXHRcdGZvciAobGV0IHYgb2YgdmFsdWVzKSB7XG5cdFx0XHRsZXQga2V5O1xuXHRcdFx0bGV0IHZhbHVlO1xuXHRcdFx0aWYgKHYgaW5zdGFuY2VvZiBSdW50aW1lQXRvbSkge1xuXHRcdFx0XHRrZXkgPSB2O1xuXHRcdFx0XHR2YWx1ZSA9IG5zLm11c3RHZXQodi52YWx1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHYgaW5zdGFuY2VvZiBSdW50aW1lTGlzdCAmJiB2LmxlbigpID09IDJuKSB7XG5cdFx0XHRcdGtleSA9IHYuYXQoMG4pO1xuXHRcdFx0XHR2YWx1ZSA9IHYuYXQoMW4pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHRcdFwiY2FuIG9ubHkgY3JlYXRlIG1hcCBmcm9tIGxpc3Qgb2YgYXRvbXMgb3IgcGFpcnMgb2Yga2V5IGFuZCB2YWx1ZVwiLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCB7IGtleTogZXhpc3RpbmdLZXkgfSBvZiBlbGVtZW50cykge1xuXHRcdFx0XHRpZiAodmFsdWVFcXVhbHMoa2V5LCBleGlzdGluZ0tleSkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGR1cGxpY2F0ZSBrZXkgJHt2YWx1ZVN0cmluZyhrZXkpfSB3aGlsZSBjcmVhdGluZyBtYXBgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWxlbWVudHMucHVzaCh7IGtleSwgdmFsdWUgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUnVudGltZU1hcChlbGVtZW50cyk7XG5cdH1cblxuXHR0cnlHZXQoa2V5OiBWYWx1ZSk6IFZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0KGtleSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGdldChrZXk6IFZhbHVlKTogVmFsdWUge1xuXHRcdGZvciAobGV0IHsga2V5OiBvdXJLZXksIHZhbHVlIH0gb2YgdGhpcy5lbGVtZW50cykge1xuXHRcdFx0aWYgKHZhbHVlRXF1YWxzKGtleSwgb3VyS2V5KSkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihgbWFwOiBmYWlsZWQgZ2V0dGluZyB2YWx1ZSBmb3Iga2V5ICR7dmFsdWVTdHJpbmcoa2V5KX1gKTtcblx0fVxuXG5cdGluc2VydChrZXk6IFZhbHVlLCB2YWx1ZTogVmFsdWUpOiBSdW50aW1lTWFwIHtcblx0XHRmb3IgKGxldCB7IGtleTogb3VyS2V5IH0gb2YgdGhpcy5lbGVtZW50cykge1xuXHRcdFx0aWYgKHZhbHVlRXF1YWxzKGtleSwgb3VyS2V5KSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG1hcCBpbnNlcnQgZmFpbGVkLCBkdXBsaWNhdGUga2V5ICR7dmFsdWVTdHJpbmcoa2V5KX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0bGV0IG5leHQgPSB0aGlzLmVsZW1lbnRzLnNsaWNlKCk7XG5cdFx0bmV4dC5wdXNoKHsga2V5LCB2YWx1ZSB9KTtcblx0XHRyZXR1cm4gbmV3IFJ1bnRpbWVNYXAobmV4dCk7XG5cdH1cblxuXHRpbnNlcnRNYW55KG90aGVyOiBSdW50aW1lTWFwKTogUnVudGltZU1hcCB7XG5cdFx0Zm9yIChsZXQgeyBrZXkgfSBvZiBvdGhlci5lbGVtZW50cykge1xuXHRcdFx0Zm9yIChsZXQgeyBrZXk6IG91cktleSB9IG9mIHRoaXMuZWxlbWVudHMpIHtcblx0XHRcdFx0aWYgKHZhbHVlRXF1YWxzKGtleSwgb3VyS2V5KSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgbWFwIGluc2VydE1hbnkgZmFpbGVkLCBkdXBsaWNhdGUga2V5ICR7dmFsdWVTdHJpbmcoa2V5KX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRsZXQgbmV4dCA9IHRoaXMuZWxlbWVudHMuc2xpY2UoKTtcblx0XHRmb3IgKGxldCB7IGtleSwgdmFsdWUgfSBvZiBvdGhlci5lbGVtZW50cykge1xuXHRcdFx0bmV4dC5wdXNoKHsga2V5LCB2YWx1ZSB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSdW50aW1lTWFwKG5leHQpO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBWYWx1ZSk6IGJvb2xlYW4ge1xuXHRcdGlmICghKG90aGVyIGluc3RhbmNlb2YgUnVudGltZU1hcCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZWxlbWVudHMubGVuZ3RoICE9PSBvdGhlci5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgeyBrZXksIHZhbHVlIH0gb2YgdGhpcy5lbGVtZW50cykge1xuXHRcdFx0bGV0IGZvdW5kID0gZmFsc2U7XG5cdFx0XHRmb3IgKGxldCB7IGtleTogb3RoZXJLZXksIHZhbHVlOiBvdGhlclZhbHVlIH0gb2Ygb3RoZXIuZWxlbWVudHMpIHtcblx0XHRcdFx0aWYgKHZhbHVlRXF1YWxzKGtleSwgb3RoZXJLZXkpKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlRXF1YWxzKHZhbHVlLCBvdGhlclZhbHVlKSkge1xuXHRcdFx0XHRcdFx0Zm91bmQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFmb3VuZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRsZXQgc3RyID0gXCJtYXBcIjtcblx0XHRmb3IgKGxldCB7IGtleSwgdmFsdWUgfSBvZiB0aGlzLmVsZW1lbnRzKSB7XG5cdFx0XHRzdHIgKz0gYCBbKCR7dmFsdWVTdHJpbmcoa2V5KX0pICgke3ZhbHVlU3RyaW5nKHZhbHVlKX0pXWA7XG5cdFx0fVxuXHRcdHJldHVybiBzdHI7XG5cdH1cblxuXHQqW1N5bWJvbC5pdGVyYXRvcl0oKSB7XG5cdFx0Zm9yIChsZXQgeyBrZXksIHZhbHVlIH0gb2YgdGhpcy5lbGVtZW50cykge1xuXHRcdFx0eWllbGQgbmV3IFJ1bnRpbWVMaXN0KGtleSwgdmFsdWUpO1xuXHRcdH1cblx0fVxufVxuXG5cbmNsYXNzIE1hdGNoRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKG1hdGNoZXI6IFZhbHVlLCB2YWx1ZTogVmFsdWUsIG1lc3NhZ2U/OiBzdHJpbmcpIHtcblx0XHRsZXQgZXJyID0gYGZhaWxlZCBwYXR0ZXJuIG1hdGNoICR7dmFsdWVTdHJpbmcobWF0Y2hlcil9IHdpdGggJHt2YWx1ZVN0cmluZyh2YWx1ZSl9YDtcblx0XHRpZiAobWVzc2FnZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRlcnIgKz0gXCI6IFwiICsgbWVzc2FnZTtcblx0XHR9XG5cdFx0c3VwZXIoZXJyKTtcblx0XHR0aGlzLm5hbWUgPSBcIk1hdGNoRXJyb3JcIjtcblx0fVxufVxuXG5jb25zdCBlbXB0eU5hbWVzcGFjZSA9IG5ldyBOYW1lc3BhY2U8VmFsdWU+KCk7XG5cbmZ1bmN0aW9uIG1hdGNoKG1hdGNoZXI6IFZhbHVlLCB2YWx1ZTogVmFsdWUpOiBudWxsIHwgUnVudGltZU1hcCB7XG5cdGlmIChtYXRjaGVyID09PSBudWxsXG5cdFx0fHwgdHlwZW9mIG1hdGNoZXIgPT09IFwiYm9vbGVhblwiXG5cdFx0fHwgdHlwZW9mIG1hdGNoZXIgPT09IFwiYmlnaW50XCJcblx0XHR8fCB0eXBlb2YgbWF0Y2hlciA9PT0gXCJzdHJpbmdcIlxuXHQpIHtcblx0XHRpZiAobWF0Y2hlciAhPT0gdmFsdWUpIHtcblx0XHRcdHRocm93IG5ldyBNYXRjaEVycm9yKG1hdGNoZXIsIHZhbHVlKTtcblx0XHR9O1xuXHRcdHJldHVybiBudWxsO1xuXHR9IGVsc2UgaWYgKG1hdGNoZXIgaW5zdGFuY2VvZiBSdW50aW1lQXRvbSkge1xuXHRcdHJldHVybiBSdW50aW1lTWFwLmZyb21SdW50aW1lVmFsdWVzKGVtcHR5TmFtZXNwYWNlLCBuZXcgUnVudGltZUxpc3QobWF0Y2hlciwgdmFsdWUpKTtcblx0fSBlbHNlIGlmICh0eXBlb2YgbWF0Y2hlciA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0bGV0IHJlc3VsdCA9IG1hdGNoZXIoZW1wdHlOYW1lc3BhY2UsIHZhbHVlKVsxXTtcblx0XHRpZiAocmVzdWx0ID09PSBudWxsIHx8IHJlc3VsdCBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIm1hdGNoZXIgYmxvY2sgbXVzdCByZXR1cm4gbnVsbCBvciBtYXBcIik7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKG1hdGNoZXIgaW5zdGFuY2VvZiBSdW50aW1lTGlzdCkge1xuXHRcdGlmICghKHZhbHVlIGluc3RhbmNlb2YgUnVudGltZUxpc3QpKSB7XG5cdFx0XHR0aHJvdyBuZXcgTWF0Y2hFcnJvcihtYXRjaGVyLCB2YWx1ZSk7XG5cdFx0fVxuXHRcdGlmIChtYXRjaGVyLmxlbigpICE9PSB2YWx1ZS5sZW4oKSkge1xuXHRcdFx0dGhyb3cgbmV3IE1hdGNoRXJyb3IoXG5cdFx0XHRcdG1hdGNoZXIsXG5cdFx0XHRcdHZhbHVlLFxuXHRcdFx0XHRgZXhwZWN0ZWQgbGVuZ3RoICR7bWF0Y2hlci5sZW4oKX0sIGdvdCAke3ZhbHVlLmxlbigpfWAsXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRsZXQgcmVzdWx0cyA9IFJ1bnRpbWVNYXAuZnJvbVJ1bnRpbWVWYWx1ZXMoZW1wdHlOYW1lc3BhY2UpO1xuXHRcdGZvciAobGV0IGkgPSAwbjsgaSA8IG1hdGNoZXIubGVuKCk7IGkrKykge1xuXHRcdFx0bGV0IHJlc3VsdCA9IG1hdGNoKG1hdGNoZXIuYXQoaSksIHZhbHVlLmF0KGkpKTtcblx0XHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSB7XG5cdFx0XHRcdHJlc3VsdHMgPSByZXN1bHRzLmluc2VydE1hbnkocmVzdWx0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH0gZWxzZSBpZiAobWF0Y2hlciBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApIHtcblx0XHRpZiAoISh2YWx1ZSBpbnN0YW5jZW9mIFJ1bnRpbWVNYXApKSB7XG5cdFx0XHR0aHJvdyBuZXcgTWF0Y2hFcnJvcihtYXRjaGVyLCB2YWx1ZSk7XG5cdFx0fVxuXHRcdGxldCByZXN1bHRzID0gUnVudGltZU1hcC5mcm9tUnVudGltZVZhbHVlcyhuZXcgTmFtZXNwYWNlKCkpO1xuXHRcdGZvciAobGV0IGt2IG9mIG1hdGNoZXIpIHtcblx0XHRcdGxldCBrZXkgPSBrdi5hdCgwbik7XG5cdFx0XHRsZXQgZm91bmQgPSB2YWx1ZS50cnlHZXQoa2V5KTtcblx0XHRcdGlmIChmb3VuZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBNYXRjaEVycm9yKG1hdGNoZXIsIHZhbHVlLCBga2V5ICR7dmFsdWVTdHJpbmcoa2V5KX0gbm90IGZvdW5kYClcblx0XHRcdH1cblx0XHRcdGxldCByZXN1bHQgPSBtYXRjaChrdi5hdCgxbiksIGZvdW5kKTtcblx0XHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSB7XG5cdFx0XHRcdHJlc3VsdHMgPSByZXN1bHRzLmluc2VydE1hbnkocmVzdWx0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH0gZWxzZSBpZiAobWF0Y2hlciBpbnN0YW5jZW9mIE11dCkge1xuXHRcdGlmICghKHZhbHVlIGluc3RhbmNlb2YgTXV0KSkge1xuXHRcdFx0dGhyb3cgbmV3IE1hdGNoRXJyb3IobWF0Y2hlciwgdmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2gobWF0Y2hlci52YWx1ZSwgdmFsdWUudmFsdWUpO1xuXHR9IGVsc2UgaWYgKG1hdGNoZXIgaW5zdGFuY2VvZiBSZXR1cm4pIHtcblx0XHRpZiAoISh2YWx1ZSBpbnN0YW5jZW9mIFJldHVybikpIHtcblx0XHRcdHRocm93IG5ldyBNYXRjaEVycm9yKG1hdGNoZXIsIHZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1hdGNoKG1hdGNoZXIudmFsdWUsIHZhbHVlLnZhbHVlKTtcblx0fSBlbHNlIGlmIChtYXRjaGVyIGluc3RhbmNlb2YgVW5pcXVlKSB7XG5cdFx0aWYgKCFtYXRjaGVyLmVxdWFscyh2YWx1ZSkpIHtcblx0XHRcdHRocm93IG5ldyBNYXRjaEVycm9yKG1hdGNoZXIsIHZhbHVlKTtcblx0XHR9O1xuXHRcdHJldHVybiBudWxsXG5cdH0gZWxzZSB7XG5cdFx0dW5yZWFjaGFibGUoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBwcmludGxuKHM6IHN0cmluZykge1xuXHRjb25zb2xlLmxvZyhzKTtcbn1cblxuZnVuY3Rpb24gY2hlY2tBcmd1bWVudExlbmd0aChleHBlY3RlZDogbnVtYmVyLCBnb3Q6IHsgbGVuZ3RoOiBudW1iZXIgfSk6IHZvaWQge1xuXHRpZiAoZXhwZWN0ZWQgIT09IGdvdC5sZW5ndGgtMSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgZXhwZWN0ZWQgJHtleHBlY3RlZH0gYXJndW1lbnRzLCBnb3QgJHtnb3QubGVuZ3RoLTF9YCk7XG5cdH1cbn1cblxuLy8gVE9ETzogYmV0dGVyIGVycm9yIGhhbmRsaW5nXG5mdW5jdGlvbiBhcmd1bWVudEVycm9yKCk6IEVycm9yIHtcblx0cmV0dXJuIG5ldyBFcnJvcihcImJhZCBhcmd1bWVudCB0eXBlKHMpXCIpO1xufVxuXG5mdW5jdGlvbiBuYW1lc3BhY2VJbnNlcnRNYXAobmFtZXNwYWNlOiBOYW1lc3BhY2U8VmFsdWU+LCBtYXA6IFJ1bnRpbWVNYXApOiBOYW1lc3BhY2U8VmFsdWU+IHtcblx0Zm9yIChsZXQgYXRvbUFuZFZhbHVlIG9mIG1hcCkge1xuXHRcdGxldCBhdG9tID0gYXRvbUFuZFZhbHVlLmF0KDBuKTtcblx0XHRpZiAoIShhdG9tIGluc3RhbmNlb2YgUnVudGltZUF0b20pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG5hbWVzcGFjZSBpbnNlcnQ6IGV4cGVjdGVkIGF0b20sIGdvdCAke3ZhbHVlU3RyaW5nKGF0b20pfWApO1xuXHRcdH1cblx0XHRuYW1lc3BhY2UgPSBuYW1lc3BhY2UubXVzdEluc2VydChhdG9tLnZhbHVlLCBhdG9tQW5kVmFsdWUuYXQoMW4pKTtcblx0fVxuXHRyZXR1cm4gbmFtZXNwYWNlO1xufVxuXG5mdW5jdGlvbiBkZWZpbmVCbG9jayhfOiBOYW1lc3BhY2U8VmFsdWU+LCBtYXRjaGVyOiBWYWx1ZXx1bmRlZmluZWQsIGJsb2NrOiBWYWx1ZXx1bmRlZmluZWQpOiBbUnVudGltZU1hcHxudWxsLCBWYWx1ZV0ge1xuXHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdGlmICh0eXBlb2YgYmxvY2sgIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0fVxuXHRsZXQgZm46IFJ1bnRpbWVCbG9ja0Z1bmN0aW9uID0gKG5zLCAuLi5hcmdzKSA9PiB7XG5cdFx0bGV0IG1hdGNoZWUgPSBuZXcgUnVudGltZUxpc3QoLi4uYXJncyBhcyBWYWx1ZVtdKTtcblx0XHRsZXQgcmVzdWx0ID0gbWF0Y2gobWF0Y2hlciEsIG1hdGNoZWUpO1xuXHRcdGxldCBjYWxsTmFtZXNwYWNlID0gYmxvY2submFtZXNwYWNlO1xuXHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSB7XG5cdFx0XHRjYWxsTmFtZXNwYWNlID0gbmFtZXNwYWNlSW5zZXJ0TWFwKGNhbGxOYW1lc3BhY2UsIHJlc3VsdCk7XG5cdFx0fVxuXHRcdHJldHVybiBibG9jay5vcmlnaW5hbC5jYWxsKGNhbGxOYW1lc3BhY2UsIG5zKTtcblx0fTtcblx0cmV0dXJuIFtudWxsLCBjcmVhdGVOZXdCbG9jayhibG9jay5uYW1lc3BhY2UsIGZuKV07XG59XG5cbmNvbnN0IHN0b3BWYWx1ZSA9IG5ldyBVbmlxdWUoKTtcblxuY29uc3QgYnVpbHRpbkJsb2NrczogW3N0cmluZywgUnVudGltZUJsb2NrRnVuY3Rpb25dW10gPSBbXG5cdFtcImdldFwiLCBmdW5jdGlvbihucywgc3RyKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgxLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2Ygc3RyICE9PSBcInN0cmluZ1wiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBbbnVsbCwgbnMubXVzdEdldChzdHIpXTtcblx0fV0sXG5cdFtcImNhbGxcIiwgZnVuY3Rpb24obnMsIGJsb2NrLCBhcmdzKSB7XG5cdFx0aWYgKGFyZ3VtZW50cy5sZW5ndGggPCAyIHx8IGFyZ3VtZW50cy5sZW5ndGggPiAzKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYmxvY2sgIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMykge1xuXHRcdFx0aWYgKCEoYXJncyBpbnN0YW5jZW9mIFJ1bnRpbWVMaXN0KSkge1xuXHRcdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYmxvY2sobnMsIC4uLmFyZ3MuZWxlbWVudHMpXG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBibG9jayhucyk7XG5cdFx0fVxuXHR9XSxcblx0W1wiaW5zZXJ0Q2FsbFwiLCBmdW5jdGlvbihucywgYmxvY2ssIGF0b21zQW5kVmFsdWVzKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgYmxvY2sgIT09IFwiZnVuY3Rpb25cIiB8fCAhKGF0b21zQW5kVmFsdWVzIGluc3RhbmNlb2YgUnVudGltZU1hcCkpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0bGV0IGNhbGxOYW1lc3BhY2UgPSBuYW1lc3BhY2VJbnNlcnRNYXAoYmxvY2submFtZXNwYWNlLCBhdG9tc0FuZFZhbHVlcyk7XG5cdFx0cmV0dXJuIGJsb2NrLm9yaWdpbmFsLmJpbmQoY2FsbE5hbWVzcGFjZSkobnMpO1xuXHR9XSxcblx0W1wid2l0aEFyZ3NcIiwgZnVuY3Rpb24oXywgYXJnc0F0b20sIGJsb2NrKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICghKGFyZ3NBdG9tIGluc3RhbmNlb2YgUnVudGltZUF0b20gJiYgdHlwZW9mIGJsb2NrID09PSBcImZ1bmN0aW9uXCIpKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdGxldCBmbjogUnVudGltZUJsb2NrRnVuY3Rpb24gPSAobnMsIC4uLmFyZ3MpID0+IHtcblx0XHRcdHJldHVybiBibG9jay5vcmlnaW5hbC5iaW5kKFxuXHRcdFx0XHRibG9jay5uYW1lc3BhY2UubXVzdEluc2VydChcblx0XHRcdFx0XHRhcmdzQXRvbS52YWx1ZSxcblx0XHRcdFx0XHRuZXcgUnVudGltZUxpc3QoLi4uYXJncyBhcyBWYWx1ZVtdKVxuXHRcdFx0XHQpLFxuXHRcdFx0KShucyk7XG5cdFx0fTtcblx0XHRyZXR1cm4gW251bGwsIGNyZWF0ZU5ld0Jsb2NrKG5ldyBOYW1lc3BhY2UoKSwgZm4pXTtcblx0fV0sXG5cdFtzeW1ib2xBc3NpZ24sIGZ1bmN0aW9uKF8sIGFzc2lnbmVlLCB2YWx1ZSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRsZXQgcmVzdWx0ID0gbWF0Y2goYXNzaWduZWUhLCB2YWx1ZSEpO1xuXHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSB7XG5cdFx0XHRyZXR1cm4gW3Jlc3VsdCwgbnVsbF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBbbnVsbCwgbnVsbF07XG5cdFx0fVxuXHR9XSxcblx0W2lkZW50RGVmaW5lLCBkZWZpbmVCbG9ja10sXG5cdFtzeW1ib2xEZWZpbmUsIGRlZmluZUJsb2NrXSxcblx0W1wibWF0Y2hcIiwgZnVuY3Rpb24obnMsIHZhbHVlLCBtYXRjaGVyc0FuZEJsb2Nrcykge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAoIShtYXRjaGVyc0FuZEJsb2NrcyBpbnN0YW5jZW9mIFJ1bnRpbWVMaXN0KVxuXHRcdFx0fHwgbWF0Y2hlcnNBbmRCbG9ja3MubGVuKCkgJSAybiAhPT0gMG4pXG5cdFx0e1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMG47IGkgPCBtYXRjaGVyc0FuZEJsb2Nrcy5sZW4oKTsgaSArPSAybikge1xuXHRcdFx0bGV0IG1hdGNoZXIgPSBtYXRjaGVyc0FuZEJsb2Nrcy5hdChpKTtcblx0XHRcdGxldCBibG9jayA9IG1hdGNoZXJzQW5kQmxvY2tzLmF0KGkrMW4pO1xuXHRcdFx0aWYgKHR5cGVvZiBibG9jayAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdGxldCByZXN1bHQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXN1bHQgPSBtYXRjaChtYXRjaGVyLCB2YWx1ZSEpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBNYXRjaEVycm9yKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRsZXQgY2FsbE5hbWVzcGFjZSA9IGJsb2NrLm5hbWVzcGFjZTtcblx0XHRcdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBSdW50aW1lTWFwKSB7XG5cdFx0XHRcdGNhbGxOYW1lc3BhY2UgPSBuYW1lc3BhY2VJbnNlcnRNYXAoY2FsbE5hbWVzcGFjZSwgcmVzdWx0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBibG9jay5vcmlnaW5hbC5jYWxsKGNhbGxOYW1lc3BhY2UsIG5zKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwibWF0Y2g6IG5vIHBhdHRlcm4gbWF0Y2hlZFwiKTtcblx0fV0sXG5cdFtcInJldHVyblwiLCBmdW5jdGlvbihfLCB2YWx1ZSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMSwgYXJndW1lbnRzKTtcblx0XHR0aHJvdyBuZXcgUmV0dXJuKHZhbHVlISk7XG5cdH1dLFxuXHRbXCJyZXR1cm52XCIsIGZ1bmN0aW9uKF8sIHZhbHVlKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgxLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiBbbnVsbCwgbmV3IFJldHVybih2YWx1ZSEpXTtcblx0fV0sXG5cdFtcImlmXCIsIGZ1bmN0aW9uKG5zLCBjb25kLCB0cnVlQmxvY2ssIGZhbHNlQmxvY2spIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDMsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiB0cnVlQmxvY2sgIT09IFwiZnVuY3Rpb25cIiB8fCB0eXBlb2YgZmFsc2VCbG9jayAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdGlmIChjb25kID09PSBudWxsIHx8IGNvbmQgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2VCbG9jayhucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0cnVlQmxvY2sobnMpO1xuXHRcdH1cblx0fV0sXG5cdFtcIm9yXCIsIGZ1bmN0aW9uKG5zLCBjb25kc0FuZEJsb2Nrcykge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMSwgYXJndW1lbnRzKTtcblx0XHRpZiAoIShjb25kc0FuZEJsb2NrcyBpbnN0YW5jZW9mIFJ1bnRpbWVMaXN0KVxuXHRcdFx0fHwgY29uZHNBbmRCbG9ja3MubGVuKCkgJSAybiAhPT0gMG4pXG5cdFx0e1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMG47IGkgPCBjb25kc0FuZEJsb2Nrcy5sZW4oKTsgaSArPSAybikge1xuXHRcdFx0bGV0IGNvbmQgPSBjb25kc0FuZEJsb2Nrcy5hdChpKTtcblx0XHRcdGxldCBibG9jayA9IGNvbmRzQW5kQmxvY2tzLmF0KGkrMW4pO1xuXHRcdFx0aWYgKHR5cGVvZiBibG9jayAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgY29uZCA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdGNvbmQgPSBjb25kKG5zKVsxXTtcblx0XHRcdH1cblx0XHRcdGlmIChjb25kID09PSBudWxsIHx8IGNvbmQgPT09IGZhbHNlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJsb2NrKG5zKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib3I6IG5vIHRydXRoeSBjb25kaXRpb25cIik7XG5cdH1dLFxuXHRbXCJsb29wXCIsIGZ1bmN0aW9uKG5zLCBibG9jaykge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMSwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIGJsb2NrICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0d2hpbGUodHJ1ZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YmxvY2sobnMpXG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgUmV0dXJuKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtudWxsLCBlLnZhbHVlXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XSxcblx0W1wiPT1cIiwgZnVuY3Rpb24oXywgeCwgeSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gW251bGwsIHZhbHVlRXF1YWxzKHghLCB5ISldO1xuXHR9XSxcblx0W1wiIT1cIiwgZnVuY3Rpb24oXywgeCwgeSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gW251bGwsICF2YWx1ZUVxdWFscyh4ISwgeSEpXTtcblx0fV0sXG5cdFtcIjxcIiwgZnVuY3Rpb24oXywgeCwgeSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIHggIT09IFwiYmlnaW50XCIgfHwgdHlwZW9mIHkgIT09IFwiYmlnaW50XCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtudWxsLCB4IDwgeV07XG5cdH1dLFxuXHRbXCI8PVwiLCBmdW5jdGlvbihfLCB4LCB5KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgeCAhPT0gXCJiaWdpbnRcIiB8fCB0eXBlb2YgeSAhPT0gXCJiaWdpbnRcIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gW251bGwsIHggPD0geV07XG5cdH1dLFxuXHRbXCI+XCIsIGZ1bmN0aW9uKF8sIHgsIHkpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiB4ICE9PSBcImJpZ2ludFwiIHx8IHR5cGVvZiB5ICE9PSBcImJpZ2ludFwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBbbnVsbCwgeCA+IHldO1xuXHR9XSxcblx0W1wiPj1cIiwgZnVuY3Rpb24oXywgeCwgeSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIHggIT09IFwiYmlnaW50XCIgfHwgdHlwZW9mIHkgIT09IFwiYmlnaW50XCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtudWxsLCB4ID49IHldO1xuXHR9XSxcblx0W1wiK1wiLCBmdW5jdGlvbihfLCB4LCB5KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgeCAhPT0gXCJiaWdpbnRcIiB8fCB0eXBlb2YgeSAhPT0gXCJiaWdpbnRcIikge1xuXHRcdFx0dGhyb3cgYXJndW1lbnRFcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gW251bGwsIHggKyB5XTtcblx0fV0sXG5cdFtcIi1cIiwgZnVuY3Rpb24oXywgeCwgeSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIHggIT09IFwiYmlnaW50XCIgfHwgdHlwZW9mIHkgIT09IFwiYmlnaW50XCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtudWxsLCB4IC0geV07XG5cdH1dLFxuXHRbXCIqXCIsIGZ1bmN0aW9uKF8sIHgsIHkpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiB4ICE9PSBcImJpZ2ludFwiIHx8IHR5cGVvZiB5ICE9PSBcImJpZ2ludFwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBbbnVsbCwgeCAqIHldO1xuXHR9XSxcblx0W1wiLy9cIiwgZnVuY3Rpb24oXywgeCwgeSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIHggIT09IFwiYmlnaW50XCIgfHwgdHlwZW9mIHkgIT09IFwiYmlnaW50XCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtudWxsLCB4IC8geV07XG5cdH1dLFxuXHRbXCIlXCIsIGZ1bmN0aW9uKF8sIHgsIHkpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiB4ICE9PSBcImJpZ2ludFwiIHx8IHR5cGVvZiB5ICE9PSBcImJpZ2ludFwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdHJldHVybiBbbnVsbCwgeCAlIHldO1xuXHR9XSxcblx0W1wibWFwXCIsIGZ1bmN0aW9uKG5zLCAuLi5lbGVtZW50cykge1xuXHRcdHJldHVybiBbbnVsbCwgUnVudGltZU1hcC5mcm9tUnVudGltZVZhbHVlcyhucywgLi4uZWxlbWVudHMgYXMgVmFsdWVbXSldO1xuXHR9XSxcblx0W1wiYXBwZW5kXCIsIGZ1bmN0aW9uKF8sIGxpc3QsIHZhbHVlKSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgyLCBhcmd1bWVudHMpO1xuXHRcdGlmICghKGxpc3QgaW5zdGFuY2VvZiBSdW50aW1lTGlzdCkpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtudWxsLCBsaXN0LmFwcGVuZCh2YWx1ZSEpXTtcblx0fV0sXG5cdFtcInRvTGlzdFwiLCBmdW5jdGlvbihucywgaXRlcmF0b3IpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDEsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiBpdGVyYXRvciAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdGxldCBuZXh0ID0gaXRlcmF0b3IobnMpWzFdO1xuXHRcdGlmICh0eXBlb2YgbmV4dCAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdGxldCBlbGVtZW50cyA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgZWxlbWVudCA9IG5leHQobnMpWzFdO1xuXHRcdFx0aWYgKGVsZW1lbnQgPT09IHN0b3BWYWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gW251bGwsIG5ldyBSdW50aW1lTGlzdCguLi5lbGVtZW50cyldO1xuXHRcdFx0fVxuXHRcdFx0ZWxlbWVudHMucHVzaChlbGVtZW50KTtcblx0XHR9XG5cblx0fV0sXG5cdFtcIi5cIiwgZnVuY3Rpb24oXywgbWFwLCBrZXkpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDIsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKCEobWFwIGluc3RhbmNlb2YgUnVudGltZU1hcCkpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtudWxsLCBtYXAuZ2V0KGtleSEpXTtcblx0fV0sXG5cdFtcIm11dFwiLCAgZnVuY3Rpb24oXywgdmFsdWUpIHtcblx0XHRjaGVja0FyZ3VtZW50TGVuZ3RoKDEsIGFyZ3VtZW50cyk7XG5cdFx0cmV0dXJuIFtudWxsLCBuZXcgTXV0KHZhbHVlISldO1xuXHR9XSxcblx0W1wibG9hZFwiLCAgZnVuY3Rpb24oXywgbXV0KSB7XG5cdFx0Y2hlY2tBcmd1bWVudExlbmd0aCgxLCBhcmd1bWVudHMpO1xuXHRcdGlmICghKG11dCBpbnN0YW5jZW9mIE11dCkpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtudWxsLCBtdXQudmFsdWVdO1xuXHR9XSxcblx0W1wiPC1cIiwgZnVuY3Rpb24oXywgbXV0LCB2YWx1ZSkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAoIShtdXQgaW5zdGFuY2VvZiBNdXQpKSB7XG5cdFx0XHR0aHJvdyBhcmd1bWVudEVycm9yKCk7XG5cdFx0fVxuXHRcdG11dC52YWx1ZSA9IHZhbHVlITtcblx0XHRyZXR1cm4gW251bGwsIG51bGxdO1xuXHR9XSxcblx0W1wifD5cIiwgZnVuY3Rpb24obnMsIGlucHV0LCByZWNlaXZlcikge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIHJlY2VpdmVyICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlY2VpdmVyKG5zLCBpbnB1dCk7XG5cdH1dLFxuXHRbXCIuLlwiLCBmdW5jdGlvbihucywgc3RhcnQsIGVuZCkge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMiwgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIHN0YXJ0ICE9PSBcImJpZ2ludFwiIHx8IHR5cGVvZiBlbmQgIT09IFwiYmlnaW50XCIpIHtcblx0XHRcdHRocm93IGFyZ3VtZW50RXJyb3IoKTtcblx0XHR9XG5cdFx0aWYgKHN0YXJ0ID49IGVuZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwicmFuZ2U6IHN0YXJ0IGNhbm5vdCBiZSBncmVhdGVyIG9yIGVxdWFsXCIpO1xuXHRcdH1cblx0XHRyZXR1cm4gW251bGwsIFJ1bnRpbWVNYXAuZnJvbVJ1bnRpbWVWYWx1ZXMoXG5cdFx0XHRucyxcblx0XHRcdG5ldyBSdW50aW1lTGlzdChuZXcgUnVudGltZUF0b20oXCJzdGFydFwiKSwgc3RhcnQpLFxuXHRcdFx0bmV3IFJ1bnRpbWVMaXN0KG5ldyBSdW50aW1lQXRvbShcImVuZFwiKSwgZW5kKSxcblx0XHQpXTtcblx0fV0sXG5cdFtcInVuaXF1ZVwiLCAgZnVuY3Rpb24oXykge1xuXHRcdGNoZWNrQXJndW1lbnRMZW5ndGgoMCwgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gW251bGwsIG5ldyBVbmlxdWUoKV07XG5cdH1dLFxuXHRbXCJwcmludGxuXCIsIGZ1bmN0aW9uKF8sIC4uLmFyZ3MpIHtcblx0XHRwcmludGxuKGFyZ3MubWFwKHYgPT4gdmFsdWVTdHJpbmcodiEpKS5qb2luKFwiIFwiKSk7XG5cdFx0cmV0dXJuIFtudWxsLCBudWxsXTtcblx0fV0sXG5dO1xuXG5jb25zdCBidWlsdGluT3RoZXI6IFtzdHJpbmcsIFZhbHVlXVtdID0gW1xuXHRbXCJudWxsXCIsIG51bGxdLFxuXHRbXCJmYWxzZVwiLCBmYWxzZV0sXG5cdFtcInRydWVcIiwgdHJ1ZV0sXG5cdFtcInN0b3BcIiwgc3RvcFZhbHVlXVxuXTtcblxuZnVuY3Rpb24gY3JlYXRlTmV3QmxvY2sobnM6IE5hbWVzcGFjZTxWYWx1ZT4sIGJsb2NrOiBSdW50aW1lQmxvY2tGdW5jdGlvbik6IFJ1bnRpbWVCbG9jayB7XG5cdHJldHVybiBPYmplY3QuYXNzaWduKGJsb2NrLmJpbmQobnMpLCB7IG5hbWVzcGFjZTogbnMsIG9yaWdpbmFsOiBibG9jayB9KTtcbn1cblxuY29uc3QgYnVpbHRpbk5hbWVzcGFjZSA9ICgoKSA9PiB7XG5cdGxldCBucyA9IGJ1aWx0aW5CbG9ja3MucmVkdWNlKFxuXHRcdChucywgW3N0ciwgYmxvY2tdKSA9PiB7XG5cdFx0XHRyZXR1cm4gbnMubXVzdEluc2VydChzdHIsIGNyZWF0ZU5ld0Jsb2NrKG5ldyBOYW1lc3BhY2UoKSwgYmxvY2spKTtcblx0XHR9LFxuXHRcdG5ldyBOYW1lc3BhY2U8VmFsdWU+KCksXG5cdCk7XG5cdHJldHVybiBidWlsdGluT3RoZXIucmVkdWNlKChucywgW3N0ciwgdmFsdWVdKSA9PiBucy5tdXN0SW5zZXJ0KHN0ciwgdmFsdWUpLCBucyk7XG59KSgpO1xuXG5jb25zdCBpbnRlcm5hbHM6IHsgW25hbWU6IHN0cmluZ106IEZ1bmN0aW9uIH0gPSB7XG5cdFtpbnRlcm5hbE5ld0F0b21dOiAodmFsdWU6IHN0cmluZyk6IFJ1bnRpbWVBdG9tID0+IHtcblx0XHRyZXR1cm4gbmV3IFJ1bnRpbWVBdG9tKHZhbHVlKTtcblx0fSxcblx0W2ludGVybmFsTmV3TGlzdF06ICguLi5lbGVtZW50czogVmFsdWVbXSk6IFJ1bnRpbWVMaXN0ID0+IHtcblx0XHRyZXR1cm4gbmV3IFJ1bnRpbWVMaXN0KC4uLmVsZW1lbnRzKTtcblx0fSxcblx0W2ludGVybmFsTmV3QmxvY2tdOiBjcmVhdGVOZXdCbG9jayxcblx0W2ludGVybmFsTmFtZXNwYWNlSW5zZXJ0TWFwXTogbmFtZXNwYWNlSW5zZXJ0TWFwLFxuXHRbaW50ZXJuYWxNYXRjaF06IG1hdGNoLFxuXHRbaW50ZXJuYWxJc0xpc3RdOiAobWF5YmVMaXN0OiB1bmtub3duKTogYm9vbGVhbiA9PiB7XG5cdFx0cmV0dXJuIG1heWJlTGlzdCBpbnN0YW5jZW9mIFJ1bnRpbWVMaXN0O1xuXHR9LFxuXHRbaW50ZXJuYWxJc01hcF06IChtYXliZU1hcDogdW5rbm93bik6IGJvb2xlYW4gPT4ge1xuXHRcdHJldHVybiBtYXliZU1hcCBpbnN0YW5jZW9mIFJ1bnRpbWVNYXA7XG5cdH0sXG5cdFtpbnRlcm5hbE5ld01hdGNoRXJyb3JdOiAobWF0Y2hlcjogVmFsdWUsIHZhbHVlOiBWYWx1ZSwgbWVzc2FnZT86IHN0cmluZykgPT4ge1xuXHRcdHJldHVybiBuZXcgTWF0Y2hFcnJvcihtYXRjaGVyLCB2YWx1ZSwgbWVzc2FnZSk7XG5cdH0sXG59O1xuXG5mdW5jdGlvbiBzdHJpbmdBbGwoc3RyOiBzdHJpbmcsIHByZWRpY2F0ZTogKGNoYXI6IHN0cmluZykgPT4gYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRmb3IgKGxldCBjaGFyIG9mIHN0cikge1xuXHRcdGlmICghcHJlZGljYXRlKGNoYXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBtdXN0U3RyaW5nRmlyc3Qoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRmb3IgKGxldCBjaGFyIG9mIHN0cikge1xuXHRcdHJldHVybiBjaGFyO1xuXHR9XG5cdHRocm93IG5ldyBFcnJvcihcImVtcHR5IHN0cmluZ1wiKTtcbn1cblxuY29uc3QgZXNjYXBlZFN5bWJvbHM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7XG5cdFwiIVwiOiBcIkV4Y2xhbWF0aW9uTWFya1wiLFxuXHRcIiRcIjogXCJEb2xsYXJcIixcblx0XCIlXCI6IFwiUGVyY2VudFwiLFxuXHRcIiZcIjogXCJBbXBlcnNhbmRcIixcblx0XCIqXCI6IFwiQXN0ZXJpc2tcIixcblx0XCIrXCI6IFwiUGx1c1wiLFxuXHRcIixcIjogXCJDb21tYVwiLFxuXHRcIi1cIjogXCJNaW51c1wiLFxuXHRcIi5cIjogXCJQZXJpb2RcIixcblx0XCIvXCI6IFwiU2xhc2hcIixcblx0XCI6XCI6IFwiQ29sb25cIixcblx0XCI7XCI6IFwiU2VtaWNvbG9uXCIsXG5cdFwiPFwiOiBcIkxlc3NUaGFuXCIsXG5cdFwiPVwiOiBcIkVxdWFsaXR5U2lnblwiLFxuXHRcIj5cIjogXCJHcmVhdGVyVGhhblwiLFxuXHRcIj9cIjogXCJRdWVzdGlvbk1hcmtcIixcblx0XCJAXCI6IFwiQXRTaWduXCIsXG5cdFwiXFxcXFwiOiBcIkJhY2tzbGFzaFwiLFxuXHRcIl5cIjogXCJDYXJldFwiLFxuXHRcImBcIjogXCJBY2NlbnRcIixcblx0XCJ8XCI6IFwiVmVydGljYWxCYXJcIixcblx0XCJ+XCI6IFwiVGlsZGVcIixcbn07XG5cbmZ1bmN0aW9uIHRvSmF2YXNjcmlwdFZhck5hbWUoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoc3RyLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IGludGVybmFsKCk7XG5cdH1cblxuXHRpZiAoaXNJZGVudFN0YXJ0KG11c3RTdHJpbmdGaXJzdChzdHIpKSAmJiBzdHJpbmdBbGwoc3RyLCBpc0lkZW50KSkge1xuXHRcdC8vIFRPRE86IGNoZWNrIHN0aWxsIHZhbGlkIHdpdGggbm9uIGFzY2lpIGlkZW50c1xuXHRcdHJldHVybiBgaWRlbnRfJHtzdHJ9YDtcblx0fSBlbHNlIGlmIChzdHJpbmdBbGwoc3RyLCBpc1N5bWJvbCkpIHtcblx0XHRsZXQgZXNjYXBlZCA9IHN0cmluZ01hcChzdHIsIGNoYXIgPT4ge1xuXHRcdFx0bGV0IGVzYyA9IGVzY2FwZWRTeW1ib2xzW2NoYXJdO1xuXHRcdFx0aWYgKGVzYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBgVSR7Y2hhci5jb2RlUG9pbnRBdCgwKX1gO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGVzYztcblx0XHR9KVxuXHRcdHJldHVybiBgc3ltYm9sXyR7ZXNjYXBlZH1gO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IGludGVybmFsKCk7XG5cdH1cbn1cblxuY29uc3QgYnVpbHRpbk5hbWVzcGFjZVZhck5hbWVzID0gKCgpID0+IHtcblx0bGV0IG5zID0gbmV3IE5hbWVzcGFjZTxzdHJpbmc+KCk7XG5cdGZvciAobGV0IFtuYW1lLCBfXSBvZiBidWlsdGluTmFtZXNwYWNlKSB7XG5cdFx0bnMgPSBucy5tdXN0SW5zZXJ0KG5hbWUsIHRvSmF2YXNjcmlwdFZhck5hbWUobmFtZSkpO1xuXHR9O1xuXHRyZXR1cm4gbnM7XG59KSgpO1xuXG5mdW5jdGlvbiBydW5FeHByZXNzaW9ucyhleHByczogRXhwcmVzc2lvbltdKTogdm9pZCB7XG5cdGxldCBjb2RlID0gXCIndXNlIHN0cmljdCc7XFxuXFxuXCI7XG5cdGNvbnN0IGludGVybmFsc05hbWUgPSBcImludGVybmFsc1wiO1xuXHRmb3IgKGxldCBuYW1lIG9mIE9iamVjdC5rZXlzKGludGVybmFscykpIHtcblx0XHRjb2RlICs9IGBjb25zdCAke25hbWV9ID0gJHtpbnRlcm5hbHNOYW1lfS4ke25hbWV9O1xcbmA7XG5cdH1cblx0Y29kZSArPSBcIlxcblwiO1xuXG5cdGZvciAobGV0IFtuYW1lLCB2YXJOYW1lXSBvZiBidWlsdGluTmFtZXNwYWNlVmFyTmFtZXMpIHtcblx0XHRjb2RlICs9IGBjb25zdCAke3Zhck5hbWV9ID0gJHtvdXJOYW1lc3BhY2V9Lm11c3RHZXQoJHt0b0phdmFzY3JpcHRTdHJpbmcobmFtZSl9KTtcXG5gO1xuXHR9XG5cdGNvZGUgKz0gYFxcbiR7dW5wYWNrQW5kTWF5YmVBZGRUb091cnNEZWZpbml0aW9ufVxcblxcbmA7XG5cblx0Y29kZSArPSBuZXcgQ29tcGlsZXIoYnVpbHRpbk5hbWVzcGFjZVZhck5hbWVzLCBleHBycykuY29tcGlsZSgpO1xuXHRjb25zb2xlLmxvZyhjb2RlKTtcblx0bmV3IEZ1bmN0aW9uKGludGVybmFsc05hbWUsIG91ck5hbWVzcGFjZSwgY29kZSkoaW50ZXJuYWxzLCBidWlsdGluTmFtZXNwYWNlKTtcbn1cblxuZnVuY3Rpb24gcnVuKGNvZGU6IHN0cmluZykge1xuXHRsZXQgdG9rZW5zID0gW107XG5cdGZvciAobGV0IHRvayBvZiBuZXcgTGV4ZXIoXCJ0ZXh0YXJlYVwiLCBjb2RlKSkge1xuXHRcdGlmICh0b2sua2luZCA9PT0gXCJhdG9tXCJcblx0XHRcdHx8IHRvay5raW5kID09PSBcIm51bWJlclwiXG5cdFx0XHR8fCB0b2sua2luZCA9PT0gXCJyZWZcIlxuXHRcdFx0fHwgdG9rLmtpbmQgPT09IFwic3RyaW5nXCJcblx0XHRcdHx8IHRvay5raW5kID09PSBcInN5bWJvbFwiXG5cdFx0KSB7XG5cdFx0XHR0b2tlbnMucHVzaChgJHt0b2sua2luZH0gKCR7dG9rLnZhbHVlfSlgKVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0b2tlbnMucHVzaChgJHt0b2sua2luZH1gKTtcblx0XHR9XG5cdH07XG5cdGNvbnNvbGUubG9nKHRva2Vucy5qb2luKFwiLCBcIikpO1xuXG5cdGxldCBwYXJzZXIgPSBuZXcgUGFyc2VyKFxuXHRcdG5ldyBMZXhlcihcInRleHRhcmVhXCIsIGNvZGUpLFxuXHRcdFtcblx0XHRcdFtzeW1ib2xBc3NpZ24sIFwiPC1cIl0sXG5cdFx0XHRbXCJ8PlwiXSxcblx0XHRdLFxuXHRcdFtcblx0XHRcdFtzeW1ib2xEZWZpbmVdLFxuXHRcdFx0W1wiJiZcIiwgXCJ8fFwiXSxcblx0XHRcdFtcIj09XCIsIFwiIT1cIl0sXG5cdFx0XHRbXCI8XCIsIFwiPD1cIiwgXCI+XCIsIFwiPj1cIl0sXG5cdFx0XHRbXCIuLlwiLCBcIi4uPFwiLCBcIjwuLlwiLCBcIjwuLjxcIl0sXG5cdFx0XHRbXCIrK1wiXSxcblx0XHRcdFtcIitcIiwgXCItXCJdLFxuXHRcdFx0W1wiKlwiLCBcIi9cIiwgXCIvL1wiLCBcIiVcIl0sXG5cdFx0XHRbXCJAXCJdLFxuXHRcdFx0W1wiLlwiXSxcblx0XHRdLFxuXHQpO1xuXHRsZXQgZXhwcnMgPSBwYXJzZXIucGFyc2UoKTtcblx0Zm9yIChsZXQgZXhwciBvZiBleHBycykge1xuXHRcdGNvbnNvbGUubG9nKGV4cHJlc3Npb25TdHJpbmcoZXhwcikpO1xuXHR9XG5cblx0cnVuRXhwcmVzc2lvbnMoZXhwcnMpO1xufSJdfQ==