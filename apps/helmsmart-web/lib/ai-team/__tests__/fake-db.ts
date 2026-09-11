/**
 * A small in-memory stand-in for the Supabase query builder — enough of it for
 * the AI team's actions and approvals: select / insert / update with eq, neq,
 * is, in, lt/lte/gt/gte, ilike, a PostgREST `or(...)` of ilikes, order, limit,
 * single / maybeSingle, head counts, and `select()` after a write returning
 * the rows it touched.
 *
 * Every chain resolves as one synchronous step when awaited, which is also
 * what makes a conditional update atomic here — the same property the real
 * `update … where status = 'proposed'` has in Postgres.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export interface FakeDb {
  from(table: string): Query;
  tables: Record<string, Row[]>;
  /** Every write, in order: [table, op, patch]. */
  writes: Array<[string, string, unknown]>;
  /** Make the next matching operation fail with this Postgres-ish message. */
  failNext(table: string, op: "select" | "insert" | "update", message: string): void;
}

const DEFAULTS: Record<string, () => Row> = {
  ai_approvals: () => ({
    status: "proposed",
    params: {},
    details: {},
    source: {},
    created_at: new Date().toISOString(),
    decided_at: null,
    decided_by: null,
    executed_at: null,
    result: null,
    error: null,
  }),
  tasks: () => ({ status: "open", priority: "normal", created_at: new Date().toISOString() }),
};

let seq = 0;
const nextId = () => {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
};

function likeToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number | null }> {
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | Row[] | null = null;
  private filters: Filter[] = [];
  private returning = false;
  private one: "single" | "maybe" | null = null;
  private head = false;
  private wantCount = false;
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;

  constructor(
    private db: FakeDb,
    private table: string,
    private failures: Map<string, string>,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.wantCount = !!opts?.count;
      this.head = !!opts?.head;
    } else this.returning = true;
    return this;
  }
  insert(p: Row | Row[]) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: Row) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => r[c] !== v);
    return this;
  }
  /** `is.null` / `is.true` — a missing column reads as null, as in Postgres. */
  is(c: string, v: null | boolean) {
    this.filters.push((r) => (r[c] ?? null) === v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  lt(c: string, v: string) {
    this.filters.push((r) => r[c] != null && String(r[c]) < v);
    return this;
  }
  lte(c: string, v: string) {
    this.filters.push((r) => r[c] != null && String(r[c]) <= v);
    return this;
  }
  gt(c: string, v: string) {
    this.filters.push((r) => r[c] != null && String(r[c]) > v);
    return this;
  }
  gte(c: string, v: string) {
    this.filters.push((r) => r[c] != null && String(r[c]) >= v);
    return this;
  }
  ilike(c: string, pattern: string) {
    const re = likeToRegex(pattern);
    this.filters.push((r) => re.test(String(r[c] ?? "")));
    return this;
  }
  /** `a.ilike.%x%,b.ilike.%x%` — any clause matches. */
  or(expr: string) {
    const clauses = expr.split(",").map((c) => {
      const [col, op, ...rest] = c.split(".");
      const value = rest.join(".");
      if (op !== "ilike") throw new Error(`fake-db: or(${op}) unsupported`);
      const re = likeToRegex(value);
      return (r: Row) => re.test(String(r[col] ?? ""));
    });
    this.filters.push((r) => clauses.some((f) => f(r)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }

  private run(): { data: unknown; error: { message: string } | null; count?: number | null } {
    const key = `${this.table}:${this.op}`;
    const failure = this.failures.get(key);
    if (failure) {
      this.failures.delete(key);
      return { data: null, error: { message: failure } };
    }
    const rows = (this.db.tables[this.table] ??= []);
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[];
    if (this.op === "insert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      out = items.map((p) => ({ id: nextId(), ...(DEFAULTS[this.table]?.() ?? {}), ...p }));
      rows.push(...out);
      this.db.writes.push([this.table, "insert", this.payload]);
      if (!this.returning) return { data: null, error: null };
    } else if (this.op === "update") {
      out = rows.filter(match);
      for (const r of out) Object.assign(r, this.payload);
      this.db.writes.push([this.table, "update", this.payload]);
      if (!this.returning) return { data: null, error: null };
    } else {
      out = rows.filter(match);
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        out = [...out].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? (asc ? -1 : 1) : asc ? 1 : -1));
      }
      if (this.max !== null) out = out.slice(0, this.max);
      if (this.head) return { data: null, error: null, count: out.length };
    }
    const copies = out.map((r) => structuredClone(r));
    if (this.one === "single") {
      return copies.length === 1 ? { data: copies[0], error: null } : { data: null, error: { message: "not exactly one row" } };
    }
    if (this.one === "maybe") return { data: copies[0] ?? null, error: null };
    return { data: copies, error: null, ...(this.wantCount ? { count: copies.length } : {}) };
  }

  then<A = unknown, B = never>(
    resolve?: ((v: { data: unknown; error: { message: string } | null; count?: number | null }) => A | PromiseLike<A>) | null,
    reject?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(resolve, reject);
  }
}

export function fakeDb(seed: Record<string, Row[]> = {}): FakeDb {
  const failures = new Map<string, string>();
  const db: FakeDb = {
    tables: structuredClone(seed),
    writes: [],
    from: (table: string) => new Query(db, table, failures),
    failNext: (table, op, message) => failures.set(`${table}:${op}`, message),
  };
  return db;
}
