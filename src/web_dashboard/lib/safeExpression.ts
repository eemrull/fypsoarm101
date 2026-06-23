type ExpressionVariables = Record<string, number>;

type Token =
  | { type: "number"; value: number; pos: number }
  | { type: "identifier"; value: string; pos: number }
  | { type: "op"; value: string; pos: number }
  | { type: "eof"; pos: number };

type AstNode =
  | { type: "number"; value: number }
  | { type: "identifier"; name: string }
  | { type: "unary"; op: "+" | "-"; expr: AstNode }
  | {
      type: "binary";
      op: "+" | "-" | "*" | "/" | "<" | ">" | "<=" | ">=" | "==" | "!=";
      left: AstNode;
      right: AstNode;
    }
  | { type: "ternary"; condition: AstNode; whenTrue: AstNode; whenFalse: AstNode };

const TWO_CHAR_OPERATORS = new Set(["<=", ">=", "==", "!="]);
const ONE_CHAR_OPERATORS = new Set([
  "+",
  "-",
  "*",
  "/",
  "(",
  ")",
  "<",
  ">",
  "?",
  ":",
]);

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isIdentifierStart(ch: string): boolean {
  return (
    (ch >= "a" && ch <= "z") ||
    (ch >= "A" && ch <= "Z") ||
    ch === "_"
  );
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    if (isWhitespace(ch)) {
      i += 1;
      continue;
    }

    const twoChar = source.slice(i, i + 2);
    if (TWO_CHAR_OPERATORS.has(twoChar)) {
      tokens.push({ type: "op", value: twoChar, pos: i });
      i += 2;
      continue;
    }

    if (ONE_CHAR_OPERATORS.has(ch)) {
      tokens.push({ type: "op", value: ch, pos: i });
      i += 1;
      continue;
    }

    if (isDigit(ch) || (ch === "." && isDigit(source[i + 1] ?? ""))) {
      const start = i;
      i += 1;
      while (i < source.length && (isDigit(source[i]) || source[i] === ".")) {
        i += 1;
      }
      const raw = source.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid numeric literal "${raw}" at ${start}`);
      }
      tokens.push({ type: "number", value, pos: start });
      continue;
    }

    if (isIdentifierStart(ch)) {
      const start = i;
      i += 1;
      while (i < source.length && isIdentifierPart(source[i])) {
        i += 1;
      }
      tokens.push({
        type: "identifier",
        value: source.slice(start, i),
        pos: start,
      });
      continue;
    }

    throw new Error(`Unsupported token "${ch}" at ${i}`);
  }

  tokens.push({ type: "eof", pos: source.length });
  return tokens;
}

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseExpression(): AstNode {
    const expr = this.parseTernary();
    const current = this.peek();
    if (current.type !== "eof") {
      throw new Error(`Unexpected token at ${current.pos}`);
    }
    return expr;
  }

  private parseTernary(): AstNode {
    let condition = this.parseComparison();
    if (this.matchOp("?")) {
      const whenTrue = this.parseTernary();
      this.expectOp(":");
      const whenFalse = this.parseTernary();
      condition = { type: "ternary", condition, whenTrue, whenFalse };
    }
    return condition;
  }

  private parseComparison(): AstNode {
    let left = this.parseAddSub();
    while (true) {
      const op = this.peekOp();
      if (
        op !== "<" &&
        op !== ">" &&
        op !== "<=" &&
        op !== ">=" &&
        op !== "==" &&
        op !== "!="
      ) {
        break;
      }
      this.consume();
      const right = this.parseAddSub();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseAddSub(): AstNode {
    let left = this.parseMulDiv();
    while (true) {
      const op = this.peekOp();
      if (op !== "+" && op !== "-") break;
      this.consume();
      const right = this.parseMulDiv();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseMulDiv(): AstNode {
    let left = this.parseUnary();
    while (true) {
      const op = this.peekOp();
      if (op !== "*" && op !== "/") break;
      this.consume();
      const right = this.parseUnary();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseUnary(): AstNode {
    const op = this.peekOp();
    if (op === "+" || op === "-") {
      this.consume();
      return { type: "unary", op, expr: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const token = this.peek();
    if (token.type === "number") {
      this.consume();
      return { type: "number", value: token.value };
    }
    if (token.type === "identifier") {
      this.consume();
      return { type: "identifier", name: token.value };
    }
    if (this.matchOp("(")) {
      const expr = this.parseTernary();
      this.expectOp(")");
      return expr;
    }
    throw new Error(`Unexpected token at ${token.pos}`);
  }

  private expectOp(expected: string): void {
    const token = this.peek();
    if (token.type !== "op" || token.value !== expected) {
      throw new Error(`Expected "${expected}" at ${token.pos}`);
    }
    this.consume();
  }

  private matchOp(op: string): boolean {
    const token = this.peek();
    if (token.type === "op" && token.value === op) {
      this.consume();
      return true;
    }
    return false;
  }

  private peekOp(): string | null {
    const token = this.peek();
    return token.type === "op" ? token.value : null;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private consume(): void {
    if (this.index < this.tokens.length - 1) {
      this.index += 1;
    }
  }
}

function evaluateAst(node: AstNode, variables: ExpressionVariables): number {
  switch (node.type) {
    case "number":
      return node.value;
    case "identifier": {
      const value = variables[node.name];
      if (!Number.isFinite(value)) {
        throw new Error(`Unknown variable "${node.name}"`);
      }
      return value;
    }
    case "unary": {
      const value = evaluateAst(node.expr, variables);
      return node.op === "-" ? -value : value;
    }
    case "binary": {
      const left = evaluateAst(node.left, variables);
      const right = evaluateAst(node.right, variables);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return right === 0 ? NaN : left / right;
        case "<":
          return left < right ? 1 : 0;
        case ">":
          return left > right ? 1 : 0;
        case "<=":
          return left <= right ? 1 : 0;
        case ">=":
          return left >= right ? 1 : 0;
        case "==":
          return left === right ? 1 : 0;
        case "!=":
          return left !== right ? 1 : 0;
      }
      break;
    }
    case "ternary": {
      const condition = evaluateAst(node.condition, variables);
      return evaluateAst(
        condition !== 0 ? node.whenTrue : node.whenFalse,
        variables,
      );
    }
  }
}

export type CompiledExpression = (variables: ExpressionVariables) => number;

export function compileSafeExpression(source: string): CompiledExpression | null {
  const expression = source.trim();
  if (!expression) return null;

  try {
    const parser = new Parser(tokenize(expression));
    const ast = parser.parseExpression();
    return (variables: ExpressionVariables): number => {
      const value = evaluateAst(ast, variables);
      return Number.isFinite(value) ? value : NaN;
    };
  } catch {
    return null;
  }
}

