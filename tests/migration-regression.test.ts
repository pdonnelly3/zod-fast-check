/**
 * Regression tests to protect migration from zod3 to zod4
 * These tests verify that critical code paths continue to work after migration
 */

import fc from "fast-check";
import * as z from "zod";
import { ZodFastCheck } from "./zod-fast-check-module-proxy";

describe("Migration Regression Tests", () => {
  describe("Critical _def property access patterns", () => {
    it("should handle typeName access for all schema types", () => {
      const schemas = [
        z.string(),
        z.number(),
        z.array(z.string()),
        z.object({}),
        z.union([z.string(), z.number()]),
      ];

      const zfc = ZodFastCheck();
      for (const schema of schemas) {
        expect(() => zfc.inputOf(schema)).not.toThrow();
      }
    });

    it("should handle checks array iteration for string validations", () => {
      const schema = z.string().min(5).max(10).email();
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(typeof value).toBe("string");
          expect(value.length).toBeGreaterThanOrEqual(5);
          expect(value.length).toBeLessThanOrEqual(10);
          expect(value).toMatch(/@/); // email check
        })
      );
    });

    it("should handle checks array iteration for number validations", () => {
      const schema = z.number().min(5).max(10).int().multipleOf(2);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(typeof value).toBe("number");
          expect(value).toBeGreaterThanOrEqual(5);
          expect(value).toBeLessThanOrEqual(10);
          expect(Number.isInteger(value)).toBe(true);
          expect(value % 2).toBe(0);
        })
      );
    });

    it("should handle shape() method call for objects", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        nested: z.object({ value: z.boolean() }),
      });
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(value.name).toBeDefined();
          expect(value.age).toBeDefined();
          expect(value.nested).toBeDefined();
          expect(value.nested.value).toBeDefined();
        })
      );
    });

    it("should handle options array for unions", () => {
      const schema = z.union([z.string(), z.number(), z.boolean()]);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(
            typeof value === "string" ||
              typeof value === "number" ||
              typeof value === "boolean"
          ).toBe(true);
        })
      );
    });

    it("should handle optionsMap/options for discriminated unions", () => {
      const schema = z.discriminatedUnion("type", [
        z.object({ type: z.literal("a"), a: z.string() }),
        z.object({ type: z.literal("b"), b: z.number() }),
      ]);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(value.type).toBeDefined();
          expect(value.type === "a" || value.type === "b").toBe(true);
          if (value.type === "a") {
            expect(value.a).toBeDefined();
          } else {
            expect(value.b).toBeDefined();
          }
        })
      );
    });

    it("should handle minLength/maxLength for arrays", () => {
      const schema = z.array(z.number()).min(2).max(5);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(Array.isArray(value)).toBe(true);
          expect(value.length).toBeGreaterThanOrEqual(2);
          expect(value.length).toBeLessThanOrEqual(5);
        })
      );
    });

    it("should handle minSize/maxSize for sets", () => {
      const schema = z.set(z.number()).min(2).max(5);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(value instanceof Set).toBe(true);
          expect(value.size).toBeGreaterThanOrEqual(2);
          expect(value.size).toBeLessThanOrEqual(5);
        })
      );
    });
  });

  describe("Version-specific code paths", () => {
    it("should handle ZodNonEmptyArray constructor name check gracefully", () => {
      // This test verifies the hack at lines 122-131 still works or is removed
      const schema = z.array(z.number()).nonempty();
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(Array.isArray(value)).toBe(true);
          expect(value.length).toBeGreaterThan(0);
        })
      );
    });

    it("should handle discriminated union optionsMap fallback", () => {
      // This test verifies the fallback at line 546 works
      const schema = z.discriminatedUnion("type", [
        z.object({ type: z.literal("a") }),
        z.object({ type: z.literal("b") }),
      ]);
      const zfc = ZodFastCheck();
      expect(() => zfc.inputOf(schema)).not.toThrow();
    });
  });

  describe("Check structure compatibility", () => {
    it("should handle string check.value access", () => {
      const schema = z.string().min(5).max(10).length(7);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(value.length).toBe(7);
        })
      );
    });

    it("should handle number check.value and check.inclusive access", () => {
      const schema = z.number().min(5).max(10);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(value).toBeGreaterThanOrEqual(5);
          expect(value).toBeLessThanOrEqual(10);
        })
      );
    });

    it("should handle bigint check.value and check.inclusive access", () => {
      const schema = z.bigint().gte(BigInt(5)).lt(BigInt(10));
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(value).toBeGreaterThanOrEqual(BigInt(5));
          expect(value).toBeLessThan(BigInt(10));
        })
      );
    });
  });

  describe("Constraint property access patterns", () => {
    it("should handle array minLength.value access pattern", () => {
      const schema = z.array(z.string()).min(3);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(value.length).toBeGreaterThanOrEqual(3);
        })
      );
    });

    it("should handle array maxLength.value access pattern", () => {
      const schema = z.array(z.string()).max(5);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(value.length).toBeLessThanOrEqual(5);
        })
      );
    });

    it("should handle set minSize.value access pattern", () => {
      const schema = z.set(z.number()).min(2);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(value.size).toBeGreaterThanOrEqual(2);
        })
      );
    });

    it("should handle set maxSize.value access pattern", () => {
      const schema = z.set(z.number()).max(4);
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(value.size).toBeLessThanOrEqual(4);
        })
      );
    });
  });

  describe("Nested property access", () => {
    it("should handle deeply nested _def access", () => {
      const schema = z.object({
        items: z.array(
          z.object({
            tags: z.set(z.string().min(3)),
            metadata: z.record(z.string(), z.number().min(0)),
          })
        ),
      });
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(Array.isArray(value.items)).toBe(true);
          for (const item of value.items) {
            expect(item.tags instanceof Set).toBe(true);
            expect(typeof item.metadata).toBe("object");
          }
        })
      );
    });
  });

  describe("Type system compatibility", () => {
    it("should maintain type safety with input/output utilities", () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const zfc = ZodFastCheck();

      // These should compile without type errors
      const inputArb = zfc.inputOf(schema);
      const outputArb = zfc.outputOf(schema);

      expect(inputArb).toBeDefined();
      expect(outputArb).toBeDefined();
    });

    it("should work with ZodFirstPartyTypeKind type", () => {
      const zfc = ZodFastCheck();
      // This test verifies the type system still works
      expect(() => zfc.inputOf(z.string())).not.toThrow();
      expect(() => zfc.inputOf(z.number())).not.toThrow();
    });
  });

  describe("Edge cases that might break", () => {
    it("should handle empty checks array", () => {
      const schema = z.string(); // No validations
      const zfc = ZodFastCheck();
      expect(() => zfc.inputOf(schema)).not.toThrow();
    });

    it("should handle undefined minLength/maxLength", () => {
      const schema = z.array(z.string()); // No constraints
      const zfc = ZodFastCheck();
      expect(() => zfc.inputOf(schema)).not.toThrow();
    });

    it("should handle undefined minSize/maxSize", () => {
      const schema = z.set(z.string()); // No constraints
      const zfc = ZodFastCheck();
      expect(() => zfc.inputOf(schema)).not.toThrow();
    });

    it("should handle empty shape objects", () => {
      const schema = z.object({});
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(typeof value).toBe("object");
          expect(Object.keys(value).length).toBe(0);
        })
      );
    });
  });
});

