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
            return newExpression(pos, {
                kind: "call",
                first: exprs[0],
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
function run() {
    let code = document.getElementById("code").value;
    let lexer = new Lexer("textarea", code);
    let tokens = [];
    for (let tok of lexer) {
        if (tok.kind === "atom"
            || tok.kind === "ref"
            || tok.kind === "number"
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
}
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyYXRjaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNjcmF0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLFNBQVMsUUFBUTtJQUNiLE9BQU8sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUN2QyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsYUFBYSxDQUFDLEdBQWEsRUFBRSxPQUFlO0lBQ3BELE9BQU8sSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLFFBQVEsR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUE2R0QsU0FBUyxhQUFhLENBQUMsR0FBYSxFQUFFLElBQW9CO0lBQ3pELE9BQU8sRUFBQyxHQUFHLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBQyxDQUFDO0FBQ3RFLENBQUM7QUFFRCwwQkFBMEI7QUFFMUIsU0FBUyxPQUFPLENBQUMsSUFBWTtJQUM1QixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLFlBQVksQ0FBQyxJQUFZO0lBQ2pDLE9BQU8sYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsT0FBTyxDQUFDLElBQVk7SUFDNUIsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEMsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLGdCQUFnQixDQUFDLElBQVk7SUFDckMsT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFF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SUFBSSxDQUFDO0tBQ04sRUFDRDtRQUNDLENBQUMsSUFBSSxDQUFDO1FBQ04sQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ1osQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ1osQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLENBQUM7UUFDdEIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUM7UUFDNUIsQ0FBQyxJQUFJLENBQUM7UUFDTixDQUFDLEdBQUcsRUFBRSxHQUFHLENBQUM7UUFDVixDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQztRQUN0QixDQUFDLEdBQUcsQ0FBQztRQUNMLENBQUMsR0FBRyxDQUFDO0tBQ0wsQ0FDRCxDQUFDO0lBQ0YsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQzNCLEtBQUssSUFBSSxJQUFJLElBQUksS0FBSyxFQUFFO1FBQ3ZCLE9BQU8sQ0FBQyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztLQUNwQztBQUNGLENBQUM7QUFBQSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiZnVuY3Rpb24gaW50ZXJuYWwoKTogRXJyb3Ige1xuICAgIHJldHVybiBuZXcgRXJyb3IoXCJpbnRlcm5hbCBlcnJvclwiKTtcbn07XG5cbmZ1bmN0aW9uIHBvc2l0aW9uRXJyb3IocG9zOiBQb3NpdGlvbiwgbWVzc2FnZTogc3RyaW5nKTogRXJyb3Ige1xuXHRyZXR1cm4gbmV3IEVycm9yKGAke3Bvcy5wYXRofXwke3Bvcy5saW5lfSBjb2wgJHtwb3MuY29sdW1ufXwgJHttZXNzYWdlfWApO1xufVxuXG50eXBlIFJlZiA9IHtcblx0a2luZDogXCJyZWZcIjtcblx0dmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgQXRvbSA9IHtcblx0a2luZDogXCJhdG9tXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIFFTeW1ib2wgPSB7XG5cdGtpbmQ6IFwic3ltYm9sXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIFFOdW1iZXIgPSB7XG5cdGtpbmQ6IFwibnVtYmVyXCI7XG5cdHZhbHVlOiBiaWdpbnQ7XG59O1xuXG50eXBlIFFTdHJpbmcgPSB7XG5cdGtpbmQ6IFwic3RyaW5nXCI7XG5cdHZhbHVlOiBzdHJpbmc7XG59O1xuXG50eXBlIE9wZW5CcmFja2V0ID0ge1xuXHRraW5kOiBcIihcIjtcbn07XG5cbnR5cGUgQ2xvc2VkQnJhY2tldCA9IHtcblx0a2luZDogXCIpXCI7XG59O1xuXG50eXBlIE9wZW5DdXJseSA9IHtcblx0a2luZDogXCJ7XCI7XG59O1xuXG50eXBlIENsb3NlZEN1cmx5ID0ge1xuXHRraW5kOiBcIn1cIjtcbn07XG5cbnR5cGUgT3BlblNxdWFyZSA9IHtcblx0a2luZDogXCJbXCI7XG59O1xuXG50eXBlIENsb3NlZFNxdWFyZSA9IHtcblx0a2luZDogXCJdXCI7XG59O1xuXG50eXBlIEVuZE9mTGluZSA9IHtcblx0a2luZDogXCJlb2xcIjtcbn07XG5cbnR5cGUgVW5pdCA9IHtcblx0a2luZDogXCJ1bml0XCI7XG59XG5cbnR5cGUgQ2FsbCA9IHtcblx0a2luZDogXCJjYWxsXCI7XG5cdGZpcnN0OiBFeHByZXNzaW9uO1xuXHRhcmd1bWVudHM6IEV4cHJlc3Npb25bXTtcbn1cblxudHlwZSBMaXN0ID0ge1xuXHRraW5kOiBcImxpc3RcIjtcblx0ZWxlbWVudHM6IEV4cHJlc3Npb25bXTtcbn1cblxudHlwZSBCbG9jayA9IHtcblx0a2luZDogXCJibG9ja1wiO1xuXHRleHByZXNzaW9uczogRXhwcmVzc2lvbltdO1xufVxuXG50eXBlIFRva2VuS2luZCA9XG5cdHwgUmVmXG5cdHwgQXRvbVxuXHR8IFFTeW1ib2xcblx0fCBRTnVtYmVyXG5cdHwgUVN0cmluZ1xuXHR8IE9wZW5CcmFja2V0XG5cdHwgQ2xvc2VkQnJhY2tldFxuXHR8IE9wZW5DdXJseVxuXHR8IENsb3NlZEN1cmx5XG5cdHwgT3BlblNxdWFyZVxuXHR8IENsb3NlZFNxdWFyZVxuXHR8IEVuZE9mTGluZTtcblxudHlwZSBFeHByZXNzaW9uS2luZCA9XG5cdHwgUmVmXG5cdHwgQXRvbVxuXHR8IFFOdW1iZXJcblx0fCBRU3RyaW5nXG5cdHwgVW5pdFxuXHR8IENhbGxcblx0fCBMaXN0XG5cdHwgQmxvY2s7XG5cbnR5cGUgUG9zaXRpb24gPSB7XG5cdHBhdGg6IHN0cmluZztcblx0bGluZTogbnVtYmVyO1xuXHRjb2x1bW46IG51bWJlcjtcbn07XG5cbnR5cGUgVG9rZW4gPSBUb2tlbktpbmQgJiBQb3NpdGlvbjtcblxudHlwZSBFeHByZXNzaW9uID0gRXhwcmVzc2lvbktpbmQgJiBQb3NpdGlvbjtcblxuZnVuY3Rpb24gbmV3RXhwcmVzc2lvbihwb3M6IFBvc2l0aW9uLCBleHByOiBFeHByZXNzaW9uS2luZCk6IEV4cHJlc3Npb24ge1xuXHRyZXR1cm4gey4uLmV4cHIsIHBhdGg6IHBvcy5wYXRoLCBsaW5lOiBwb3MubGluZSwgY29sdW1uOiBwb3MuY29sdW1ufTtcbn1cblxuLy8gVE9ETzogc3VwcG9ydCBub24gYXNjaWlcblxuZnVuY3Rpb24gaXNTcGFjZShjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eXFxzJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzSWRlbnRTdGFydChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eW2EtekEtWl9dJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzSWRlbnQoY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlswLTlhLXpBLVpfXSQvLnRlc3QoY2hhcik7XG59O1xuXG5mdW5jdGlvbiBpc1Jlc2VydmVkU3ltYm9sKGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gWydcIicsIFwiJ1wiLCAnKCcsICcpJywgJ3snLCAnfScsICdbJywgJ10nLCAnIyddLmluY2x1ZGVzKGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNTeW1ib2woY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChpc1Jlc2VydmVkU3ltYm9sKGNoYXIpIHx8IChjaGFyID09ICdfJykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH07XG5cdHJldHVybiAvXltcXHUwMDIxLVxcdTAwMkZcXHUwMDNBLVxcdTAwNDBcXHUwMDVCLVxcdTAwNjBcXHUwMDdCLVxcdTAwN0VdJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzTnVtYmVyU3RhcnQoY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlswLTldJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15bMC05X10kLy50ZXN0KGNoYXIpO1xufTtcblxuY2xhc3MgTGV4ZXIgaW1wbGVtZW50cyBJdGVyYWJsZTxUb2tlbj4ge1xuXHRwYXRoOiBzdHJpbmc7XG5cdGNoYXJzOiBJdGVyYXRvcjxzdHJpbmc+O1xuXHRsYXN0Q2hhcjoge2NoYXI6IHN0cmluZywgdXNlOiBib29sZWFufSB8IG51bGwgPSBudWxsO1xuXHRsaW5lID0gMTtcblx0Y29sdW1uID0gMTtcblx0bGFzdE5ld2xpbmUgPSBmYWxzZTtcblxuXHRsYXN0VG9rZW46IHt0b2tlbjogVG9rZW4sIHVzZTogYm9vbGVhbn0gfCBudWxsID0gbnVsbDtcblx0ZmluaXNoZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3RvcihwYXRoOiBzdHJpbmcsIGJ5Q2hhcjogSXRlcmFibGU8c3RyaW5nPikge1xuXHRcdHRoaXMucGF0aCA9IHBhdGg7XG5cdFx0dGhpcy5jaGFycyA9IGJ5Q2hhcltTeW1ib2wuaXRlcmF0b3JdKCk7XG5cdH1cblxuXHRuZXh0Q2hhcigpOiB7Y2hhcjogc3RyaW5nLCBsaW5lOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyfSB8IG51bGwge1xuXHRcdGxldCBjaGFyOiBzdHJpbmc7XG5cdFx0aWYgKHRoaXMubGFzdENoYXIgJiYgdGhpcy5sYXN0Q2hhci51c2UpIHtcblx0XHRcdHRoaXMubGFzdENoYXIudXNlID0gZmFsc2U7XG5cdFx0XHRjaGFyID0gdGhpcy5sYXN0Q2hhci5jaGFyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQge2RvbmUsIHZhbHVlfSA9IHRoaXMuY2hhcnMubmV4dCgpO1xuXHRcdFx0aWYgKGRvbmUpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9O1xuXHRcdFx0Y2hhciA9IHZhbHVlO1xuXHRcdH07XG5cdFx0dGhpcy5sYXN0Q2hhciA9IHtjaGFyLCB1c2U6IGZhbHNlfTtcblxuXHRcdGlmIChjaGFyID09ICdcXG4nKSB7XG5cdFx0XHRpZiAodGhpcy5sYXN0TmV3bGluZSkge1xuXHRcdFx0XHR0aGlzLmNvbHVtbiA9IDE7XG5cdFx0XHRcdHJldHVybiB7Y2hhciwgbGluZTogdGhpcy5saW5lKyssIGNvbHVtbjogdGhpcy5jb2x1bW59OyBcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubGFzdE5ld2xpbmUgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSsrLCBjb2x1bW46IHRoaXMuY29sdW1ufTsgXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5sYXN0TmV3bGluZSkge1xuXHRcdFx0XHR0aGlzLmNvbHVtbiA9IDI7XG5cdFx0XHRcdHRoaXMubGFzdE5ld2xpbmUgPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuIHtjaGFyLCBsaW5lOiB0aGlzLmxpbmUsIGNvbHVtbjogMX07IFxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHtjaGFyLCBsaW5lOiB0aGlzLmxpbmUsIGNvbHVtbjogdGhpcy5jb2x1bW4rK307IFxuXHRcdFx0fTtcblx0XHR9O1xuXHR9O1xuXG5cdHVucmVhZENoYXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxhc3RDaGFyIHx8IHRoaXMubGFzdENoYXIudXNlKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH07XG5cdFx0dGhpcy5sYXN0Q2hhci51c2UgPSB0cnVlO1xuXHRcdGlmICh0aGlzLmxhc3ROZXdsaW5lKSB7XG5cdFx0XHR0aGlzLmxpbmUtLTtcblx0XHRcdHRoaXMubGFzdE5ld2xpbmUgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb2x1bW4tLTtcblx0XHR9O1xuXHR9O1xuXG5cdHRha2VXaGlsZShwcmVkaWNhdGU6IChjaGFyOiBzdHJpbmcpID0+IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGxldCBzdHIgPSBcIlwiO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKT8uY2hhcjtcblx0XHRcdGlmICghY2hhcikge1xuXHRcdFx0XHRyZXR1cm4gc3RyO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFwcmVkaWNhdGUoY2hhcikpIHtcblx0XHRcdFx0dGhpcy51bnJlYWRDaGFyKCk7XG5cdFx0XHRcdHJldHVybiBzdHI7XG5cdFx0XHR9O1xuXHRcdFx0c3RyICs9IGNoYXI7XG5cdFx0fTtcblx0fTtcblxuXHRmaW5pc2hpbmdFb2woKTogVG9rZW4ge1xuXHRcdHRoaXMuZmluaXNoZWQgPSB0cnVlO1xuXHRcdHJldHVybiB7IHBhdGg6IHRoaXMucGF0aCwgbGluZTogdGhpcy5saW5lLCBjb2x1bW46IHRoaXMuY29sdW1uLCBraW5kOiBcImVvbFwiIH1cblx0fTtcblxuXHR3aXRoUG9zaXRpb24ocG9zaXRpb246IHtsaW5lOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyfSwga2luZDogVG9rZW5LaW5kKTogVG9rZW4ge1xuXHRcdHJldHVybiB7IHBhdGg6IHRoaXMucGF0aCwgbGluZTogcG9zaXRpb24ubGluZSwgY29sdW1uOiBwb3NpdGlvbi5jb2x1bW4sIC4uLmtpbmQgfVxuXHR9O1xuXG5cdG5leHRUb2tlbigpOiBUb2tlbiB8IG51bGwge1xuXHRcdGlmICh0aGlzLmxhc3RUb2tlbiAmJiB0aGlzLmxhc3RUb2tlbi51c2UpIHtcblx0XHRcdHRoaXMubGFzdFRva2VuLnVzZSA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuIHRoaXMubGFzdFRva2VuLnRva2VuO1xuXHRcdH1cblx0XHRsZXQgdG9rZW4gPSB0aGlzLmdldE5leHRUb2tlbigpO1xuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHR0aGlzLmxhc3RUb2tlbiA9IHt0b2tlbiwgdXNlOiBmYWxzZX07XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9XG5cblx0Z2V0TmV4dFRva2VuKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRpZiAoIXRoaXMuZmluaXNoZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZmluaXNoaW5nRW9sKCk7XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fTtcblxuXHRcdGlmIChpc1NwYWNlKGNoYXIuY2hhcikpIHtcblx0XHRcdGlmIChjaGFyLmNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKGNoYXIsIHtraW5kOiBcImVvbFwifSk7XG5cdFx0XHR9O1xuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0Y2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZmluaXNoaW5nRW9sKCk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmICghaXNTcGFjZShjaGFyLmNoYXIpKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChjaGFyLmNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oY2hhciwge2tpbmQ6IFwiZW9sXCJ9KTs7XG5cdFx0XHRcdH07XG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRsZXQgc3RhcnQgPSBjaGFyO1xuXHRcdGlmIChpc1Jlc2VydmVkU3ltYm9sKGNoYXIuY2hhcikpIHtcblx0XHRcdHN3aXRjaCAoY2hhci5jaGFyKSB7XG5cdFx0XHRjYXNlICdcIic6XG5cdFx0XHRcdGxldCBzdHIgPSBcIlwiO1xuXHRcdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRcdGxldCBjaGFyID0gdGhpcy5uZXh0Q2hhcigpO1xuXHRcdFx0XHRcdGlmICghY2hhcikge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdzdHJpbmcgbm90IGNsb3NlZCB3aXRoIFwiJylcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGlmIChjaGFyLmNoYXIgPT0gJ1wiJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJzdHJpbmdcIiwgdmFsdWU6IHN0cn0pO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKGNoYXIuY2hhciAhPSAnXFxyJykge1xuXHRcdFx0XHRcdFx0c3RyICs9IGNoYXIuY2hhcjtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSBcIidcIjpcblx0XHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdGlmICghY2hhciB8fCAhaXNJZGVudFN0YXJ0KGNoYXIuY2hhcikpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJiYXJlICdcIilcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy51bnJlYWRDaGFyKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiYXRvbVwiLCB2YWx1ZTogdGhpcy50YWtlV2hpbGUoaXNJZGVudCl9KTtcblx0XHRcdGNhc2UgJygnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIihcIn0pO1xuXHRcdFx0Y2FzZSAnKSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiKVwifSk7XG5cdFx0XHRjYXNlICd7Jzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJ7XCJ9KTtcblx0XHRcdGNhc2UgJ30nOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIn1cIn0pO1xuXHRcdFx0Y2FzZSAnWyc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiW1wifSk7XG5cdFx0XHRjYXNlICddJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJdXCJ9KTtcblx0XHRcdGNhc2UgJyMnOlxuXHRcdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRcdGxldCBjaGFyID0gdGhpcy5uZXh0Q2hhcigpO1xuXHRcdFx0XHRcdGlmICghY2hhcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZmluaXNoaW5nRW9sKCk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAoY2hhci5jaGFyID09ICdcXG4nKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oY2hhciwge2tpbmQ6IFwiZW9sXCJ9KTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChpc0lkZW50U3RhcnQoY2hhci5jaGFyKSkge1xuXHRcdFx0dGhpcy51bnJlYWRDaGFyKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcInJlZlwiLCB2YWx1ZTogdGhpcy50YWtlV2hpbGUoaXNJZGVudCl9KTtcblx0XHR9IGVsc2UgaWYgKGlzTnVtYmVyU3RhcnQoY2hhci5jaGFyKSkge1xuXHRcdFx0dGhpcy51bnJlYWRDaGFyKCk7XG5cdFx0XHRsZXQgbnVtID0gdGhpcy50YWtlV2hpbGUoaXNOdW1iZXIpLnJlcGxhY2UoXCJfXCIsIFwiXCIpO1xuXHRcdFx0aWYgKChudW0ubGVuZ3RoID4gMSkgJiYgbnVtWzBdID09ICcwJykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHplcm8gcGFkZGVkIG51bWJlciAke251bX1gKVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwibnVtYmVyXCIsIHZhbHVlOiBCaWdJbnQobnVtKX0pO1xuXHRcdH0gZWxzZSBpZiAoaXNTeW1ib2woY2hhci5jaGFyKSkge1xuXHRcdFx0dGhpcy51bnJlYWRDaGFyKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcInN5bWJvbFwiLCB2YWx1ZTogdGhpcy50YWtlV2hpbGUoaXNTeW1ib2wpfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRPRE86IHF1b3RlIGNoYXIgd2hlbiBuZWNlc3Nhcnlcblx0XHRcdHRocm93IG5ldyBFcnJvcihgdW5rbm93biBjaGFyYWN0ZXIgJHtjaGFyfWApO1xuXHRcdH07XG5cdH07XG5cblx0dW5yZWFkVG9rZW4oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxhc3RUb2tlbiB8fCB0aGlzLmxhc3RUb2tlbi51c2UpIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fTtcblx0XHR0aGlzLmxhc3RUb2tlbi51c2UgPSB0cnVlO1xuXHR9O1xuXG5cdHBlZWtUb2tlbigpOiBUb2tlbiB8IG51bGwge1xuXHRcdGxldCB0b2tlbiA9IHRoaXMubmV4dFRva2VuKCk7XG5cdFx0dGhpcy51bnJlYWRUb2tlbigpO1xuXHRcdHJldHVybiB0b2tlbjtcblx0fVxuXG5cdG11c3ROZXh0VG9rZW4odGs/OiBUb2tlbktpbmQpOiBUb2tlbiB7XG5cdFx0bGV0IHRva2VuID0gdGhpcy5uZXh0VG9rZW4oKTtcblx0XHRpZiAoIXRva2VuIHx8ICh0ayAmJiB0b2tlbi5raW5kICE9PSB0ay5raW5kKSkge1xuXHRcdFx0dGhyb3cgaW50ZXJuYWwoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9XG5cblx0W1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmF0b3I8VG9rZW4+IHtcblx0XHRyZXR1cm4gbmV3IFRva2VuSXRlcmF0b3IodGhpcyk7XG5cdH07XG59O1xuXG5jbGFzcyBUb2tlbkl0ZXJhdG9yIGltcGxlbWVudHMgSXRlcmF0b3I8VG9rZW4+IHtcblx0bGV4ZXI6IExleGVyO1xuXG5cdGNvbnN0cnVjdG9yKGxleGVyOiBMZXhlcikge1xuXHRcdHRoaXMubGV4ZXIgPSBsZXhlcjtcblx0fTtcblxuXHRuZXh0KCk6IEl0ZXJhdG9yUmVzdWx0PFRva2VuPiB7XG5cdFx0bGV0IHRva2VuID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHQvLyB0aGUgdHlwZSBvZiBJdGVyYXRvciByZXF1aXJlcyB0aGF0IHdlIGFsd2F5cyByZXR1cm4gYSB2YWxpZCBUb2tlblxuXHRcdFx0Ly8gc28gd2UgcmV0dXJuIGVvbCBoZXJlXG5cdFx0XHRyZXR1cm4ge2RvbmU6IHRydWUsIHZhbHVlOiB7a2luZDogXCJlb2xcIn19O1xuXHRcdH07XG5cdFx0cmV0dXJuIHtkb25lOiBmYWxzZSwgdmFsdWU6IHRva2VufTtcblx0fTtcbn07XG5cbmZ1bmN0aW9uIGNvbGxhcHNlRXhwcmVzc2lvbnMocG9zOiBQb3NpdGlvbiwgZXhwcnM6IEV4cHJlc3Npb25bXSkge1xuXHRzd2l0Y2ggKGV4cHJzLmxlbmd0aCkge1xuXHRcdGNhc2UgMDpcblx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKHBvcywge2tpbmQ6IFwidW5pdFwifSk7XG5cdFx0Y2FzZSAxOlxuXHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24ocG9zLCBleHByc1swXSEpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihcblx0XHRcdFx0cG9zLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogXCJjYWxsXCIsXG5cdFx0XHRcdFx0Zmlyc3Q6IGV4cHJzWzBdISxcblx0XHRcdFx0XHRhcmd1bWVudHM6IGV4cHJzLnNsaWNlKDEpLFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHR9XG59XG5cbnR5cGUgVmFsdWVPclN5bWJvbCA9IEV4cHJlc3Npb24gfCBRU3ltYm9sJlBvc2l0aW9uO1xuXG5pbnRlcmZhY2UgUHJlY2VkZW5jZVRhYmxlIHsgW2tleTogc3RyaW5nXTogbnVtYmVyOyB9O1xuXG5mdW5jdGlvbiBuZXdQcmVjZWRlbmNlVGFibGUodGFibGU6IHN0cmluZ1tdW10sIGZhY3RvcjogbnVtYmVyKTogUHJlY2VkZW5jZVRhYmxlIHtcblx0bGV0IHByZWM6IFByZWNlZGVuY2VUYWJsZSA9IHt9O1xuXHR0YWJsZS5mb3JFYWNoKChsZXZlbCwgaSkgPT4gbGV2ZWwuZm9yRWFjaChzeW1ib2wgPT4gcHJlY1tzeW1ib2xdID0gKGkgKyAxKSAqIGZhY3RvcikpO1xuXHRyZXR1cm4gcHJlYztcbn1cblxuY2xhc3MgUGFyc2VyIHtcblx0bGV4ZXI6IExleGVyO1xuXHRwcmVjZWRlbmNlVGFibGU6IFByZWNlZGVuY2VUYWJsZTtcblxuXHQvLyBUT0RPOiBjaGVjayBkdXBsaWNhdGUgc3ltYm9sc1xuXHRjb25zdHJ1Y3RvcihsZXhlcjogTGV4ZXIsIGxvd2VyVGhhbkNhbGw6IHN0cmluZ1tdW10sIGhpZ2hlclRoYW5DYWxsOiBzdHJpbmdbXVtdKSB7XG5cdFx0dGhpcy5sZXhlciA9IGxleGVyO1xuXHRcdHRoaXMucHJlY2VkZW5jZVRhYmxlID0ge1xuXHRcdFx0Li4ubmV3UHJlY2VkZW5jZVRhYmxlKGxvd2VyVGhhbkNhbGwsIC0xKSxcblx0XHRcdFwiY2FsbFwiOiAwLFxuXHRcdFx0Li4ubmV3UHJlY2VkZW5jZVRhYmxlKGhpZ2hlclRoYW5DYWxsLCAxKVxuXHRcdH07XG5cdH1cblxuXHRwYXJzZSgpOiBFeHByZXNzaW9uW10ge1xuXHRcdGxldCBleHByZXNzaW9ucyA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgc3RhcnQgPSB0aGlzLmxleGVyLnBlZWtUb2tlbigpO1xuXHRcdFx0aWYgKCFzdGFydCkge1xuXHRcdFx0XHRyZXR1cm4gZXhwcmVzc2lvbnM7XG5cdFx0XHR9XG5cdFx0XHRsZXQgdmFsdWVzT3JTeW1ib2xzOiBWYWx1ZU9yU3ltYm9sW10gPSBbXTtcblx0XHRcdHdoaWxlKHRydWUpIHtcblx0XHRcdFx0bGV0IG5leHQgPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwiZW9sXCIpIHtcblx0XHRcdFx0XHRpZiAodmFsdWVzT3JTeW1ib2xzW3ZhbHVlc09yU3ltYm9scy5sZW5ndGgtMV0/LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZXNPclN5bWJvbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRleHByZXNzaW9ucy5wdXNoKHRoaXMuY29sbGFwc2Uoc3RhcnQsIHZhbHVlc09yU3ltYm9scykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNhbGxPclZhbHVlKCk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBvcGVuQnJhY2tldCA9IHRoaXMubGV4ZXIubXVzdE5leHRUb2tlbih7a2luZDogJygnfSk7XG5cdFx0bGV0IHZhbHVlc09yU3ltYm9sczogVmFsdWVPclN5bWJvbFtdID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJleHBlY3RlZCAnKScsIGdvdCBlb2ZcIik7XG5cdFx0XHR9XG5cdFx0XHRpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwiKVwiKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2gobmV4dCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNvbGxhcHNlKG9wZW5CcmFja2V0LCB2YWx1ZXNPclN5bWJvbHMpO1xuXHR9XG5cblx0Ly8gVE9ETzogYWxsb3cgc3ltYm9scyB3aXRoIGhpZ2hlciBwcmVjZWRlbmNlIHRoYW4gY2FsbCBpbiBsaXN0c1xuXHRsaXN0KCk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBvcGVuU3F1YXJlID0gdGhpcy5sZXhlci5tdXN0TmV4dFRva2VuKHtraW5kOiBcIltcIn0pO1xuXHRcdGxldCBlbGVtZW50czogRXhwcmVzc2lvbltdID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJleHBlY3RlZCAnXScsIGdvdCBlb2ZcIik7XG5cdFx0XHR9XG5cdFx0XHRpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwiXVwiKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXdFeHByZXNzaW9uKG9wZW5TcXVhcmUsIHtraW5kOiBcImxpc3RcIiwgZWxlbWVudHN9KTtcblx0fVxuXG5cdGJsb2NrKCk6IEV4cHJlc3Npb24ge1xuXHRcdGxldCBvcGVuQ3VybHkgPSB0aGlzLmxleGVyLm11c3ROZXh0VG9rZW4oe2tpbmQ6IFwie1wifSk7XG5cdFx0bGV0IGV4cHJlc3Npb25zID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBzdGFydCA9IHRoaXMubGV4ZXIucGVla1Rva2VuKCk7XG5cdFx0XHRsZXQgdmFsdWVzT3JTeW1ib2xzOiBWYWx1ZU9yU3ltYm9sW10gPSBbXTtcblx0XHRcdHdoaWxlKHRydWUpIHtcblx0XHRcdFx0bGV0IG5leHQgPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJleHBlY3RlZCAnfScsIGdvdCBlb2ZcIik7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcImVvbFwiKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlc09yU3ltYm9sc1t2YWx1ZXNPclN5bWJvbHMubGVuZ3RoLTFdPy5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJ9XCIpIHtcblx0XHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRcdFx0dmFsdWVzT3JTeW1ib2xzLnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdHZhbHVlc09yU3ltYm9scy5wdXNoKHRoaXMudmFsdWUoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZXNPclN5bWJvbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRleHByZXNzaW9ucy5wdXNoKHRoaXMuY29sbGFwc2Uoc3RhcnQhLCB2YWx1ZXNPclN5bWJvbHMpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmxleGVyLm11c3ROZXh0VG9rZW4oKS5raW5kID09PSAnfScpIHtcblx0XHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24ob3BlbkN1cmx5LCB7a2luZDogXCJibG9ja1wiLCBleHByZXNzaW9uc30pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHZhbHVlKCk6IEV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJ1bmV4cGVjdGVkIGVvZlwiKTtcblx0XHR9IGVsc2UgaWYgKFsnKScsICddJywgJ30nLCBcImVvbFwiXS5pbmNsdWRlcyh0b2tlbi5raW5kKSkge1xuXHRcdFx0dGhyb3cgcG9zaXRpb25FcnJvcih0b2tlbiwgYHVuZXhwZWN0ZWQgJHt0b2tlbi5raW5kfWApXG5cdFx0fSBlbHNlIGlmIChbXCJzdHJpbmdcIiwgXCJudW1iZXJcIiwgXCJyZWZcIiwgXCJhdG9tXCJdLmluY2x1ZGVzKHRva2VuLmtpbmQpKSB7XG5cdFx0XHRyZXR1cm4gdG9rZW4gYXMgRXhwcmVzc2lvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3dpdGNoICh0b2tlbi5raW5kKSB7XG5cdFx0XHRjYXNlIFwic3ltYm9sXCI6XG5cdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IodG9rZW4sIGB1bmV4cGVjdGVkIHN5bWJvbCAke3Rva2VuLnZhbHVlfWApO1xuXHRcdFx0Y2FzZSAnKCc6XG5cdFx0XHRcdHRoaXMubGV4ZXIudW5yZWFkVG9rZW4oKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY2FsbE9yVmFsdWUoKTtcblx0XHRcdGNhc2UgJ3snOlxuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmJsb2NrKCk7XG5cdFx0XHRjYXNlICdbJzpcblx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5saXN0KCk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbGxhcHNlKHN0YXJ0OiBQb3NpdGlvbiwgdmFsc09yU3ltczogVmFsdWVPclN5bWJvbFtdKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IHBhcnNlciA9IG5ldyBPcGVyYXRvclBhcnNlcihzdGFydCwgdGhpcy5wcmVjZWRlbmNlVGFibGUsIHZhbHNPclN5bXMpO1xuXHRcdHJldHVybiBwYXJzZXIucGFyc2UoKTtcblx0fVxufVxuXG5jbGFzcyBPcGVyYXRvclBhcnNlciB7XG5cdHN0YXJ0OiBQb3NpdGlvbjtcblx0cHJlY2VkZW5jZVRhYmxlOiBQcmVjZWRlbmNlVGFibGU7XG5cdHZhbHNPclN5bXM6IFZhbHVlT3JTeW1ib2xbXTtcblx0cG9zaXRpb24gPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHN0YXJ0OiBQb3NpdGlvbiwgcHJlY2VkZW5jZVRhYmxlOiBQcmVjZWRlbmNlVGFibGUsIHZhbHNPclN5bXM6IFZhbHVlT3JTeW1ib2xbXSkge1xuXHRcdGlmICh2YWxzT3JTeW1zWzBdPy5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRsZXQgc3ltID0gdmFsc09yU3ltc1swXTtcblx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3Ioc3ltLCBgdW5leHBlY3RlZCBzeW1ib2wgJHtzeW0udmFsdWV9YCk7XG5cdFx0fVxuXHRcdGxldCBsYXN0U3ltID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgdmFsT3JTeW0gb2YgdmFsc09yU3ltcykge1xuXHRcdFx0aWYgKHZhbE9yU3ltLmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0aWYgKGxhc3RTeW0pIHtcblx0XHRcdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKFxuXHRcdFx0XHRcdFx0dmFsT3JTeW0sXG5cdFx0XHRcdFx0XHRgc3ltYm9sICR7dmFsT3JTeW0udmFsdWV9IGRpcmVjdGx5IGZvbGxvd3MgYW5vdGhlciBzeW1ib2xgLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCEodmFsT3JTeW0udmFsdWUgaW4gcHJlY2VkZW5jZVRhYmxlKSkge1xuXHRcdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IoXG5cdFx0XHRcdFx0XHR2YWxPclN5bSxcblx0XHRcdFx0XHRcdGB1bmtub3duIG9wZXJhdG9yICR7dmFsT3JTeW0udmFsdWV9YFxuXHRcdFx0XHRcdClcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0U3ltID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhc3RTeW0gPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHZhbHNPclN5bXNbdmFsc09yU3ltcy5sZW5ndGggLSAxXT8ua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0bGV0IHN5bSA9IHZhbHNPclN5bXNbdmFsc09yU3ltcy5sZW5ndGggLSAxXSBhcyAoUVN5bWJvbCZQb3NpdGlvbik7XG5cdFx0XHR0aHJvdyBwb3NpdGlvbkVycm9yKHN5bSwgYHVuZXhwZWN0ZWQgc3ltYm9sICR7c3ltLnZhbHVlfWApO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhcnQgPSBzdGFydDtcblx0XHR0aGlzLnByZWNlZGVuY2VUYWJsZSA9IHByZWNlZGVuY2VUYWJsZTtcblx0XHR0aGlzLnZhbHNPclN5bXMgPSB2YWxzT3JTeW1zO1xuXHR9XG5cblx0cHJlY2VkZW5jZShzeW06IFFTeW1ib2wpOiBudW1iZXIge1xuXHRcdGxldCBwcmVjID0gdGhpcy5wcmVjZWRlbmNlVGFibGVbc3ltLnZhbHVlXTtcblx0XHRpZiAocHJlYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJlYztcblx0fVxuXG5cdG5leHQoKTogVmFsdWVPclN5bWJvbCB8IG51bGwge1xuXHRcdGxldCBwb3NpdGlvbiA9IHRoaXMucG9zaXRpb247XG5cdFx0dGhpcy5wb3NpdGlvbisrO1xuXHRcdGlmIChwb3NpdGlvbiA+PSB0aGlzLnZhbHNPclN5bXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMudmFsc09yU3ltc1twb3NpdGlvbl0hO1xuXHRcdH1cblx0fVxuXG5cdHBlZWsoKTogVmFsdWVPclN5bWJvbCB8IG51bGwge1xuXHRcdGlmICh0aGlzLnBvc2l0aW9uID49IHRoaXMudmFsc09yU3ltcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy52YWxzT3JTeW1zW3RoaXMucG9zaXRpb25dITtcblx0XHR9XG5cdH1cblxuXHRza2lwKG46IG51bWJlcik6IHZvaWQge1xuXHRcdGxldCBuZXh0ID0gdGhpcy5wb3NpdGlvbiArIG47XG5cdFx0aWYgKG4gPT09IDAgfHwgbmV4dCA+IHRoaXMudmFsc09yU3ltcy5sZW5ndGggfHwgbmV4dCA8IDApIHtcblx0XHRcdHRocm93IGludGVybmFsKCk7XG5cdFx0fVxuXHRcdHRoaXMucG9zaXRpb24gPSBuZXh0O1xuXHR9XG5cblx0cGFyc2UoKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IGV4cHJzID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5uZXh0KCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbGxhcHNlRXhwcmVzc2lvbnModGhpcy5zdGFydCwgZXhwcnMpO1xuXHRcdFx0fSBlbHNlIGlmIChuZXh0LmtpbmQgPT09IFwic3ltYm9sXCIpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMub3BlcmF0b3JMb3dlcihcblx0XHRcdFx0XHRuZXh0LFxuXHRcdFx0XHRcdGNvbGxhcHNlRXhwcmVzc2lvbnMoZXhwcnNbMF0gPz8gdGhpcy5zdGFydCwgZXhwcnMpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IG9wID0gdGhpcy5vcGVyYXRvcihuZXh0KTtcblx0XHRcdFx0aWYgKCFvcCkge1xuXHRcdFx0XHRcdGV4cHJzLnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZXhwcnMucHVzaChvcCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvcGVyYXRvckxvd2VyKHN5bTogUVN5bWJvbCZQb3NpdGlvbiwgbGVmdDogRXhwcmVzc2lvbik6IEV4cHJlc3Npb24ge1xuXHRcdGNvbnN0IGtpbmQgPSBcImNhbGxcIjtcblx0XHRsZXQgZmlyc3QgPSBuZXdFeHByZXNzaW9uKHN5bSwgeyBraW5kOiBcInJlZlwiLCB2YWx1ZTogc3ltLnZhbHVlIH0pO1xuXHRcdGxldCByaWdodDogRXhwcmVzc2lvbltdID0gW107XG5cdFx0Y29uc3QgY29sbGFwc2VSaWdodCA9ICgpOiBFeHByZXNzaW9uID0+IHtcblx0XHRcdGxldCBwb3NpdGlvbiA9IHJpZ2h0WzBdO1xuXHRcdFx0aWYgKCFwb3NpdGlvbikge1xuXHRcdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbGxhcHNlRXhwcmVzc2lvbnMocG9zaXRpb24sIHJpZ2h0KTtcblx0XHR9O1xuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5uZXh0KCk7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24obGVmdCwge1xuXHRcdFx0XHRcdGtpbmQsXG5cdFx0XHRcdFx0Zmlyc3QsXG5cdFx0XHRcdFx0YXJndW1lbnRzOiBbbGVmdCwgY29sbGFwc2VSaWdodCgpXSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKG5leHQua2luZCA9PT0gXCJzeW1ib2xcIikge1xuXHRcdFx0XHRpZiAodGhpcy5wcmVjZWRlbmNlKG5leHQpIDwgdGhpcy5wcmVjZWRlbmNlKHN5bSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihsZWZ0LCB7XG5cdFx0XHRcdFx0XHRraW5kLFxuXHRcdFx0XHRcdFx0Zmlyc3QsXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtcblx0XHRcdFx0XHRcdFx0bGVmdCxcblx0XHRcdFx0XHRcdFx0dGhpcy5vcGVyYXRvckxvd2VyKFxuXHRcdFx0XHRcdFx0XHRcdG5leHQsXG5cdFx0XHRcdFx0XHRcdFx0Y29sbGFwc2VSaWdodCgpLFxuXHRcdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLm9wZXJhdG9yTG93ZXIobmV4dCxcblx0XHRcdFx0XHRcdG5ld0V4cHJlc3Npb24obGVmdCwge1xuXHRcdFx0XHRcdFx0XHRraW5kLFxuXHRcdFx0XHRcdFx0XHRmaXJzdCxcblx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbbGVmdCwgY29sbGFwc2VSaWdodCgpXSxcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdClcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IG9wID0gdGhpcy5vcGVyYXRvcihuZXh0KTtcblx0XHRcdFx0aWYgKCFvcCkge1xuXHRcdFx0XHRcdHJpZ2h0LnB1c2gobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmlnaHQucHVzaChvcCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvcGVyYXRvcihsZWZ0OiBFeHByZXNzaW9uKTogRXhwcmVzc2lvbiB8IG51bGwge1xuXHRcdGxldCBzeW0gPSB0aGlzLm5leHQoKTtcblx0XHRpZiAoIXN5bSB8fCBzeW0ua2luZCAhPT0gXCJzeW1ib2xcIiB8fCB0aGlzLnByZWNlZGVuY2Uoc3ltKSA8IDApIHtcblx0XHRcdHRoaXMuc2tpcCgtMSk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0bGV0IHJpZ2h0ID0gdGhpcy5uZXh0KCk7XG5cdFx0aWYgKCFyaWdodCB8fCByaWdodC5raW5kID09PSBcInN5bWJvbFwiKSB7XG5cdFx0XHR0aHJvdyBpbnRlcm5hbCgpO1xuXHRcdH1cblx0XHRjb25zdCBraW5kID0gXCJjYWxsXCI7XG5cdFx0bGV0IGZpcnN0ID0gbmV3RXhwcmVzc2lvbihzeW0sIHtraW5kOiBcInJlZlwiLCB2YWx1ZTogc3ltLnZhbHVlfSk7XG5cdFx0bGV0IGN1cnJlbnQ6IENhbGwgPSB7IGtpbmQsIGZpcnN0LCBhcmd1bWVudHM6IFtsZWZ0LCByaWdodF0gfTtcblx0XHRsZXQgY3VycmVudEV4cHIgPSBuZXdFeHByZXNzaW9uKGxlZnQsIGN1cnJlbnQpO1xuXG5cdFx0bGV0IG5leHRTeW0gPSB0aGlzLnBlZWsoKTtcblx0XHRpZiAoIW5leHRTeW0gfHwgbmV4dFN5bS5raW5kICE9PSBcInN5bWJvbFwiKSB7XG5cdFx0XHRyZXR1cm4gY3VycmVudEV4cHI7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnByZWNlZGVuY2UobmV4dFN5bSkgPiB0aGlzLnByZWNlZGVuY2Uoc3ltKSkge1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLm9wZXJhdG9yKHJpZ2h0KTtcblx0XHRcdGlmICghbmV4dCkge1xuXHRcdFx0XHRyZXR1cm4gY3VycmVudEV4cHI7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihsZWZ0LCB7a2luZCwgZmlyc3QsIGFyZ3VtZW50czogW2xlZnQsIG5leHRdfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBuZXh0ID0gdGhpcy5vcGVyYXRvcihjdXJyZW50RXhwcik7XG5cdFx0XHRpZiAoIW5leHQpIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnRFeHByO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5leHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGV4cHJlc3Npb25TdHJpbmcoZXhwcjogRXhwcmVzc2lvbik6IHN0cmluZyB7XG5cdHN3aXRjaCAoZXhwci5raW5kKSB7XG5cdGNhc2UgXCJ1bml0XCI6XG5cdFx0cmV0dXJuIFwiKClcIjtcblx0Y2FzZSBcImNhbGxcIjpcblx0XHRsZXQgZmlyc3QgPSBleHByZXNzaW9uU3RyaW5nKGV4cHIuZmlyc3QpO1xuXHRcdGlmIChleHByLmFyZ3VtZW50cy5sZW5ndGggPCAxKSB7XG5cdFx0XHRyZXR1cm4gYCgke2ZpcnN0fSAoKSlgO1xuXHRcdH1cblx0XHRsZXQgYXJncyA9IGV4cHIuYXJndW1lbnRzLm1hcChhcmcgPT4gZXhwcmVzc2lvblN0cmluZyhhcmcpKS5qb2luKFwiIFwiKTtcblx0XHRyZXR1cm4gYCgke2ZpcnN0fSAke2FyZ3N9KWA7XG5cdGNhc2UgXCJsaXN0XCI6XG5cdFx0bGV0IGVsZW1lbnRzID0gZXhwci5lbGVtZW50cy5tYXAoYXJnID0+IGV4cHJlc3Npb25TdHJpbmcoYXJnKSkuam9pbihcIiBcIik7XG5cdFx0cmV0dXJuIGBbJHtlbGVtZW50c31dYDtcblx0Y2FzZSBcImJsb2NrXCI6XG5cdFx0bGV0IGV4cHJzID0gZXhwci5leHByZXNzaW9ucy5tYXAoYXJnID0+IGV4cHJlc3Npb25TdHJpbmcoYXJnKSkuam9pbihcIlxcblwiKTtcblx0XHRpZiAoZXhwci5leHByZXNzaW9ucy5sZW5ndGggPCAyKSB7XG5cdFx0XHRyZXR1cm4gYHsgJHtleHByc30gfWA7XG5cdFx0fVxuXHRcdHJldHVybiBge1xcbiR7ZXhwcnN9XFxufWA7XG5cdGRlZmF1bHQ6XG5cdFx0cmV0dXJuIGV4cHIudmFsdWUudG9TdHJpbmcoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBydW4oKSB7XG5cdGxldCBjb2RlID0gKGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY29kZVwiKSBhcyBIVE1MSW5wdXRFbGVtZW50KS52YWx1ZTtcblx0bGV0IGxleGVyID0gbmV3IExleGVyKFwidGV4dGFyZWFcIiwgY29kZSk7XG5cdGxldCB0b2tlbnMgPSBbXTtcblx0Zm9yIChsZXQgdG9rIG9mIGxleGVyKSB7XG5cdFx0aWYgKHRvay5raW5kID09PSBcImF0b21cIlxuXHRcdFx0fHwgdG9rLmtpbmQgPT09IFwicmVmXCJcblx0XHRcdHx8IHRvay5raW5kID09PSBcIm51bWJlclwiXG5cdFx0XHR8fCB0b2sua2luZCA9PT0gXCJzdHJpbmdcIlxuXHRcdFx0fHwgdG9rLmtpbmQgPT09IFwic3ltYm9sXCJcblx0XHQpIHtcblx0XHRcdHRva2Vucy5wdXNoKGAke3Rvay5raW5kfSAoJHt0b2sudmFsdWV9KWApXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRva2Vucy5wdXNoKGAke3Rvay5raW5kfWApO1xuXHRcdH1cblx0fTtcblx0Y29uc29sZS5sb2codG9rZW5zLmpvaW4oXCIsIFwiKSk7XG5cdGxldCBwYXJzZXIgPSBuZXcgUGFyc2VyKFxuXHRcdG5ldyBMZXhlcihcInRleHRhcmVhXCIsIGNvZGUpLFxuXHRcdFtcblx0XHRcdFtcIj1cIiwgXCItPlwiXSxcblx0XHRcdFtcInw+XCJdLFxuXHRcdF0sXG5cdFx0W1xuXHRcdFx0W1wiLT5cIl0sXG5cdFx0XHRbXCImJlwiLCBcInx8XCJdLFxuXHRcdFx0W1wiPT1cIiwgXCIhPVwiXSxcblx0XHRcdFtcIjxcIiwgXCI8PVwiLCBcIj5cIiwgXCI+PVwiXSxcblx0XHRcdFtcIi4uXCIsIFwiLi48XCIsIFwiPC4uXCIsIFwiPC4uPFwiXSxcblx0XHRcdFtcIisrXCJdLFxuXHRcdFx0W1wiK1wiLCBcIi1cIl0sXG5cdFx0XHRbXCIqXCIsIFwiL1wiLCBcIi8vXCIsIFwiJSVcIl0sXG5cdFx0XHRbXCJAXCJdLFxuXHRcdFx0W1wiLlwiXSxcblx0XHRdLFxuXHQpO1xuXHRsZXQgZXhwcnMgPSBwYXJzZXIucGFyc2UoKTtcblx0Zm9yIChsZXQgZXhwciBvZiBleHBycykge1xuXHRcdGNvbnNvbGUubG9nKGV4cHJlc3Npb25TdHJpbmcoZXhwcikpO1xuXHR9XG59OyJdfQ==