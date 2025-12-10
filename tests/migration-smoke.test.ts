/**
 * Smoke tests for migration verification
 * Quick tests to verify basic functionality after zod4 migration
 * Run these first to catch obvious breaking changes
 */

import fc from "fast-check";
import * as z from "zod";
import { ZodFastCheck, ZodFastCheckError } from "./zod-fast-check-module-proxy";

describe("Migration Smoke Tests", () => {
  describe("Basic functionality", () => {
    it("should instantiate ZodFastCheck", () => {
      expect(() => ZodFastCheck()).not.toThrow();
    });

    it("should generate values for basic string schema", () => {
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(z.string());

      return fc.assert(
        fc.property(arb, (value) => {
          expect(typeof value).toBe("string");
        })
      );
    });

    it("should generate values for basic number schema", () => {
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(z.number());

      return fc.assert(
        fc.property(arb, (value) => {
          expect(typeof value).toBe("number");
          // Note: fast-check may generate Infinity, which is valid for zod number
          expect(Number.isFinite(value) || value === Infinity || value === -Infinity).toBe(true);
        })
      );
    });

    it("should generate values for basic array schema", () => {
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(z.array(z.string()));

      return fc.assert(
        fc.property(arb, (value) => {
          expect(Array.isArray(value)).toBe(true);
        })
      );
    });

    it("should generate values for basic object schema", () => {
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(z.object({ name: z.string(), age: z.number() }));

      return fc.assert(
        fc.property(arb, (value) => {
          expect(typeof value).toBe("object");
          expect(value.name).toBeDefined();
          expect(value.age).toBeDefined();
        })
      );
    });
  });

  describe("Critical code paths", () => {
    it("should handle typeName detection", () => {
      const zfc = ZodFastCheck();
      // If typeName detection breaks, these will fail
      expect(() => zfc.inputOf(z.string())).not.toThrow();
      expect(() => zfc.inputOf(z.number())).not.toThrow();
      expect(() => zfc.inputOf(z.array(z.string()))).not.toThrow();
    });

    it("should handle checks iteration", () => {
      const zfc = ZodFastCheck();
      // If checks structure breaks, these will fail
      expect(() => zfc.inputOf(z.string().min(5))).not.toThrow();
      expect(() => zfc.inputOf(z.number().min(5))).not.toThrow();
    });

    it("should handle shape() call", () => {
      const zfc = ZodFastCheck();
      // If shape() breaks, this will fail
      expect(() => zfc.inputOf(z.object({ a: z.string() }))).not.toThrow();
    });

    it("should handle options array", () => {
      const zfc = ZodFastCheck();
      // If options breaks, this will fail
      expect(() => zfc.inputOf(z.union([z.string(), z.number()]))).not.toThrow();
    });
  });

  describe("Output generation", () => {
    it("should generate outputs for transformed schemas", () => {
      const schema = z.number().transform(String);
      const zfc = ZodFastCheck();
      const arb = zfc.outputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(typeof value).toBe("string");
        })
      );
    });

    it("should generate outputs for schemas with defaults", () => {
      const schema = z.string().default("default");
      const zfc = ZodFastCheck();
      const arb = zfc.outputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(typeof value).toBe("string");
        })
      );
    });
  });

  describe("Error handling", () => {
    it("should throw for unsupported schemas", () => {
      const zfc = ZodFastCheck();
      expect(() => zfc.inputOf(z.lazy(() => z.string()))).toThrow(ZodFastCheckError);
    });

    it("should throw for impossible refinements", () => {
      const zfc = ZodFastCheck();
      const arb = zfc.inputOf(z.string().refine(() => false));

      expect(() =>
        fc.assert(
          fc.property(arb, () => true),
          { numRuns: 100 }
        )
      ).toThrow();
    });
  });

  describe("Override functionality", () => {
    it("should support overrides", () => {
      const schema = z.string().uuid();
      const zfc = ZodFastCheck().override(schema, fc.uuid());
      const arb = zfc.inputOf(schema);

      return fc.assert(
        fc.property(arb, (value) => {
          expect(typeof value).toBe("string");
          // UUID format check
          expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        })
      );
    });
  });
});

