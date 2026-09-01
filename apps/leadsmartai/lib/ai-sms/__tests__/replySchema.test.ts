import { describe, it, expect } from "vitest";
import { replyJsonSchema } from "../replySchema";

type Node = {
  type?: unknown;
  properties?: Record<string, Node>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Node;
};

/** Every object in the schema, including nested ones. */
function objects(node: Node, path = "root"): Array<[string, Node]> {
  const out: Array<[string, Node]> = [];
  const isObject = node?.type === "object" || !!node?.properties;
  if (isObject) out.push([path, node]);
  for (const [k, v] of Object.entries(node?.properties ?? {})) {
    out.push(...objects(v, `${path}.${k}`));
  }
  if (node?.items) out.push(...objects(node.items, `${path}[]`));
  return out;
}

/**
 * OpenAI strict structured output rejects the whole request — HTTP 400 — unless
 * every object lists ALL of its properties in `required` and sets
 * additionalProperties: false. Nested objects included.
 *
 * `extractedData` had `required: []`, so every AI SMS reply 400'd and fell
 * through to the fallback script. Nothing caught it because the failure was
 * swallowed and the fallback looked like a real reply.
 */
describe("SMS assistant reply schema (OpenAI strict mode)", () => {
  const all = objects(replyJsonSchema as unknown as Node);

  it("finds the nested object, not just the root", () => {
    expect(all.map(([p]) => p)).toContain("root.extractedData");
  });

  it("requires every property of every object", () => {
    for (const [path, node] of all) {
      const props = Object.keys(node.properties ?? {});
      const required = node.required ?? [];
      expect(props.length, `${path} has no properties`).toBeGreaterThan(0);
      expect([...required].sort(), `${path}: required must list every property`).toEqual(
        [...props].sort(),
      );
    }
  });

  it("forbids additional properties on every object", () => {
    for (const [path, node] of all) {
      expect(node.additionalProperties, `${path}`).toBe(false);
    }
  });

  it("expresses optional fields as nullable, since strict mode has no optional", () => {
    const extracted = (replyJsonSchema as unknown as Node).properties?.extractedData;
    for (const [name, field] of Object.entries(extracted?.properties ?? {})) {
      expect(Array.isArray(field.type), `extractedData.${name} should be a union`).toBe(true);
      expect(field.type as string[], `extractedData.${name} must allow null`).toContain("null");
    }
  });
});
