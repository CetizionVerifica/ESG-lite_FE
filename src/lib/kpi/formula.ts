/**
 * KPI-6 · Calculated KPIs, the FE preview (mirror of ESG-lite
 * `src/kpi/formulas/parse.ts` + `evaluate.ts`). A small, safe grammar over
 * KPI codes, never `eval`:
 *
 *   expr   := term (("+" | "-") term)*
 *   term   := factor (("*" | "/" | "×" | "÷") factor)*
 *   factor := number | CODE | CODE "." key | ("sum" | "avg") "(" CODE ")" | "(" expr ")" | "-" factor
 *
 * A missing input gives no value with `missing: [codes]`, never a 0; a
 * division by zero gives no value with a reason. The server calculates the
 * stored figure; this only previews it and explains how it's made
 * ("Water consumed = water withdrawn 1,200 m³ − water discharged 840 m³ = 360 m³").
 */
import { formatNumber } from "../../ui/format";
import { formatWithUnit } from "./units";

export type FormulaNode =
  | { kind: "num"; value: number }
  | { kind: "ref"; code: string; key: string | null }
  | { kind: "agg"; fn: "sum" | "avg"; code: string }
  | { kind: "neg"; arg: FormulaNode }
  | { kind: "group"; arg: FormulaNode }
  | { kind: "bin"; op: "+" | "-" | "*" | "/"; left: FormulaNode; right: FormulaNode };

export type ParseResult = { ok: true; ast: FormulaNode } | { ok: false; message: string; position: number };

type Token = { t: "num"; v: number; at: number } | { t: "id"; v: string; at: number } | { t: "op"; v: string; at: number };

const OP_ALIAS: Record<string, string> = { "×": "*", "÷": "/", "−": "-" };

function tokenize(src: string): Token[] | { message: string; position: number } {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) return { message: "A number is malformed.", position: i };
      out.push({ t: "num", v: Number(m[0]), at: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)) as RegExpExecArray;
      out.push({ t: "id", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    if ("+-*/()×÷−.".includes(c)) {
      out.push({ t: "op", v: OP_ALIAS[c] ?? c, at: i });
      i += 1;
      continue;
    }
    return { message: `"${c}" can't be used in a formula.`, position: i };
  }
  return out;
}

class ParseError extends Error {
  constructor(
    message: string,
    public position: number,
  ) {
    super(message);
  }
}

/** Parses a formula; an error carries the character position. */
export function parseFormula(src: string): ParseResult {
  const tokens = tokenize(src ?? "");
  if (!Array.isArray(tokens)) return { ok: false, ...tokens };
  let pos = 0;
  const peek = () => tokens[pos];
  const end = src.length;
  const isOp = (v: string) => peek()?.t === "op" && peek()?.v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ParseError(`Expected "${v}".`, peek()?.at ?? end);
    pos += 1;
  };

  const factor = (): FormulaNode => {
    const tok = peek();
    if (!tok) throw new ParseError("The formula ends too early.", end);
    if (tok.t === "num") {
      pos += 1;
      return { kind: "num", value: tok.v };
    }
    if (tok.t === "op" && tok.v === "-") {
      pos += 1;
      return { kind: "neg", arg: factor() };
    }
    if (tok.t === "op" && tok.v === "(") {
      pos += 1;
      const arg = expr();
      expect(")");
      return { kind: "group", arg };
    }
    if (tok.t === "id") {
      pos += 1;
      const lower = tok.v.toLowerCase();
      if ((lower === "sum" || lower === "avg") && isOp("(")) {
        pos += 1;
        const code = peek();
        if (code?.t !== "id") throw new ParseError("sum() and avg() take one KPI code.", code?.at ?? end);
        pos += 1;
        expect(")");
        return { kind: "agg", fn: lower, code: code.v };
      }
      if (!/^[A-Z][A-Z0-9_]*$/.test(tok.v)) throw new ParseError(`"${tok.v}" isn't a KPI code.`, tok.at);
      if (isOp(".")) {
        pos += 1;
        const key = peek();
        if (key?.t !== "id") throw new ParseError("Name the part after the dot.", key?.at ?? end);
        pos += 1;
        return { kind: "ref", code: tok.v, key: key.v };
      }
      return { kind: "ref", code: tok.v, key: null };
    }
    throw new ParseError(`Unexpected "${tok.v}".`, tok.at);
  };
  const term = (): FormulaNode => {
    let left = factor();
    while (isOp("*") || isOp("/")) {
      const op = peek().v as "*" | "/";
      pos += 1;
      left = { kind: "bin", op, left, right: factor() };
    }
    return left;
  };
  const expr = (): FormulaNode => {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = peek().v as "+" | "-";
      pos += 1;
      left = { kind: "bin", op, left, right: term() };
    }
    return left;
  };

  try {
    if (!tokens.length) return { ok: false, message: "The formula is empty.", position: 0 };
    const ast = expr();
    if (pos < tokens.length) throw new ParseError(`Unexpected "${tokens[pos].v}".`, tokens[pos].at);
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, message: e.message, position: e.position };
    throw e;
  }
}

/** The KPI codes a formula reads, in order of first use. */
export function formulaCodes(src: string): string[] {
  const parsed = parseFormula(src);
  if (!parsed.ok) return [];
  const codes: string[] = [];
  const walk = (n: FormulaNode) => {
    if (n.kind === "ref" || n.kind === "agg") {
      if (!codes.includes(n.code)) codes.push(n.code);
    } else if (n.kind === "neg" || n.kind === "group") walk(n.arg);
    else if (n.kind === "bin") {
      walk(n.left);
      walk(n.right);
    }
  };
  walk(parsed.ast);
  return codes;
}

/** One input of a preview: the value of a KPI (or its site values for sum/avg). */
export interface FormulaInput {
  value: number | null;
  unit?: string | null;
  /** Shown in the explanation, e.g. "water withdrawn". */
  label?: string;
  breakdown?: Record<string, number> | null;
  /** Site values, for `sum(CODE)` / `avg(CODE)`. Without them `value` is used. */
  sites?: (number | null)[];
}

/** A calculated item's inputs (KPI-7 `inputs`) keyed by code, labelled in plain words. */
export function inputsByCode(inputs: { code: string; name: string; value: number | null; unit: string | null; breakdown?: Record<string, number> | null }[]): Record<string, FormulaInput> {
  return Object.fromEntries(inputs.map((i) => [i.code, { value: i.value, unit: i.unit, label: i.name.toLowerCase(), breakdown: i.breakdown ?? null }]));
}

export type FormulaResult =
  | { ok: true; value: number }
  | { ok: false; reason: "missing"; missing: string[] }
  | { ok: false; reason: "divide_by_zero" }
  | { ok: false; reason: "invalid"; message: string; position: number };

class DivZero extends Error {}

/** Evaluates a formula against inputs keyed by KPI code. */
export function evaluateFormula(src: string, inputs: Record<string, FormulaInput | undefined>): FormulaResult {
  const parsed = parseFormula(src);
  if (!parsed.ok) return { ok: false, reason: "invalid", message: parsed.message, position: parsed.position };
  const missing = new Set<string>();
  const read = (code: string, key: string | null): number => {
    const input = inputs[code];
    const v = key ? (input?.breakdown?.[key] ?? null) : (input?.value ?? null);
    if (v === null || v === undefined || !Number.isFinite(v)) {
      missing.add(key ? `${code}.${key}` : code);
      return Number.NaN;
    }
    return v;
  };
  const calc = (n: FormulaNode): number => {
    switch (n.kind) {
      case "num":
        return n.value;
      case "ref":
        return read(n.code, n.key);
      case "agg": {
        const sites = inputs[n.code]?.sites?.filter((x): x is number => x !== null && Number.isFinite(x));
        if (!sites || !sites.length) return read(n.code, null);
        const total = sites.reduce((s, x) => s + x, 0);
        return n.fn === "sum" ? total : total / sites.length;
      }
      case "neg":
        return -calc(n.arg);
      case "group":
        return calc(n.arg);
      case "bin": {
        const a = calc(n.left);
        const b = calc(n.right);
        if (n.op === "+") return a + b;
        if (n.op === "-") return a - b;
        if (n.op === "*") return a * b;
        if (b === 0 && !Number.isNaN(a)) throw new DivZero();
        return a / b;
      }
    }
  };
  try {
    const value = calc(parsed.ast);
    if (missing.size) return { ok: false, reason: "missing", missing: [...missing] };
    if (!Number.isFinite(value)) return { ok: false, reason: "divide_by_zero" };
    return { ok: true, value: Number(value.toPrecision(12)) };
  } catch (e) {
    if (missing.size) return { ok: false, reason: "missing", missing: [...missing] };
    if (e instanceof DivZero) return { ok: false, reason: "divide_by_zero" };
    throw e;
  }
}

const OP_TEXT: Record<"+" | "-" | "*" | "/", string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

/**
 * "How it's calculated": the formula with every code replaced by its label
 * and value. With a result: "= 360 m³"; with missing inputs: "waiting for …".
 */
export function explainFormula(
  src: string,
  inputs: Record<string, FormulaInput | undefined>,
  opts: { name: string; unit?: string | null; decimals?: number; nameOf?: (code: string) => string },
): string {
  const parsed = parseFormula(src);
  if (!parsed.ok) return `${opts.name} can't be calculated: the formula isn't valid.`;
  const label = (code: string) => inputs[code]?.label ?? opts.nameOf?.(code) ?? code;
  const text = (n: FormulaNode): string => {
    switch (n.kind) {
      case "num":
        return formatNumber(n.value, n.value % 1 === 0 ? 0 : 2);
      case "ref": {
        const input = inputs[n.code];
        const v = n.key ? (input?.breakdown?.[n.key] ?? null) : (input?.value ?? null);
        const name = n.key ? `${label(n.code)} (${n.key.replace(/_/g, " ")})` : label(n.code);
        return v === null ? `${name} (missing)` : `${name} ${formatWithUnit(v, input?.unit ?? null)}`;
      }
      case "agg":
        return `${n.fn === "sum" ? "total" : "average"} ${label(n.code)}`;
      case "neg":
        return `−${text(n.arg)}`;
      case "group":
        return `(${text(n.arg)})`;
      case "bin":
        return `${text(n.left)} ${OP_TEXT[n.op]} ${text(n.right)}`;
    }
  };
  const result = evaluateFormula(src, inputs);
  const body = `${opts.name} = ${text(parsed.ast)}`;
  if (result.ok) return `${body} = ${formatWithUnit(result.value, opts.unit ?? null, opts.decimals)}`;
  if (result.reason === "missing") return `${body}. Waiting for ${result.missing.map((c) => label(c.split(".")[0])).join(", ")}.`;
  if (result.reason === "divide_by_zero") return `${body}. Can't be calculated: it would divide by zero.`;
  return body;
}
