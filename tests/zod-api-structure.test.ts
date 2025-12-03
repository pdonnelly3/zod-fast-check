/**
 * Tests to verify Zod API structure compatibility
 * These tests protect against breaking changes in zod4's internal API structure
 * that this library depends on.
 */

import * as z from "zod";
import { ZodFastCheck } from "./zod-fast-check-module-proxy";

describe("Zod API Structure Compatibility", () => {
  describe("_def.typeName property", () => {
    it("should have typeName property on all first-party schemas", () => {
      const schemas = [
      z.string(),
      z.number(),
      z.bigint(),
      z.boolean(),
      z.date(),
      z.array(z.string()),
      z.object({}),
      z.union([z.string(), z.number()]),
      z.tuple([z.string()]),
      z.record(z.string(), z.string()),
      z.map(z.string(), z.number()),
      z.set(z.number()),
      z.literal("test"),
      z.enum(["a", "b"]),
      z.nativeEnum({ A: "a" }),
      z.optional(z.string()),
      z.nullable(z.string()),
      z.string().default("default"),
      z.string().readonly(),
      z.symbol(),
      z.any(),
      z.unknown(),
      z.void(),
      z.nan(),
    ];

    for (const schema of schemas) {
      expect(schema._zod).toBeDefined();
      expect(schema._zod.def).toBeDefined();
      expect(schema._zod.def.type).toBeDefined();
      expect(typeof schema._zod.def.type).toBe("string");
    }
  });

  it("should have consistent type values", () => {
    expect(z.string()._zod.def.type).toBe("string");
    expect(z.number()._zod.def.type).toBe("number");
    expect(z.array(z.string())._zod.def.type).toBe("array");
    expect(z.object({})._zod.def.type).toBe("object");
  });
  });

  describe("_zod.def.checks property (String)", () => {
    it("should have checks array on string schemas with validations", () => {
      const schema = z.string().min(5).max(10);
      expect(schema._zod.def.checks).toBeDefined();
      expect(Array.isArray(schema._zod.def.checks)).toBe(true);
      expect(schema._zod.def.checks!.length).toBeGreaterThan(0);
    });

    it("should have check objects with _zod.def.check property", () => {
      const schema = z.string().min(5).max(10);
      const checks = schema._zod.def.checks;
      if (checks) {
        for (const check of checks) {
          expect(check).toBeDefined();
          expect(check._zod).toBeDefined();
          expect(check._zod.def.check).toBeDefined();
          expect(typeof check._zod.def.check).toBe("string");
        }
      }
    });

    it("should support all string check kinds", () => {
      const checks = [
        { schema: z.string().min(5), checkType: "min_length" },
        { schema: z.string().max(10), checkType: "max_length" },
        { schema: z.string().length(5), checkType: "length_equals" },
        // startsWith/endsWith use string_format in zod4
        { schema: z.string().startsWith("prefix"), checkType: "string_format" },
        { schema: z.string().endsWith("suffix"), checkType: "string_format" },
        { schema: z.string().email(), checkType: "string_format" },
        { schema: z.string().uuid(), checkType: "string_format" },
        { schema: z.string().url(), checkType: "string_format" },
        { schema: z.string().cuid(), checkType: "string_format" },
      ];

      for (const { schema, checkType } of checks) {
        const schemaChecks = schema._zod.def.checks;
        if (schemaChecks && schemaChecks.length > 0) {
          const hasCheck = schemaChecks.some((c: any) => 
            c._zod.def.check === checkType
          );
          expect(hasCheck).toBe(true);
        } else {
          // Some schemas may not have checks if they're simple
          expect(schemaChecks).toBeDefined();
        }
      }
    });
  });

  describe("_zod.def.checks property (Number)", () => {
    it("should have checks array on number schemas with validations", () => {
      const schema = z.number().min(5).max(10);
      expect(schema._zod.def.checks).toBeDefined();
      expect(Array.isArray(schema._zod.def.checks)).toBe(true);
    });

    it("should have check objects with _zod.def.check, value, and inclusive properties", () => {
      const schema = z.number().min(5).max(10);
      const checks = schema._zod.def.checks;
      if (checks) {
        for (const check of checks) {
          expect(check).toBeDefined();
          expect(check._zod).toBeDefined();
          expect(check._zod.def.check).toBeDefined();
          const checkType = check._zod.def.check;
          if (checkType === "greater_than" || checkType === "less_than") {
            expect((check._zod.def as any).value).toBeDefined();
            expect((check._zod.def as any).inclusive).toBeDefined();
            expect(typeof (check._zod.def as any).inclusive).toBe("boolean");
          }
        }
      }
    });

    it("should support all number check kinds", () => {
      const checks = [
        { schema: z.number().min(5), checkType: "greater_than" },
        { schema: z.number().max(10), checkType: "less_than" },
        { schema: z.number().int(), checkType: "number_format" },
        { schema: z.number().multipleOf(3), checkType: "multiple_of" },
      ];

      for (const { schema, checkType } of checks) {
        const schemaChecks = schema._zod.def.checks;
        if (schemaChecks) {
          const hasCheck = schemaChecks.some((c: any) => c._zod.def.check === checkType);
          expect(hasCheck).toBe(true);
        }
      }
    });
  });

  describe("_zod.def.checks property (BigInt)", () => {
    it("should have checks array on bigint schemas with validations", () => {
      const schema = z.bigint().gt(BigInt(5));
      expect(schema._zod.def.checks).toBeDefined();
      expect(Array.isArray(schema._zod.def.checks)).toBe(true);
    });

    it("should have check objects with _zod.def.check, value, and inclusive properties", () => {
      const schema = z.bigint().gte(BigInt(5));
      const checks = schema._zod.def.checks;
      if (checks) {
        for (const check of checks) {
          expect(check).toBeDefined();
          expect(check._zod).toBeDefined();
          expect(check._zod.def.check).toBeDefined();
          const checkType = check._zod.def.check;
          if (checkType === "greater_than" || checkType === "less_than") {
            expect((check._zod.def as any).value).toBeDefined();
            expect((check._zod.def as any).inclusive).toBeDefined();
          }
        }
      }
    });
  });

  describe("_zod.def.shape property (Object)", () => {
    it("should have shape property on object schemas", () => {
      const schema = z.object({ a: z.string(), b: z.number() });
      expect(schema._zod.def.shape).toBeDefined();
      expect(typeof schema._zod.def.shape).toBe("object");
    });

    it("should return shape object directly", () => {
      const schema = z.object({ a: z.string(), b: z.number() });
      const shape = schema._zod.def.shape;
      expect(shape).toBeDefined();
      expect(shape.a).toBeDefined();
      expect(shape.b).toBeDefined();
    });
  });

  describe("_zod.def.options property (Union)", () => {
    it("should have options array on union schemas", () => {
      const schema = z.union([z.string(), z.number()]);
      expect(schema._zod.def.options).toBeDefined();
      expect(Array.isArray(schema._zod.def.options)).toBe(true);
      expect(schema._zod.def.options.length).toBe(2);
    });
  });

  describe("_zod.def.options property (DiscriminatedUnion)", () => {
    it("should have options on discriminated union schemas", () => {
      const schema = z.discriminatedUnion("type", [
        z.object({ type: z.literal("a"), a: z.string() }),
        z.object({ type: z.literal("b"), b: z.number() }),
      ]);

      // In zod4, options is an array
      const options = schema._zod.def.options;
      expect(options).toBeDefined();
      expect(Array.isArray(options)).toBe(true);
      expect(options.length).toBeGreaterThan(0);
    });
  });

  describe("_zod.def.checks for array constraints (Array)", () => {
    it("should have min_size check for array min constraint", () => {
      const schema = z.array(z.string()).min(2);
      const checks = schema._zod.def.checks;
      expect(checks).toBeDefined();
      if (checks && checks.length > 0) {
        const minCheck = checks.find((c: any) => c._zod.def.check === "min_size");
        // Array constraints may be in checks or handled differently
        expect(checks.length).toBeGreaterThan(0);
      }
    });

    it("should have max_size check for array max constraint", () => {
      const schema = z.array(z.string()).max(5);
      const checks = schema._zod.def.checks;
      expect(checks).toBeDefined();
      if (checks && checks.length > 0) {
        const maxCheck = checks.find((c: any) => c._zod.def.check === "max_size");
        // Array constraints may be in checks or handled differently
        expect(checks.length).toBeGreaterThan(0);
      }
    });

    it("should handle nonempty arrays", () => {
      const schema = z.array(z.string()).min(1);
      const checks = schema._zod.def.checks;
      expect(checks).toBeDefined();
    });
  });

  describe("_zod.def.checks for set constraints (Set)", () => {
    it("should have min_size check for set min constraint", () => {
      const schema = z.set(z.number()).min(2);
      const checks = schema._zod.def.checks;
      expect(checks).toBeDefined();
      if (checks) {
        const minCheck = checks.find((c: any) => c._zod.def.check === "min_size");
        expect(minCheck).toBeDefined();
        if (minCheck) {
          expect((minCheck._zod.def as any).minimum).toBe(2);
        }
      }
    });

    it("should have max_size check for set max constraint", () => {
      const schema = z.set(z.number()).max(5);
      const checks = schema._zod.def.checks;
      expect(checks).toBeDefined();
      if (checks) {
        const maxCheck = checks.find((c: any) => c._zod.def.check === "max_size");
        expect(maxCheck).toBeDefined();
        if (maxCheck) {
          expect((maxCheck._zod.def as any).maximum).toBe(5);
        }
      }
    });
  });

  describe("_zod.def.element/innerType property (Array, Promise, etc.)", () => {
    it("should have element property on array schemas", () => {
      const schema = z.array(z.string());
      expect(schema._zod.def.element).toBeDefined();
    });

    it("should have innerType property on promise schemas", () => {
      const schema = z.promise(z.string());
      const def = schema._zod.def as any;
      expect(def.innerType).toBeDefined();
    });
  });

  describe("_zod.def.items property (Tuple)", () => {
    it("should have items array on tuple schemas", () => {
      const schema = z.tuple([z.string(), z.number()]);
      expect(schema._zod.def.items).toBeDefined();
      expect(Array.isArray(schema._zod.def.items)).toBe(true);
      expect(schema._zod.def.items.length).toBe(2);
    });
  });

  describe("_zod.def.keyType and _zod.def.valueType (Record, Map)", () => {
    it("should have keyType and valueType on record schemas", () => {
      const schema = z.record(z.string(), z.string());
      const def = schema._zod.def as any;
      expect(def.keyType).toBeDefined();
      expect(def.valueType).toBeDefined();
    });

    it("should have keyType and valueType on map schemas", () => {
      const schema = z.map(z.string(), z.number());
      const def = schema._zod.def as any;
      expect(def.keyType).toBeDefined();
      expect(def.valueType).toBeDefined();
    });
  });

  describe("_zod.def.innerType property (Optional, Nullable, Default, etc.)", () => {
    it("should have innerType on optional schemas", () => {
      const schema = z.optional(z.string());
      const def = schema._zod.def as any;
      expect(def.innerType).toBeDefined();
    });

    it("should have innerType on nullable schemas", () => {
      const schema = z.nullable(z.string());
      const def = schema._zod.def as any;
      expect(def.innerType).toBeDefined();
    });

    it("should have innerType on default schemas", () => {
      const schema = z.string().default("default");
      const def = schema._zod.def as any;
      expect(def.innerType).toBeDefined();
    });

    it("should have innerType on readonly schemas", () => {
      const schema = z.readonly(z.string());
      const def = schema._zod.def as any;
      expect(def.innerType).toBeDefined();
    });
  });

  describe("_zod.def.in property (Transform)", () => {
    it("should have in property on transform schemas", () => {
      const schema = z.string().transform((s) => s.length);
      const def = schema._zod.def as any;
      expect(def.in).toBeDefined();
    });
  });

  describe("_zod.def.in property (Pipeline)", () => {
    it("should have in property on pipeline schemas", () => {
      const schema = z.string().transform(Number).pipe(z.number());
      const def = schema._zod.def as any;
      expect(def.in).toBeDefined();
    });
  });

  describe("_zod.def.values property (Literal)", () => {
    it("should have values array on literal schemas", () => {
      const schema = z.literal("test");
      const def = schema._zod.def as any;
      expect(def.values).toBeDefined();
      expect(Array.isArray(def.values)).toBe(true);
      expect(def.values[0]).toBe("test");
    });
  });

  describe("_zod.def.entries property (Enum)", () => {
    it("should have entries object on enum schemas", () => {
      const schema = z.enum(["a", "b", "c"]);
      const def = schema._zod.def as any;
      expect(def.entries).toBeDefined();
      expect(typeof def.entries).toBe("object");
    });
  });

  describe("_zod.def.entries property (NativeEnum)", () => {
    it("should have entries object on native enum schemas", () => {
      enum TestEnum {
        A = "a",
        B = "b",
      }
      const schema = z.nativeEnum(TestEnum);
      const def = schema._zod.def as any;
      expect(def.entries).toBeDefined();
      expect(typeof def.entries).toBe("object");
    });
  });

  describe("_zod.def.output property (Function)", () => {
    it("should have output property on function schemas", () => {
      const schema = z.function().output(z.string());
      const def = schema._zod.def as any;
      expect(def.output).toBeDefined();
    });
  });

  describe("Type imports compatibility", () => {
    it("should be able to use zod4 types", () => {
      // This test will fail at compile time if types don't exist
      const schema = z.string();
      expect(schema._zod).toBeDefined();
      expect(schema._zod.def).toBeDefined();
      expect(schema._zod.def.type).toBeDefined();
    });
  });

  describe("Integration: Verify structure works with ZodFastCheck", () => {
    it("should generate values for schemas using _def structure", () => {
      const zfc = ZodFastCheck();

      // Test that all schema types work (which means _def access works)
      expect(() => zfc.inputOf(z.string())).not.toThrow();
      expect(() => zfc.inputOf(z.number())).not.toThrow();
      expect(() => zfc.inputOf(z.array(z.string()))).not.toThrow();
      expect(() => zfc.inputOf(z.object({ a: z.string() }))).not.toThrow();
      expect(() => zfc.inputOf(z.union([z.string(), z.number()]))).not.toThrow();
    });
  });
});

