/**
 * A small in-memory stand-in for the Supabase query builder, for tests that
 * need a send path to read and write real rows rather than a canned reply —
 * a consent check is only as good as the rows it finds.
 *
 * Supports the subset the send paths use: select / insert / upsert / update /
 * delete, eq / neq / in / is / not(is) / gt / gte / lt / lte / ilike, order,
 * limit, single / maybeSingle, and `{ count: "exact", head: true }`.
 */
type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export interface FakeDb {
  db: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  tables: Map<string, Row[]>;
  rows: (table: string) => Row[];
  /** Every write, in order: which table, which operation, what payload. */
  writes: Array<{ table: string; op: string; payload: unknown }>;
}

let seq = 0;

export function fakeSupabase(seed: Record<string, Row[]> = {}): FakeDb {
  const tables = new Map<string, Row[]>(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const writes: FakeDb["writes"] = [];
  const rows = (table: string) => {
    if (!tables.has(table)) tables.set(table, []);
    return tables.get(table)!;
  };

  function from(table: string) {
    let op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    let payload: unknown = null;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    const filters: Filter[] = [];
    let limitN: number | null = null;
    let orderBy: { col: string; asc: boolean } | null = null;
    let single: "single" | "maybe" | null = null;
    let head = false;
    let wantCount = false;

    const run = () => {
      const all = rows(table);
      const match = (r: Row) => filters.every((f) => f(r));

      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const inserted = list.map((p) => ({ id: `${table}-${++seq}`, ...p }));
        all.push(...inserted);
        writes.push({ table, op, payload });
        return shape(inserted);
      }
      if (op === "upsert") {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const keys = (upsertOpts.onConflict ?? "id").split(",").map((s) => s.trim());
        const out: Row[] = [];
        for (const p of list) {
          const existing = all.find((r) => keys.every((k) => r[k] === p[k]));
          if (existing) {
            if (!upsertOpts.ignoreDuplicates) Object.assign(existing, p);
            out.push(existing);
          } else {
            const created = { id: `${table}-${++seq}`, ...p };
            all.push(created);
            out.push(created);
          }
        }
        writes.push({ table, op, payload });
        return shape(out);
      }
      if (op === "update") {
        const hit = all.filter(match);
        for (const r of hit) Object.assign(r, payload as Row);
        writes.push({ table, op, payload });
        return shape(hit);
      }
      if (op === "delete") {
        const keep = all.filter((r) => !match(r));
        const gone = all.filter(match);
        tables.set(table, keep);
        writes.push({ table, op, payload: gone });
        return shape(gone);
      }

      let hit = all.filter(match);
      if (orderBy) {
        const { col, asc } = orderBy;
        hit = [...hit].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      const count = hit.length;
      if (limitN != null) hit = hit.slice(0, limitN);
      if (head) return { data: null, error: null, count };
      return { ...shape(hit), ...(wantCount ? { count } : {}) };
    };

    const shape = (list: Row[]) => {
      if (single === "single") {
        return list.length === 1
          ? { data: list[0], error: null }
          : { data: null, error: { message: "not exactly one row", code: "PGRST116" } };
      }
      if (single === "maybe") return { data: list[0] ?? null, error: null };
      return { data: list, error: null };
    };

    const b: Record<string, unknown> = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) {
        if (o?.head) head = true;
        if (o?.count) wantCount = true;
        return b;
      },
      insert(p: unknown) { op = "insert"; payload = p; return b; },
      upsert(p: unknown, o?: typeof upsertOpts) { op = "upsert"; payload = p; upsertOpts = o ?? {}; return b; },
      update(p: unknown) { op = "update"; payload = p; return b; },
      delete() { op = "delete"; return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      neq(c: string, v: unknown) { filters.push((r) => r[c] !== v); return b; },
      in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return b; },
      is(c: string, v: unknown) { filters.push((r) => (r[c] ?? null) === v); return b; },
      not(c: string, o: string, v: unknown) {
        if (o === "is") filters.push((r) => (r[c] ?? null) !== v);
        return b;
      },
      gt(c: string, v: string) { filters.push((r) => String(r[c]) > v); return b; },
      gte(c: string, v: string) { filters.push((r) => String(r[c]) >= v); return b; },
      lt(c: string, v: string) { filters.push((r) => String(r[c]) < v); return b; },
      lte(c: string, v: string) { filters.push((r) => String(r[c]) <= v); return b; },
      ilike(c: string, v: string) {
        filters.push((r) => String(r[c] ?? "").toLowerCase() === v.toLowerCase());
        return b;
      },
      order(col: string, o?: { ascending?: boolean }) { orderBy = { col, asc: o?.ascending !== false }; return b; },
      limit(n: number) { limitN = n; return b; },
      single() { single = "single"; return b; },
      maybeSingle() { single = "maybe"; return b; },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve().then(run).then(res, rej);
      },
    };
    return b;
  }

  return { db: { from }, tables, rows, writes };
}
