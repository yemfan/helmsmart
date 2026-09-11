/**
 * A zod schema as the JSON Schema a tool definition carries.
 *
 * Only the shapes the AI team's inputs use — object, string (with min/max and
 * a pattern), number/int (with bounds), boolean, enum, optional — and it
 * throws on anything else, so a new shape is noticed at the first test run
 * rather than sent to the model as `{}`. A dependency (`zod-to-json-schema`)
 * would cover more, but this app does not declare one, and sixty lines of
 * pure code with a test is the cheaper price.
 */
import { z } from "zod";

export type JsonSchema = Record<string, unknown>;

function withDescription(schema: JsonSchema, t: z.ZodTypeAny): JsonSchema {
  return t.description ? { ...schema, description: t.description } : schema;
}

export function toJsonSchema(t: z.ZodTypeAny): JsonSchema {
  if (t instanceof z.ZodOptional || t instanceof z.ZodNullable) {
    // The model omits an optional field; the description rides on the inner type.
    const inner = toJsonSchema(t.unwrap());
    return t.description ? { ...inner, description: t.description } : inner;
  }
  if (t instanceof z.ZodDefault) {
    const inner = toJsonSchema(t._def.innerType);
    return withDescription({ ...inner, default: t._def.defaultValue() }, t);
  }
  if (t instanceof z.ZodObject) {
    const shape = t.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = toJsonSchema(value);
      if (!value.isOptional()) required.push(key);
    }
    return withDescription(
      { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false },
      t,
    );
  }
  if (t instanceof z.ZodString) {
    const out: JsonSchema = { type: "string" };
    for (const check of t._def.checks) {
      if (check.kind === "min") out.minLength = check.value;
      else if (check.kind === "max") out.maxLength = check.value;
      else if (check.kind === "uuid") out.format = "uuid";
      else if (check.kind === "regex") out.pattern = check.regex.source;
    }
    return withDescription(out, t);
  }
  if (t instanceof z.ZodNumber) {
    const out: JsonSchema = { type: t.isInt ? "integer" : "number" };
    for (const check of t._def.checks) {
      if (check.kind === "min") out.minimum = check.value;
      else if (check.kind === "max") out.maximum = check.value;
    }
    return withDescription(out, t);
  }
  if (t instanceof z.ZodBoolean) return withDescription({ type: "boolean" }, t);
  if (t instanceof z.ZodEnum) return withDescription({ type: "string", enum: [...t.options] }, t);
  throw new Error(`toJsonSchema: unsupported zod type ${t.constructor.name}`);
}
