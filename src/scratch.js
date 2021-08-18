"use strict";
function error() {
    throw new Error("internal error");
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
            error();
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
                    error();
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
            error();
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
function newPrecedenceTable(table, offset) {
    let prec = {};
    table.forEach((level, i) => level.forEach(symbol => prec[symbol] = i + offset));
    return prec;
}
class Parser {
    constructor(lexer, lowerThanCall, higherThanCall) {
        this.lexer = lexer;
        this.precedenceTable = {
            lowerThanCall: newPrecedenceTable(lowerThanCall, 0),
            higherThanCall: newPrecedenceTable(higherThanCall, lowerThanCall.length),
        };
    }
    mustNextToken(tk) {
        let token = this.lexer.nextToken();
        if (!token || (tk && token.kind !== tk.kind)) {
            error();
        }
        return token;
    }
    parse() {
        let expressions = [];
        while (true) {
            let start = this.lexer.peekToken();
            if (!start) {
                return expressions;
            }
            let exprs = this.expressions({ kind: "eol" });
            if (exprs.length > 0) {
                expressions.push(collapseExpressions(start, exprs));
            }
            this.mustNextToken();
        }
    }
    callOrValue() {
        let openBracket = this.mustNextToken({ kind: '(' });
        let exprs = this.expressions({ kind: ")" });
        this.mustNextToken();
        return collapseExpressions(openBracket, exprs);
    }
    list() {
        let openSquare = this.mustNextToken({ kind: "[" });
        let elements = this.expressions({ kind: "]" });
        this.mustNextToken();
        return newExpression(openSquare, { kind: "list", elements });
    }
    block() {
        let openCurly = this.mustNextToken({ kind: "{" });
        let expressions = [];
        while (true) {
            let start = this.lexer.peekToken();
            let exprs = this.expressions({ kind: "eol" }, { kind: "}" });
            if (exprs.length > 0) {
                expressions.push(collapseExpressions(start, exprs));
            }
            if (this.lexer.nextToken().kind === '}') {
                break;
            }
        }
        return newExpression(openCurly, { kind: "block", expressions });
    }
    expressions(...endAt) {
        let exprs = [];
        while (true) {
            const token = this.lexer.nextToken();
            if (!token) {
                let expected = endAt.map(tk => `'${tk.kind}'`).join(", ");
                throw new Error(`unexpected eof, expected ${expected}`);
            }
            else if (endAt.some(tk => tk.kind === token.kind)) {
                this.lexer.unreadToken();
                return exprs;
            }
            else if ([')', ']', '}'].includes(token.kind)) {
                throw positionError(token, `unexpected ${token.kind}`);
            }
            else if (["string", "number", "ref", "atom"].includes(token.kind)) {
                exprs.push(token);
            }
            else {
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
    let code = document.getElementById("code").value;
    let lexer = new Lexer("textarea", code);
    for (let char of lexer) {
        console.log(char);
    }
    ;
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
    console.log(parser.parse());
}
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NyYXRjaC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNjcmF0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBLFNBQVMsS0FBSztJQUNWLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUN0QyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsYUFBYSxDQUFDLEdBQWEsRUFBRSxPQUFlO0lBQ3BELE9BQU8sSUFBSSxLQUFLLENBQUMsR0FBRyxHQUFHLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLFFBQVEsR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQzNFLENBQUM7QUE2R0QsU0FBUyxhQUFhLENBQUMsR0FBYSxFQUFFLElBQW9CO0lBQ3pELE9BQU8sRUFBQyxHQUFHLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBQyxDQUFDO0FBQ3RFLENBQUM7QUFFRCwwQkFBMEI7QUFFMUIsU0FBUyxPQUFPLENBQUMsSUFBWTtJQUM1QixPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLFlBQVksQ0FBQyxJQUFZO0lBQ2pDLE9BQU8sYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNqQyxDQUFDO0FBQUEsQ0FBQztBQUVGLFNBQVMsT0FBTyxDQUFDLElBQVk7SUFDNUIsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDcEMsQ0FBQztBQUFBLENBQUM7QUFFRixTQUFTLGdCQUFnQixDQUFDLElBQVk7SUFDckMsT0FBTyxDQUFDLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFF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RUQsU0FBUyxHQUFHO0lBQ1gsSUFBSSxJQUFJLEdBQUksUUFBUSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQXNCLENBQUMsS0FBSyxDQUFDO0lBQ3ZFLElBQUksS0FBSyxHQUFHLElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN4QyxLQUFLLElBQUksSUFBSSxJQUFJLEtBQUssRUFBRTtRQUN2QixPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2xCO0lBQUEsQ0FBQztJQUNGLElBQUksTUFBTSxHQUFHLElBQUksTUFBTSxDQUN0QixJQUFJLEtBQUssQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLEVBQzNCO1FBQ0MsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDO1FBQ1gsQ0FBQyxJQUFJLENBQUM7S0FDTixFQUNEO1FBQ0MsQ0FBQyxJQUFJLENBQUM7UUFDTixDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7UUFDWixDQUFDLElBQUksRUFBRSxJQUFJLENBQUM7UUFDWixDQUFDLEdBQUcsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQztRQUN0QixDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQztRQUM1QixDQUFDLElBQUksQ0FBQztRQUNOLENBQUMsR0FBRyxFQUFFLEdBQUcsQ0FBQztRQUNWLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDO1FBQ3RCLENBQUMsR0FBRyxDQUFDO1FBQ0wsQ0FBQyxHQUFHLENBQUM7S0FDTCxDQUNELENBQUM7SUFDRixPQUFPLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQzdCLENBQUM7QUFBQSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiZnVuY3Rpb24gZXJyb3IoKTogbmV2ZXIge1xuICAgIHRocm93IG5ldyBFcnJvcihcImludGVybmFsIGVycm9yXCIpO1xufTtcblxuZnVuY3Rpb24gcG9zaXRpb25FcnJvcihwb3M6IFBvc2l0aW9uLCBtZXNzYWdlOiBzdHJpbmcpOiBFcnJvciB7XG5cdHJldHVybiBuZXcgRXJyb3IoYCR7cG9zLnBhdGh9fCR7cG9zLmxpbmV9IGNvbCAke3Bvcy5jb2x1bW59fCAke21lc3NhZ2V9YCk7XG59XG5cbnR5cGUgUmVmID0ge1xuXHRraW5kOiBcInJlZlwiO1xuXHR2YWx1ZTogc3RyaW5nO1xufTtcblxudHlwZSBBdG9tID0ge1xuXHRraW5kOiBcImF0b21cIjtcblx0dmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgUVN5bWJvbCA9IHtcblx0a2luZDogXCJzeW1ib2xcIjtcblx0dmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgUU51bWJlciA9IHtcblx0a2luZDogXCJudW1iZXJcIjtcblx0dmFsdWU6IGJpZ2ludDtcbn07XG5cbnR5cGUgUVN0cmluZyA9IHtcblx0a2luZDogXCJzdHJpbmdcIjtcblx0dmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgT3BlbkJyYWNrZXQgPSB7XG5cdGtpbmQ6IFwiKFwiO1xufTtcblxudHlwZSBDbG9zZWRCcmFja2V0ID0ge1xuXHRraW5kOiBcIilcIjtcbn07XG5cbnR5cGUgT3BlbkN1cmx5ID0ge1xuXHRraW5kOiBcIntcIjtcbn07XG5cbnR5cGUgQ2xvc2VkQ3VybHkgPSB7XG5cdGtpbmQ6IFwifVwiO1xufTtcblxudHlwZSBPcGVuU3F1YXJlID0ge1xuXHRraW5kOiBcIltcIjtcbn07XG5cbnR5cGUgQ2xvc2VkU3F1YXJlID0ge1xuXHRraW5kOiBcIl1cIjtcbn07XG5cbnR5cGUgRW5kT2ZMaW5lID0ge1xuXHRraW5kOiBcImVvbFwiO1xufTtcblxudHlwZSBVbml0ID0ge1xuXHRraW5kOiBcInVuaXRcIjtcbn1cblxudHlwZSBDYWxsID0ge1xuXHRraW5kOiBcImNhbGxcIjtcblx0Zmlyc3Q6IEV4cHJlc3Npb247XG5cdGFyZ3VtZW50czogRXhwcmVzc2lvbltdO1xufVxuXG50eXBlIExpc3QgPSB7XG5cdGtpbmQ6IFwibGlzdFwiO1xuXHRlbGVtZW50czogRXhwcmVzc2lvbltdO1xufVxuXG50eXBlIEJsb2NrID0ge1xuXHRraW5kOiBcImJsb2NrXCI7XG5cdGV4cHJlc3Npb25zOiBFeHByZXNzaW9uW107XG59XG5cbnR5cGUgVG9rZW5LaW5kID1cblx0fCBSZWZcblx0fCBBdG9tXG5cdHwgUVN5bWJvbFxuXHR8IFFOdW1iZXJcblx0fCBRU3RyaW5nXG5cdHwgT3BlbkJyYWNrZXRcblx0fCBDbG9zZWRCcmFja2V0XG5cdHwgT3BlbkN1cmx5XG5cdHwgQ2xvc2VkQ3VybHlcblx0fCBPcGVuU3F1YXJlXG5cdHwgQ2xvc2VkU3F1YXJlXG5cdHwgRW5kT2ZMaW5lO1xuXG50eXBlIEV4cHJlc3Npb25LaW5kID1cblx0fCBSZWZcblx0fCBBdG9tXG5cdHwgUU51bWJlclxuXHR8IFFTdHJpbmdcblx0fCBVbml0XG5cdHwgQ2FsbFxuXHR8IExpc3Rcblx0fCBCbG9jaztcblxudHlwZSBQb3NpdGlvbiA9IHtcblx0cGF0aDogc3RyaW5nO1xuXHRsaW5lOiBudW1iZXI7XG5cdGNvbHVtbjogbnVtYmVyO1xufTtcblxudHlwZSBUb2tlbiA9IFRva2VuS2luZCAmIFBvc2l0aW9uO1xuXG50eXBlIEV4cHJlc3Npb24gPSBFeHByZXNzaW9uS2luZCAmIFBvc2l0aW9uO1xuXG5mdW5jdGlvbiBuZXdFeHByZXNzaW9uKHBvczogUG9zaXRpb24sIGV4cHI6IEV4cHJlc3Npb25LaW5kKTogRXhwcmVzc2lvbiB7XG5cdHJldHVybiB7Li4uZXhwciwgcGF0aDogcG9zLnBhdGgsIGxpbmU6IHBvcy5saW5lLCBjb2x1bW46IHBvcy5jb2x1bW59O1xufVxuXG4vLyBUT0RPOiBzdXBwb3J0IG5vbiBhc2NpaVxuXG5mdW5jdGlvbiBpc1NwYWNlKGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15cXHMkLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNJZGVudFN0YXJ0KGNoYXI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15bYS16QS1aX10kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNJZGVudChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eWzAtOWEtekEtWl9dJC8udGVzdChjaGFyKTtcbn07XG5cbmZ1bmN0aW9uIGlzUmVzZXJ2ZWRTeW1ib2woY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBbJ1wiJywgXCInXCIsICcoJywgJyknLCAneycsICd9JywgJ1snLCAnXScsICcjJ10uaW5jbHVkZXMoY2hhcik7XG59O1xuXG5mdW5jdGlvbiBpc1N5bWJvbChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGlzUmVzZXJ2ZWRTeW1ib2woY2hhcikgfHwgKGNoYXIgPT0gJ18nKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fTtcblx0cmV0dXJuIC9eW1xcdTAwMjEtXFx1MDAyRlxcdTAwM0EtXFx1MDA0MFxcdTAwNUItXFx1MDA2MFxcdTAwN0ItXFx1MDA3RV0kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNOdW1iZXJTdGFydChjaGFyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIC9eWzAtOV0kLy50ZXN0KGNoYXIpO1xufTtcblxuZnVuY3Rpb24gaXNOdW1iZXIoY2hhcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlswLTlfXSQvLnRlc3QoY2hhcik7XG59O1xuXG5jbGFzcyBMZXhlciBpbXBsZW1lbnRzIEl0ZXJhYmxlPFRva2VuPiB7XG5cdHBhdGg6IHN0cmluZztcblx0Y2hhcnM6IEl0ZXJhdG9yPHN0cmluZz47XG5cdGxhc3RDaGFyOiB7Y2hhcjogc3RyaW5nLCB1c2U6IGJvb2xlYW59IHwgbnVsbCA9IG51bGw7XG5cdGxpbmUgPSAxO1xuXHRjb2x1bW4gPSAxO1xuXHRsYXN0TmV3bGluZSA9IGZhbHNlO1xuXG5cdGxhc3RUb2tlbjoge3Rva2VuOiBUb2tlbiwgdXNlOiBib29sZWFufSB8IG51bGwgPSBudWxsO1xuXHRmaW5pc2hlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKHBhdGg6IHN0cmluZywgYnlDaGFyOiBJdGVyYWJsZTxzdHJpbmc+KSB7XG5cdFx0dGhpcy5wYXRoID0gcGF0aDtcblx0XHR0aGlzLmNoYXJzID0gYnlDaGFyW1N5bWJvbC5pdGVyYXRvcl0oKTtcblx0fVxuXG5cdG5leHRDaGFyKCk6IHtjaGFyOiBzdHJpbmcsIGxpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXJ9IHwgbnVsbCB7XG5cdFx0bGV0IGNoYXI6IHN0cmluZztcblx0XHRpZiAodGhpcy5sYXN0Q2hhciAmJiB0aGlzLmxhc3RDaGFyLnVzZSkge1xuXHRcdFx0dGhpcy5sYXN0Q2hhci51c2UgPSBmYWxzZTtcblx0XHRcdGNoYXIgPSB0aGlzLmxhc3RDaGFyLmNoYXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCB7ZG9uZSwgdmFsdWV9ID0gdGhpcy5jaGFycy5uZXh0KCk7XG5cdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH07XG5cdFx0XHRjaGFyID0gdmFsdWU7XG5cdFx0fTtcblx0XHR0aGlzLmxhc3RDaGFyID0ge2NoYXIsIHVzZTogZmFsc2V9O1xuXG5cdFx0aWYgKGNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdGlmICh0aGlzLmxhc3ROZXdsaW5lKSB7XG5cdFx0XHRcdHRoaXMuY29sdW1uID0gMTtcblx0XHRcdFx0cmV0dXJuIHtjaGFyLCBsaW5lOiB0aGlzLmxpbmUrKywgY29sdW1uOiB0aGlzLmNvbHVtbn07IFxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7Y2hhciwgbGluZTogdGhpcy5saW5lKyssIGNvbHVtbjogdGhpcy5jb2x1bW59OyBcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLmxhc3ROZXdsaW5lKSB7XG5cdFx0XHRcdHRoaXMuY29sdW1uID0gMjtcblx0XHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSwgY29sdW1uOiAxfTsgXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4ge2NoYXIsIGxpbmU6IHRoaXMubGluZSwgY29sdW1uOiB0aGlzLmNvbHVtbisrfTsgXG5cdFx0XHR9O1xuXHRcdH07XG5cdH07XG5cblx0dW5yZWFkQ2hhcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGFzdENoYXIgfHwgdGhpcy5sYXN0Q2hhci51c2UpIHtcblx0XHRcdGVycm9yKCk7XG5cdFx0fTtcblx0XHR0aGlzLmxhc3RDaGFyLnVzZSA9IHRydWU7XG5cdFx0aWYgKHRoaXMubGFzdE5ld2xpbmUpIHtcblx0XHRcdHRoaXMubGluZS0tO1xuXHRcdFx0dGhpcy5sYXN0TmV3bGluZSA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbHVtbi0tO1xuXHRcdH07XG5cdH07XG5cblx0dGFrZVdoaWxlKHByZWRpY2F0ZTogKGNoYXI6IHN0cmluZykgPT4gYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0bGV0IHN0ciA9IFwiXCI7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGxldCBjaGFyID0gdGhpcy5uZXh0Q2hhcigpPy5jaGFyO1xuXHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdHJldHVybiBzdHI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByZWRpY2F0ZShjaGFyKSkge1xuXHRcdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdFx0cmV0dXJuIHN0cjtcblx0XHRcdH07XG5cdFx0XHRzdHIgKz0gY2hhcjtcblx0XHR9O1xuXHR9O1xuXG5cdGZpbmlzaGluZ0VvbCgpOiBUb2tlbiB7XG5cdFx0dGhpcy5maW5pc2hlZCA9IHRydWU7XG5cdFx0cmV0dXJuIHsgcGF0aDogdGhpcy5wYXRoLCBsaW5lOiB0aGlzLmxpbmUsIGNvbHVtbjogdGhpcy5jb2x1bW4sIGtpbmQ6IFwiZW9sXCIgfVxuXHR9O1xuXG5cdHdpdGhQb3NpdGlvbihwb3NpdGlvbjoge2xpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXJ9LCBraW5kOiBUb2tlbktpbmQpOiBUb2tlbiB7XG5cdFx0cmV0dXJuIHsgcGF0aDogdGhpcy5wYXRoLCBsaW5lOiBwb3NpdGlvbi5saW5lLCBjb2x1bW46IHBvc2l0aW9uLmNvbHVtbiwgLi4ua2luZCB9XG5cdH07XG5cblx0bmV4dFRva2VuKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMubGFzdFRva2VuICYmIHRoaXMubGFzdFRva2VuLnVzZSkge1xuXHRcdFx0dGhpcy5sYXN0VG9rZW4udXNlID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4gdGhpcy5sYXN0VG9rZW4udG9rZW47XG5cdFx0fVxuXHRcdGxldCB0b2tlbiA9IHRoaXMuZ2V0TmV4dFRva2VuKCk7XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHRoaXMubGFzdFRva2VuID0ge3Rva2VuLCB1c2U6IGZhbHNlfTtcblx0XHRyZXR1cm4gdG9rZW47XG5cdH1cblxuXHRnZXROZXh0VG9rZW4oKTogVG9rZW4gfCBudWxsIHtcblx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdGlmICghdGhpcy5maW5pc2hlZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9O1xuXG5cdFx0aWYgKGlzU3BhY2UoY2hhci5jaGFyKSkge1xuXHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXFxuJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oY2hhciwge2tpbmQ6IFwiZW9sXCJ9KTtcblx0XHRcdH07XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjaGFyID0gdGhpcy5uZXh0Q2hhcigpO1xuXHRcdFx0XHRpZiAoIWNoYXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKCFpc1NwYWNlKGNoYXIuY2hhcikpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXFxuJykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihjaGFyLCB7a2luZDogXCJlb2xcIn0pOztcblx0XHRcdFx0fTtcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGxldCBzdGFydCA9IGNoYXI7XG5cdFx0aWYgKGlzUmVzZXJ2ZWRTeW1ib2woY2hhci5jaGFyKSkge1xuXHRcdFx0c3dpdGNoIChjaGFyLmNoYXIpIHtcblx0XHRcdGNhc2UgJ1wiJzpcblx0XHRcdFx0bGV0IHN0ciA9IFwiXCI7XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3N0cmluZyBub3QgY2xvc2VkIHdpdGggXCInKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0aWYgKGNoYXIuY2hhciA9PSAnXCInKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcInN0cmluZ1wiLCB2YWx1ZTogc3RyfSk7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRpZiAoY2hhci5jaGFyICE9ICdcXHInKSB7XG5cdFx0XHRcdFx0XHRzdHIgKz0gY2hhci5jaGFyO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIFwiJ1wiOlxuXHRcdFx0XHRsZXQgY2hhciA9IHRoaXMubmV4dENoYXIoKTtcblx0XHRcdFx0aWYgKCFjaGFyIHx8ICFpc0lkZW50U3RhcnQoY2hhci5jaGFyKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihcImJhcmUgJ1wiKVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJhdG9tXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc0lkZW50KX0pO1xuXHRcdFx0Y2FzZSAnKCc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwiKFwifSk7XG5cdFx0XHRjYXNlICcpJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCIpXCJ9KTtcblx0XHRcdGNhc2UgJ3snOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIntcIn0pO1xuXHRcdFx0Y2FzZSAnfSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwifVwifSk7XG5cdFx0XHRjYXNlICdbJzpcblx0XHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJbXCJ9KTtcblx0XHRcdGNhc2UgJ10nOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy53aXRoUG9zaXRpb24oc3RhcnQsIHtraW5kOiBcIl1cIn0pO1xuXHRcdFx0Y2FzZSAnIyc6XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0bGV0IGNoYXIgPSB0aGlzLm5leHRDaGFyKCk7XG5cdFx0XHRcdFx0aWYgKCFjaGFyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5maW5pc2hpbmdFb2woKTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGlmIChjaGFyLmNoYXIgPT0gJ1xcbicpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihjaGFyLCB7a2luZDogXCJlb2xcIn0pO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRlcnJvcigpO1xuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKGlzSWRlbnRTdGFydChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwicmVmXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc0lkZW50KX0pO1xuXHRcdH0gZWxzZSBpZiAoaXNOdW1iZXJTdGFydChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdGxldCBudW0gPSB0aGlzLnRha2VXaGlsZShpc051bWJlcikucmVwbGFjZShcIl9cIiwgXCJcIik7XG5cdFx0XHRpZiAoKG51bS5sZW5ndGggPiAxKSAmJiBudW1bMF0gPT0gJzAnKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgemVybyBwYWRkZWQgbnVtYmVyICR7bnVtfWApXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHRoaXMud2l0aFBvc2l0aW9uKHN0YXJ0LCB7a2luZDogXCJudW1iZXJcIiwgdmFsdWU6IEJpZ0ludChudW0pfSk7XG5cdFx0fSBlbHNlIGlmIChpc1N5bWJvbChjaGFyLmNoYXIpKSB7XG5cdFx0XHR0aGlzLnVucmVhZENoYXIoKTtcblx0XHRcdHJldHVybiB0aGlzLndpdGhQb3NpdGlvbihzdGFydCwge2tpbmQ6IFwic3ltYm9sXCIsIHZhbHVlOiB0aGlzLnRha2VXaGlsZShpc1N5bWJvbCl9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVE9ETzogcXVvdGUgY2hhciB3aGVuIG5lY2Vzc2FyeVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGB1bmtub3duIGNoYXJhY3RlciAke2NoYXJ9YCk7XG5cdFx0fTtcblx0fTtcblxuXHR1bnJlYWRUb2tlbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGFzdFRva2VuIHx8IHRoaXMubGFzdFRva2VuLnVzZSkge1xuXHRcdFx0ZXJyb3IoKTtcblx0XHR9O1xuXHRcdHRoaXMubGFzdFRva2VuLnVzZSA9IHRydWU7XG5cdH07XG5cblx0cGVla1Rva2VuKCk6IFRva2VuIHwgbnVsbCB7XG5cdFx0bGV0IHRva2VuID0gdGhpcy5uZXh0VG9rZW4oKTtcblx0XHR0aGlzLnVucmVhZFRva2VuKCk7XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9XG5cblx0W1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmF0b3I8VG9rZW4+IHtcblx0XHRyZXR1cm4gbmV3IFRva2VuSXRlcmF0b3IodGhpcyk7XG5cdH07XG59O1xuXG5jbGFzcyBUb2tlbkl0ZXJhdG9yIGltcGxlbWVudHMgSXRlcmF0b3I8VG9rZW4+IHtcblx0bGV4ZXI6IExleGVyO1xuXG5cdGNvbnN0cnVjdG9yKGxleGVyOiBMZXhlcikge1xuXHRcdHRoaXMubGV4ZXIgPSBsZXhlcjtcblx0fTtcblxuXHRuZXh0KCk6IEl0ZXJhdG9yUmVzdWx0PFRva2VuPiB7XG5cdFx0bGV0IHRva2VuID0gdGhpcy5sZXhlci5uZXh0VG9rZW4oKTtcblx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHQvLyB0aGUgdHlwZSBvZiBJdGVyYXRvciByZXF1aXJlcyB0aGF0IHdlIGFsd2F5cyByZXR1cm4gYSB2YWxpZCBUb2tlblxuXHRcdFx0Ly8gc28gd2UgcmV0dXJuIGVvbCBoZXJlXG5cdFx0XHRyZXR1cm4ge2RvbmU6IHRydWUsIHZhbHVlOiB7a2luZDogXCJlb2xcIn19O1xuXHRcdH07XG5cdFx0cmV0dXJuIHtkb25lOiBmYWxzZSwgdmFsdWU6IHRva2VufTtcblx0fTtcbn07XG5cbmZ1bmN0aW9uIGNvbGxhcHNlRXhwcmVzc2lvbnMocG9zOiBQb3NpdGlvbiwgZXhwcnM6IEV4cHJlc3Npb25bXSkge1xuXHRzd2l0Y2ggKGV4cHJzLmxlbmd0aCkge1xuXHRcdGNhc2UgMDpcblx0XHRcdHJldHVybiBuZXdFeHByZXNzaW9uKHBvcywge2tpbmQ6IFwidW5pdFwifSk7XG5cdFx0Y2FzZSAxOlxuXHRcdFx0cmV0dXJuIG5ld0V4cHJlc3Npb24ocG9zLCBleHByc1swXSEpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihcblx0XHRcdFx0cG9zLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogXCJjYWxsXCIsXG5cdFx0XHRcdFx0Zmlyc3Q6IGV4cHJzWzBdISxcblx0XHRcdFx0XHRhcmd1bWVudHM6IGV4cHJzLnNsaWNlKDEpLFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH1cbn1cblxuaW50ZXJmYWNlIFByZWNlZGVuY2VUYWJsZSB7IFtrZXk6IHN0cmluZ106IG51bWJlcjsgfTtcblxuZnVuY3Rpb24gbmV3UHJlY2VkZW5jZVRhYmxlKHRhYmxlOiBzdHJpbmdbXVtdLCBvZmZzZXQ6IG51bWJlcik6IFByZWNlZGVuY2VUYWJsZSB7XG5cdGxldCBwcmVjOiBQcmVjZWRlbmNlVGFibGUgPSB7fTtcblx0dGFibGUuZm9yRWFjaCgobGV2ZWwsIGkpID0+IGxldmVsLmZvckVhY2goc3ltYm9sID0+IHByZWNbc3ltYm9sXSA9IGkgKyBvZmZzZXQpKTtcblx0cmV0dXJuIHByZWM7XG59XG5cbmNsYXNzIFBhcnNlciB7XG5cdGxleGVyOiBMZXhlcjtcblx0cHJlY2VkZW5jZVRhYmxlOiB7XG5cdFx0bG93ZXJUaGFuQ2FsbDogUHJlY2VkZW5jZVRhYmxlO1xuXHRcdGhpZ2hlclRoYW5DYWxsOiBQcmVjZWRlbmNlVGFibGU7XG5cdH07XG5cblx0Y29uc3RydWN0b3IobGV4ZXI6IExleGVyLCBsb3dlclRoYW5DYWxsOiBzdHJpbmdbXVtdLCBoaWdoZXJUaGFuQ2FsbDogc3RyaW5nW11bXSkge1xuXHRcdHRoaXMubGV4ZXIgPSBsZXhlcjtcblx0XHR0aGlzLnByZWNlZGVuY2VUYWJsZSA9IHtcblx0XHRcdGxvd2VyVGhhbkNhbGw6IG5ld1ByZWNlZGVuY2VUYWJsZShsb3dlclRoYW5DYWxsLCAwKSxcblx0XHRcdGhpZ2hlclRoYW5DYWxsOiBuZXdQcmVjZWRlbmNlVGFibGUoaGlnaGVyVGhhbkNhbGwsIGxvd2VyVGhhbkNhbGwubGVuZ3RoKSxcblx0XHR9O1xuXHR9XG5cblx0bXVzdE5leHRUb2tlbih0az86IFRva2VuS2luZCk6IFRva2VuIHtcblx0XHRsZXQgdG9rZW4gPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdGlmICghdG9rZW4gfHwgKHRrICYmIHRva2VuLmtpbmQgIT09IHRrLmtpbmQpKSB7XG5cdFx0XHRlcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9rZW47XG5cdH1cblxuXHRwYXJzZSgpOiBFeHByZXNzaW9uW10ge1xuXHRcdGxldCBleHByZXNzaW9ucyA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgc3RhcnQgPSB0aGlzLmxleGVyLnBlZWtUb2tlbigpO1xuXHRcdFx0aWYgKCFzdGFydCkge1xuXHRcdFx0XHRyZXR1cm4gZXhwcmVzc2lvbnM7XG5cdFx0XHR9XG5cdFx0XHRsZXQgZXhwcnMgPSB0aGlzLmV4cHJlc3Npb25zKHtraW5kOiBcImVvbFwifSk7XG5cdFx0XHRpZiAoZXhwcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRleHByZXNzaW9ucy5wdXNoKGNvbGxhcHNlRXhwcmVzc2lvbnMoc3RhcnQsIGV4cHJzKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm11c3ROZXh0VG9rZW4oKTtcblx0XHR9XG5cdH1cblxuXHRjYWxsT3JWYWx1ZSgpOiBFeHByZXNzaW9uIHtcblx0XHRsZXQgb3BlbkJyYWNrZXQgPSB0aGlzLm11c3ROZXh0VG9rZW4oe2tpbmQ6ICcoJ30pO1xuXHRcdGxldCBleHBycyA9IHRoaXMuZXhwcmVzc2lvbnMoe2tpbmQ6IFwiKVwifSk7XG5cdFx0dGhpcy5tdXN0TmV4dFRva2VuKCk7XG5cdFx0cmV0dXJuIGNvbGxhcHNlRXhwcmVzc2lvbnMob3BlbkJyYWNrZXQsIGV4cHJzKTtcblx0fVxuXG5cdGxpc3QoKTogRXhwcmVzc2lvbiB7XG5cdFx0bGV0IG9wZW5TcXVhcmUgPSB0aGlzLm11c3ROZXh0VG9rZW4oe2tpbmQ6IFwiW1wifSk7XG5cdFx0bGV0IGVsZW1lbnRzID0gdGhpcy5leHByZXNzaW9ucyh7a2luZDogXCJdXCJ9KTtcblx0XHR0aGlzLm11c3ROZXh0VG9rZW4oKTtcblx0XHRyZXR1cm4gbmV3RXhwcmVzc2lvbihvcGVuU3F1YXJlLCB7a2luZDogXCJsaXN0XCIsIGVsZW1lbnRzfSk7XG5cdH1cblxuXHRibG9jaygpOiBFeHByZXNzaW9uIHtcblx0XHRsZXQgb3BlbkN1cmx5ID0gdGhpcy5tdXN0TmV4dFRva2VuKHtraW5kOiBcIntcIn0pO1xuXHRcdGxldCBleHByZXNzaW9ucyA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRsZXQgc3RhcnQgPSB0aGlzLmxleGVyLnBlZWtUb2tlbigpO1xuXHRcdFx0bGV0IGV4cHJzID0gdGhpcy5leHByZXNzaW9ucyh7a2luZDogXCJlb2xcIn0sIHtraW5kOiBcIn1cIn0pO1xuXHRcdFx0aWYgKGV4cHJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZXhwcmVzc2lvbnMucHVzaChjb2xsYXBzZUV4cHJlc3Npb25zKHN0YXJ0ISwgZXhwcnMpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmxleGVyLm5leHRUb2tlbigpIS5raW5kID09PSAnfScpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXdFeHByZXNzaW9uKG9wZW5DdXJseSwge2tpbmQ6IFwiYmxvY2tcIiwgZXhwcmVzc2lvbnN9KTtcblx0fVxuXG5cdGV4cHJlc3Npb25zKC4uLmVuZEF0OiBUb2tlbktpbmRbXSk6IEV4cHJlc3Npb25bXSB7XG5cdFx0bGV0IGV4cHJzOiBFeHByZXNzaW9uW10gPSBbXTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgdG9rZW4gPSB0aGlzLmxleGVyLm5leHRUb2tlbigpO1xuXHRcdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0XHRsZXQgZXhwZWN0ZWQgPSBlbmRBdC5tYXAodGsgPT4gYCcke3RrLmtpbmR9J2ApLmpvaW4oXCIsIFwiKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGB1bmV4cGVjdGVkIGVvZiwgZXhwZWN0ZWQgJHtleHBlY3RlZH1gKTtcblx0XHRcdH0gZWxzZSBpZiAoZW5kQXQuc29tZSh0ayA9PiB0ay5raW5kID09PSB0b2tlbi5raW5kKSkge1xuXHRcdFx0XHR0aGlzLmxleGVyLnVucmVhZFRva2VuKCk7XG5cdFx0XHRcdHJldHVybiBleHBycztcblx0XHRcdH0gZWxzZSBpZiAoWycpJywgJ10nLCAnfSddLmluY2x1ZGVzKHRva2VuLmtpbmQpKSB7XG5cdFx0XHRcdHRocm93IHBvc2l0aW9uRXJyb3IodG9rZW4sIGB1bmV4cGVjdGVkICR7dG9rZW4ua2luZH1gKVxuXHRcdFx0fSBlbHNlIGlmIChbXCJzdHJpbmdcIiwgXCJudW1iZXJcIiwgXCJyZWZcIiwgXCJhdG9tXCJdLmluY2x1ZGVzKHRva2VuLmtpbmQpKSB7XG5cdFx0XHRcdGV4cHJzLnB1c2godG9rZW4gYXMgRXhwcmVzc2lvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzd2l0Y2ggKHRva2VuLmtpbmQpIHtcblx0XHRcdFx0Y2FzZSBcInN5bWJvbFwiOlxuXHRcdFx0XHRcdGVycm9yKCk7XG5cdFx0XHRcdGNhc2UgXCJlb2xcIjpcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnKCc6XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdGV4cHJzLnB1c2godGhpcy5jYWxsT3JWYWx1ZSgpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAneyc6XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdGV4cHJzLnB1c2godGhpcy5ibG9jaygpKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnWyc6XG5cdFx0XHRcdFx0dGhpcy5sZXhlci51bnJlYWRUb2tlbigpO1xuXHRcdFx0XHRcdGV4cHJzLnB1c2godGhpcy5saXN0KCkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGVycm9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gcnVuKCkge1xuXHRsZXQgY29kZSA9IChkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImNvZGVcIikgYXMgSFRNTElucHV0RWxlbWVudCkudmFsdWU7XG5cdGxldCBsZXhlciA9IG5ldyBMZXhlcihcInRleHRhcmVhXCIsIGNvZGUpO1xuXHRmb3IgKGxldCBjaGFyIG9mIGxleGVyKSB7XG5cdFx0Y29uc29sZS5sb2coY2hhcik7XG5cdH07XG5cdGxldCBwYXJzZXIgPSBuZXcgUGFyc2VyKFxuXHRcdG5ldyBMZXhlcihcInRleHRhcmVhXCIsIGNvZGUpLFxuXHRcdFtcblx0XHRcdFtcIj1cIiwgXCItPlwiXSxcblx0XHRcdFtcInw+XCJdLFxuXHRcdF0sXG5cdFx0W1xuXHRcdFx0W1wiLT5cIl0sXG5cdFx0XHRbXCImJlwiLCBcInx8XCJdLFxuXHRcdFx0W1wiPT1cIiwgXCIhPVwiXSxcblx0XHRcdFtcIjxcIiwgXCI8PVwiLCBcIj5cIiwgXCI+PVwiXSxcblx0XHRcdFtcIi4uXCIsIFwiLi48XCIsIFwiPC4uXCIsIFwiPC4uPFwiXSxcblx0XHRcdFtcIisrXCJdLFxuXHRcdFx0W1wiK1wiLCBcIi1cIl0sXG5cdFx0XHRbXCIqXCIsIFwiL1wiLCBcIi8vXCIsIFwiJSVcIl0sXG5cdFx0XHRbXCJAXCJdLFxuXHRcdFx0W1wiLlwiXSxcblx0XHRdLFxuXHQpO1xuXHRjb25zb2xlLmxvZyhwYXJzZXIucGFyc2UoKSk7XG59OyJdfQ==