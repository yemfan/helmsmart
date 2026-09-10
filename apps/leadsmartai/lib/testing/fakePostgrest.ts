/**
 * A stand-in for PostgREST for unit tests.
 *
 * Every table declares the columns it really has. Selecting a column a
 * table does not have answers `{ data: null, error: { code: "42703" } }`
 * WITHOUT throwing — the exact shape that let seventeen call sites select
 * `agents.first_name` for five months and read "agent not found".
 *
 *   const fake = createFakePostgrest({
 *     agents: { columns: ["id", "auth_user_id"], rows: [{ id: 1, auth_user_id: "u1" }] },
 *   });
 *   vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: fake.supabaseAdmin }));
 *
 * Supports .select(cols).eq().in().order().limit() then .maybeSingle(),
 * .single(), or a plain await for a list. `fake.selects` records every
 * (table, columns) pair so a test can assert nothing unknown was asked for.
 */
export type FakeTable = { columns: string[]; rows: Record<string, unknown>[] };

export type FakeResult<T> = { data: T; error: { code: string; message: string } | null };

export function createFakePostgrest(tables: Record<string, FakeTable>, opts?: {
  authUsers?: Record<string, { email: string | null }>;
}) {
  const selects: Array<{ table: string; columns: string }> = [];

  function query(table: string, columns: string) {
    selects.push({ table, columns });
    const t = tables[table];
    const asked = columns.split(",").map((c) => c.trim()).filter(Boolean);
    const missing = !t ? asked : asked.filter((c) => !t.columns.includes(c));
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];

    const rowsOut = (): FakeResult<Record<string, unknown>[] | null> => {
      if (missing.length) {
        return {
          data: null,
          error: { code: "42703", message: `column ${table}.${missing[0]} does not exist` },
        };
      }
      const rows = t.rows.filter((r) => filters.every((f) => f(r)));
      const pick = (r: Record<string, unknown>) =>
        Object.fromEntries(asked.map((c) => [c, r[c] ?? null]));
      return { data: rows.map(pick), error: null };
    };

    const builder = {
      eq(col: string, val: unknown) {
        filters.push((r) => String(r[col]) === String(val));
        return builder;
      },
      in(col: string, vals: unknown[]) {
        const set = new Set(vals.map(String));
        filters.push((r) => set.has(String(r[col])));
        return builder;
      },
      is(col: string, val: unknown) {
        filters.push((r) => (r[col] ?? null) === val);
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle(): Promise<FakeResult<Record<string, unknown> | null>> {
        const { data, error } = rowsOut();
        return Promise.resolve({ data: data?.[0] ?? null, error });
      },
      single(): Promise<FakeResult<Record<string, unknown> | null>> {
        const { data, error } = rowsOut();
        return Promise.resolve({ data: data?.[0] ?? null, error });
      },
      then<R>(
        onFulfilled: (v: FakeResult<Record<string, unknown>[] | null>) => R,
        onRejected?: (e: unknown) => R,
      ) {
        return Promise.resolve(rowsOut()).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  const supabaseAdmin = {
    from: (table: string) => ({ select: (columns: string) => query(table, columns) }),
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const u = opts?.authUsers?.[id];
          return u
            ? { data: { user: { id, email: u.email } }, error: null }
            : { data: { user: null }, error: { message: "not found" } };
        },
      },
    },
  };

  /** Columns asked of a table that the table does not have, as "table.column". */
  const unknownColumns = () =>
    selects.flatMap(({ table, columns }) =>
      columns
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c && !tables[table]?.columns.includes(c))
        .map((c) => `${table}.${c}`),
    );

  return { supabaseAdmin, selects, query, unknownColumns };
}
