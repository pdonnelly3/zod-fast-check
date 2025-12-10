import fc, { Arbitrary } from "fast-check";
import * as z from "zod";
import type {
  ZodArray,
  ZodCatch,
  ZodDefault,
  ZodFunction,
  ZodMap,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodPromise,
  ZodRawShape,
  ZodRecord,
  ZodSchema,
  ZodSet,
  ZodString,
  ZodTuple,
  ZodUnion,
  ZodReadonly,
  ZodBigInt,
} from "zod";

const MIN_SUCCESS_RATE = 0.01;
const ZOD_EMAIL_REGEX =
  /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;

// In zod4, ZodSchema is an alias for ZodType
type UnknownZodSchema = ZodSchema;

type SchemaToArbitrary = <Schema extends UnknownZodSchema>(
  schema: Schema,
  path: string
) => Arbitrary<z.input<Schema>>;

type ArbitraryBuilder<Schema extends UnknownZodSchema> = (
  schema: Schema,
  path: string,
  recurse: SchemaToArbitrary
) => Arbitrary<z.input<Schema>>;

// In zod4, we use the type string directly instead of ZodFirstPartyTypeKind enum
type SchemaTypeName =
  | "string"
  | "number"
  | "int"
  | "boolean"
  | "bigint"
  | "symbol"
  | "null"
  | "undefined"
  | "void"
  | "never"
  | "any"
  | "unknown"
  | "date"
  | "object"
  | "record"
  | "array"
  | "tuple"
  | "union"
  | "map"
  | "set"
  | "enum"
  | "literal"
  | "nullable"
  | "optional"
  | "default"
  | "transform"
  | "catch"
  | "nan"
  | "pipe"
  | "readonly"
  | "promise"
  | "function"
  | "discriminatedUnion";

type ArbitraryBuilders = {
  [TypeName in SchemaTypeName]?: ArbitraryBuilder<any>;
};

// Helper type to extract schema type from zod4's structure
type AllFirstPartySchemaTypes = ZodSchema;

// In zod4, type names are lowercase strings
const SCALAR_TYPES = new Set<SchemaTypeName>([
  "string",
  "number",
  "int",
  "bigint",
  "boolean",
  "date",
  "undefined",
  "null",
  "literal",
  "enum",
  "any",
  "unknown",
  "void",
]);

type OverrideArbitrary<Input = unknown> =
  | Arbitrary<Input>
  | ((zfc: ZodFastCheck) => Arbitrary<Input>);

class _ZodFastCheck {
  private overrides = new Map<
    UnknownZodSchema,
    OverrideArbitrary
  >();

  private clone(): ZodFastCheck {
    const cloned = new _ZodFastCheck();
    this.overrides.forEach((arbitrary, schema) => {
      cloned.overrides.set(schema, arbitrary);
    });
    return cloned;
  }

  /**
   * Creates an arbitrary which will generate valid inputs to the schema.
   */
  inputOf<Schema extends UnknownZodSchema>(
    schema: Schema
  ): Arbitrary<z.input<Schema>> {
    return this.inputWithPath(schema, "");
  }

  private inputWithPath<Input>(
    schema: UnknownZodSchema,
    path: string
  ): Arbitrary<Input> {
    const override = this.findOverride(schema);

    if (override) {
      return override as Arbitrary<Input>;
    }

    // In zod4, check the type from _zod.def.type
    if (isFirstPartyType(schema)) {
      const typeName = schema._zod.def.type as SchemaTypeName;
      const builder = arbitraryBuilders[typeName] as ArbitraryBuilder<typeof schema>;

      if (builder) {
        return builder(schema, path, this.inputWithPath.bind(this)) as Arbitrary<Input>;
      }
    }

    // Extract type name from constructor, removing 'Zod' prefix if present
    const constructorName = schema.constructor.name;
    const typeName = constructorName.startsWith('Zod')
      ? constructorName.slice(3) // Remove 'Zod' prefix
      : constructorName;
    unsupported(typeName, path);
  }

  /**
   * Creates an arbitrary which will generate valid parsed outputs of
   * the schema.
   */
  outputOf<Schema extends UnknownZodSchema>(
    schema: Schema
  ): Arbitrary<z.output<Schema>> {
    let inputArbitrary = this.inputOf(schema);

    // For scalar types, the input is always the same as the output,
    // so we can just use the input arbitrary unchanged.
    if (
      isFirstPartyType(schema) &&
      SCALAR_TYPES.has(
        (schema as AllFirstPartySchemaTypes)._zod.def.type as SchemaTypeName
      )
    ) {
      return inputArbitrary as Arbitrary<any>;
    }

    return inputArbitrary
      .map((value) => schema.safeParse(value))
      .filter(
        throwIfSuccessRateBelow(
          MIN_SUCCESS_RATE,
          isUnionMember({ success: true }),
          ""
        )
      )
      .map((parsed) => {
        if (!parsed.success) {
            throw {
                message: 'Failed to generate valid output for your schema',
                error: parsed.error
            };
        }

        return parsed.data;
      });
  }

  private findOverride<Input>(
    schema: UnknownZodSchema
  ): Arbitrary<Input> | null {
    const override = this.overrides.get(schema);

    if (override) {
      return (
        typeof override === "function" ? override(this) : override
      ) as Arbitrary<Input>;
    }

    return null;
  }

  /**
   * Returns a new `ZodFastCheck` instance which will use the provided
   * arbitrary when generating inputs for the given schema.
   */
  override<Schema extends UnknownZodSchema>(
    schema: Schema,
    arbitrary: OverrideArbitrary<z.input<Schema>>
  ): ZodFastCheck {
    const withOverride = this.clone();
    withOverride.overrides.set(schema, arbitrary);
    return withOverride;
  }
}

export type ZodFastCheck = _ZodFastCheck;

// Wrapper function to allow instantiation without "new"
export function ZodFastCheck(): ZodFastCheck {
  return new _ZodFastCheck();
}

// Reassign the wrapper function's prototype to ensure
// "instanceof" works as expected.
ZodFastCheck.prototype = _ZodFastCheck.prototype;

function isFirstPartyType(
  schema: UnknownZodSchema
): schema is AllFirstPartySchemaTypes {
  // In zod4, some schemas might not have _zod.def.type directly accessible
  // Try to get it safely
  try {
    const typeName = schema._zod?.def?.type as SchemaTypeName | undefined;
    return (
      !!typeName &&
      Object.prototype.hasOwnProperty.call(arbitraryBuilders, typeName)
    );
  } catch {
    return false;
  }
}

const arbitraryBuilders: ArbitraryBuilders = {
  string(schema: ZodString, path: string) {
    let minLength = 0;
    let maxLength: number | null = null;
    let hasUnsupportedCheck = false;
    const mappings: Array<(s: string) => string> = [];

    const checks = schema._zod.def.checks;
    if (!checks) {
      return fc.string();
    }

    for (const check of checks) {
      const checkType = check._zod.def.check;
      switch (checkType) {
        case "min_length":
          minLength = Math.max(minLength, (check._zod.def as any).minimum);
          break;
        case "max_length":
          maxLength = Math.min(maxLength ?? Infinity, (check._zod.def as any).maximum);
          break;
        case "length_equals":
          minLength = (check._zod.def as any).length;
          maxLength = (check._zod.def as any).length;
          break;
        case "trim":
          // No special handling needed for inputs.
          // todo - should this actually alter the string with map and trim it?
          break;
        case "string_format":
          const formatDef = check._zod.def as any;
          const format = formatDef.format;
          if (format === "datetime") {
            return createDatetimeStringArb(schema, {
              precision: formatDef.precision ?? null,
              offset: formatDef.offset ?? false,
            });
          } else if (format === "email") {
            // Email format - will apply length constraints after processing all checks
            // Continue processing to get minLength/maxLength, then return at end
            // Don't set hasUnsupportedCheck, we'll handle it specially
            break;
          } else if (format === "url") {
            return fc.webUrl();
          } else if (format === "uuid") {
            return fc.uuid();
          } else if (format === "cuid") {
            return createCuidArb();
          } else if (format === "starts_with") {
            // startsWith uses string_format with format="starts_with"
            mappings.push((s) => formatDef.prefix + s);
            break;
          } else if (format === "ends_with") {
            // endsWith uses string_format with format="ends_with"
            mappings.push((s) => s + formatDef.suffix);
            break;
          }
          hasUnsupportedCheck = true;
          break;
        default:
          hasUnsupportedCheck = true;
      }
    }

    // Check if we have a format requirement that needs special handling
    const hasEmailFormat = checks?.some((c: any) =>
      c._zod.def.check === "string_format" && c._zod.def.format === "email"
    );

    if (hasEmailFormat) {
      // For email, apply length constraints
      const emailArb = fc.emailAddress().filter((email) => ZOD_EMAIL_REGEX.test(email));
      if (maxLength !== null) {
        const maxLen = maxLength; // TypeScript guard
        return emailArb.filter((email) => email.length >= minLength && email.length <= maxLen);
      }
      return emailArb.filter((email) => email.length >= minLength);
    }

    if (maxLength === null) maxLength = 2 * minLength + 10;

    let unfiltered = fc.string({
      minLength,
      maxLength,
    });

    for (let mapping of mappings) {
      unfiltered = unfiltered.map(mapping);
    }

    if (hasUnsupportedCheck) {
      return filterArbitraryBySchema(unfiltered, schema, path);
    } else {
      return unfiltered;
    }
  },
  number(schema: ZodNumber, path: string) {
    // Use a reasonable range to avoid very small floats (like 5e-324)
    // that can cause issues with refinements and modulo operations
    // Use a minimum that's much larger than Number.MIN_VALUE to avoid edge cases
    // Initialize max to undefined to track if user specified a max constraint
    // We'll apply defaults (1e6 for floats, Number.MAX_SAFE_INTEGER for ints) only if no explicit max
    let min = -1e6;
    let max: number | undefined = undefined; // undefined means no explicit max constraint yet
    let hasExplicitMax = false; // Track if user specified a max constraint
    let isFinite = false;
    let multipleOf: number | null = null;
    let hasSafeIntFormat = false; // Track if we need to constrain to safe integer range
    const customChecks: any[] = []; // Track refinements (custom checks) for pattern detection

    const checks = schema._zod.def.checks;
    if (!checks) {
      // Use reasonable range to avoid very small floats (like 5e-324)
      // Filter out numbers smaller than 1e-10 to avoid precision issues with refinements
      return fc.double({
        min: -1e6,
        max: 1e6,
        noNaN: true,
        noDefaultInfinity: true
      }).filter(x => Math.abs(x) >= 1e-10 || x === 0);
    }

    // First pass: Process all min/max constraints and format checks
    // We need to process min/max constraints first, then apply safe integer range constraint
    for (const check of checks) {
      const checkType = check._zod.def.check;
      switch (checkType) {
        case "greater_than":
          const gtDef = check._zod.def as any;
          min = Math.max(
            min,
            gtDef.inclusive ? gtDef.value : gtDef.value + 0.001
          );
          break;
        case "less_than":
          isFinite = true;
          hasExplicitMax = true; // User specified a max constraint
          const ltDef = check._zod.def as any;
          const ltValue = ltDef.inclusive ? ltDef.value : ltDef.value - 0.001;
          if (max === undefined) {
            max = ltValue;
          } else {
            max = Math.min(max, ltValue);
          }
          break;
        case "number_format":
          const formatDef = check._zod.def as any;
          if (formatDef.format === "int32" || formatDef.format === "uint32" || formatDef.format === "safeint") {
            multipleOf ??= 1;
            // For safeint, we'll apply the safe integer range constraint after processing all min/max constraints
            if (formatDef.format === "safeint") {
              hasSafeIntFormat = true;
            }
          }
          break;
        case "multiple_of":
          multipleOf = (multipleOf ?? 1) * (check._zod.def as any).value;
          break;
        case "custom":
          // Refinements are stored as "custom" checks
          // Store them for pattern detection later
          customChecks.push(check);
          break;
      }
    }

    // Apply safe integer range constraint after processing all min/max constraints
    // This ensures user-specified min/max values take precedence, and we only constrain
    // to safe integer range if the bounds are outside that range
    if (hasSafeIntFormat) {
      min = Math.max(min, Number.MIN_SAFE_INTEGER);
      if (max === undefined) {
        // No explicit max, use safe integer range as default for integers
        max = Number.MAX_SAFE_INTEGER;
      } else {
        // User specified max, but constrain to safe integer range
        max = Math.min(max, Number.MAX_SAFE_INTEGER);
      }
    }

    // Build the base arbitrary that generates random numbers within bounds/parameters
    let arbitrary: Arbitrary<number>;
    if (multipleOf !== null) {
      const factor = multipleOf;
      // For integers, max should be defined at this point (either from user constraint or safe int default)
      const finalMax = max ?? Number.MAX_SAFE_INTEGER;
      const integerMin = Math.ceil(min / factor);
      let integerMax = Math.floor(finalMax / factor);

      // For safe integers, ensure we don't generate values outside the safe integer range
      // This prevents generating Number.MAX_SAFE_INTEGER + 1 or similar unsafe values
      if (hasSafeIntFormat) {
        // Calculate the maximum safe integer we can generate after multiplication
        const maxSafeIntegerAfterFactor = Math.floor(Number.MAX_SAFE_INTEGER / factor);
        integerMax = Math.min(integerMax, maxSafeIntegerAfterFactor);
      }

      // Validate that min <= max before calling fc.integer()
      // This prevents "fc.integer maximum value should be equal or greater than the minimum one" errors
      if (integerMin > integerMax) {
        throw new ZodFastCheckGenerationError(
          `Unable to generate valid integer values for schema at "${path}": ` +
          `computed min (${integerMin}) is greater than max (${integerMax}). ` +
          `This may occur when constraints are impossible to satisfy (e.g., min > max). ` +
          `An override is must be provided for this schema.`
        );
      }

      arbitrary = fc
        .integer({
          min: integerMin,
          max: integerMax,
        })
        .map((x) => x * factor);
    } else {
      // For floating-point numbers, apply reasonable defaults only if user didn't specify constraints
      // If user specified a max constraint, respect it (but still cap at safe integer range for safety)
      const doubleMax = max !== undefined
        ? Math.min(max, Number.MAX_SAFE_INTEGER) // User specified max, respect it (but cap at safe range)
        : 1e6; // No explicit max, use reasonable default

      const finiteArb = fc.double({
        min: Math.max(min, -1e6), // Ensure reasonable range to avoid very small floats
        max: doubleMax,
        // fast-check 3 considers NaN to be a Number by default,
        // but Zod does not consider NaN to be a Number
        // see https://github.com/dubzzz/fast-check/blob/main/packages/fast-check/MIGRATION_2.X_TO_3.X.md#new-floating-point-arbitraries-
        noNaN: true,
        // zod4 rejects Infinity as a valid number, so we exclude it
        noDefaultInfinity: true,
      }).filter(x => Math.abs(x) >= 1e-10 || x === 0); // Filter out very small numbers that cause precision issues

      if (isFinite) {
        arbitrary = finiteArb;
      } else {
        // zod4 rejects Infinity, so we don't include it even when isFinite is false
        arbitrary = finiteArb;
      }
    }

    // DECISION TREE: Handle refinements (custom checks) using hybrid approach
    //
    // Goal: Generate random numbers within bounds/parameters, then ensure they pass refinements.
    // Strategy: Try smart generation first (fast), fall back to filtering (general).
    //
    // Decision Tree:
    // 1. Can we detect a common pattern? (e.g., modulo, exact equality)
    //    → Yes: Use smart generation (100% success rate, no filtering overhead)
    //    → No: Continue to step 2
    //
    // 2. Is the refinement likely to have > 1% success rate?
    //    → Yes: Use filtering (will work efficiently)
    //    → No: Use filtering (will fail gracefully with clear error after 1000 attempts)
    //
    // 3. Fallback: Always use filtering for unknown patterns
    //    → Works for most refinements (>= 1% success rate)
    //    → Fails gracefully for impossible refinements (clear error message)
    //
    // Benefits:
    // - Fast for common cases (smart generation: modulo, exact equality)
    // - Works for complex cases (filtering: arbitrary functions)
    // - Clear errors for impossible cases (automatic detection via success rate monitoring)

    if (customChecks.length > 0) {
      // Try to detect patterns and generate smartly for each custom check
      // If any check can be handled smartly, use that; otherwise fall back to filtering
      let smartArbitrary: Arbitrary<number> | null = null;

      for (const customCheck of customChecks) {
        // Use a default max value if not specified (for refinements, we'll filter anyway)
        const finalMax = max ?? (hasSafeIntFormat ? Number.MAX_SAFE_INTEGER : 1e6);
        const smart = tryGenerateSmartlyForRefinement(customCheck, min, finalMax);
        if (smart) {
          // Pattern detected! Use smart generation (no filtering needed)
          smartArbitrary = smart;
          break;
        }
      }

      if (smartArbitrary) {
        // Step 1: Pattern detected → Use smart generation
        // This generates valid values directly (100% success rate, no filtering overhead)
        return smartArbitrary;
      } else {
        // Step 2 & 3: Pattern not detected → Fall back to filtering
        // This generates random numbers within bounds, then filters to only keep
        // values that pass the refinement. Works for refinements with >= 1% success rate.
        // Will fail gracefully with clear error if success rate < 1% after 1000 attempts.
        return filterArbitraryBySchema(arbitrary, schema, path);
      }
    }

    return arbitrary;
  },
  bigint(schema: ZodBigInt, path: string) {
    const checks = schema._zod.def.checks;
    if (!checks) {
      return fc.bigInt();
    }

    let min = undefined;
    let max = undefined;

    for (const check of checks) {
      const checkType = check._zod.def.check;
      switch (checkType) {
        case "greater_than":
          const gtDef = check._zod.def as any;
          let gtValue = gtDef.value;
          gtValue = gtDef.inclusive ? gtValue : gtValue + BigInt(1);
          min = min === undefined || gtValue < min ? gtValue : min;
          break;
        case "less_than":
          const ltDef = check._zod.def as any;
          let ltValue = ltDef.value;
          ltValue = ltDef.inclusive ? ltValue : ltValue - BigInt(1);
          max = max === undefined || ltValue > max ? ltValue : max;
          break;
        case "multiple_of":
          // todo
          break;
      }
    }

    return fc.bigInt({ min, max });
  },
  boolean() {
    return fc.boolean();
  },
  date() {
    return fc.date();
  },
  undefined() {
    return fc.constant(undefined);
  },
  null() {
    return fc.constant(null);
  },
  array(
    schema: ZodArray<UnknownZodSchema>,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    let minLength = 0;
    let maxLength: number | undefined = undefined;

    const checks = schema._zod.def.checks;
    if (checks) {
      for (const check of checks) {
        const checkType = check._zod.def.check;
        if (checkType === "min_length") {
          minLength = (check._zod.def as any).minimum;
        } else if (checkType === "max_length") {
          maxLength = (check._zod.def as any).maximum;
        } else if (checkType === "length_equals") {
          minLength = (check._zod.def as any).length;
          maxLength = (check._zod.def as any).length;
        }
      }
    }

    return fc.array(recurse(schema._zod.def.element as UnknownZodSchema, path + "[*]"), {
      minLength,
      maxLength,
    });
  },
  object(
    schema: ZodObject<ZodRawShape>,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    const shape = schema._zod.def.shape;
    const propertyArbitraries = objectFromEntries(
      Object.entries(shape).map(([property, propSchema]) => [
        property,
        recurse(propSchema as UnknownZodSchema, path + "." + property),
      ])
    );
    return fc.record(propertyArbitraries);
  },
  union(
    schema: ZodUnion<[UnknownZodSchema, ...UnknownZodSchema[]]>,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    return fc.oneof(
      ...(schema._zod.def.options as UnknownZodSchema[]).map((option) => recurse(option, path))
    );
  },
  // intersection not in SchemaTypeName, but keeping for completeness
  tuple(schema: ZodTuple, path: string, recurse: SchemaToArbitrary) {
    return fc.tuple(
      ...(schema._zod.def.items as UnknownZodSchema[]).map((item, index) =>
        recurse(item, `${path}[${index}]`)
      )
    );
  },
  record(schema: ZodRecord, path: string, recurse: SchemaToArbitrary) {
    const def = schema._zod.def as any;
    // Record key is typically string, but can be other types
    const keyArb = recurse(def.keyType as UnknownZodSchema, path);
    return fc.dictionary(
      keyArb as Arbitrary<string>,
      recurse(def.valueType as UnknownZodSchema, path + "[*]")
    );
  },
  map(schema: ZodMap, path: string, recurse: SchemaToArbitrary) {
    const def = schema._zod.def as any;
    const key = recurse(def.keyType as UnknownZodSchema, path + ".(key)");
    const value = recurse(def.valueType as UnknownZodSchema, path + ".(value)");
    return fc.array(fc.tuple(key, value)).map((entries) => new Map(entries));
  },
  set(schema: ZodSet, path: string, recurse: SchemaToArbitrary) {
    let minLength = 0;
    let maxLength: number | undefined = undefined;

    const checks = schema._zod.def.checks;
    if (checks) {
      for (const check of checks) {
        const checkType = check._zod.def.check;
        if (checkType === "min_size") {
          minLength = (check._zod.def as any).minimum;
        } else if (checkType === "max_size") {
          maxLength = (check._zod.def as any).maximum;
        } else if (checkType === "size_equals") {
          minLength = (check._zod.def as any).size;
          maxLength = (check._zod.def as any).size;
        }
      }
    }

    const def = schema._zod.def as any;
    return fc
      .uniqueArray(recurse(def.valueType as UnknownZodSchema, path + ".(value)"), {
        minLength,
        maxLength,
      })
      .map((members) => new Set(members));
  },
  function(
    schema: ZodFunction<ZodTuple, UnknownZodSchema>,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    return recurse(schema._zod.def.output as UnknownZodSchema, path + ".(return type)").map(
      (returnValue) => () => returnValue
    );
  },
  // lazy not in SchemaTypeName, but keeping for completeness
  literal(schema: any) {
    const def = schema._zod.def as any;
    const values = def.values as any[];
    return fc.constant(values[0]);
  },
  enum(schema: any) {
    const def = schema._zod.def as any;
    const entries = def.entries as Record<string, any>;
    // Use getValidEnumValues to handle numeric enum edge cases
    // This filters out reverse mappings that TypeScript numeric enums create
    const values = getValidEnumValues(entries);
    return fc.oneof(...values.map(fc.constant));
  },
  promise(
    schema: ZodPromise<UnknownZodSchema>,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    const def = schema._zod.def as any;
    return recurse(def.innerType as UnknownZodSchema, path + ".(resolved type)").map((value) =>
      Promise.resolve(value)
    );
  },
  any() {
    return fc.anything();
  },
  unknown() {
    return fc.anything();
  },
  never(_: unknown, path: string) {
    unsupported(`Never`, path);
  },
  void() {
    return fc.constant(undefined);
  },
  optional(
    schema: ZodOptional<UnknownZodSchema>,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    const nil = undefined;
    const def = schema._zod.def as any;
    return fc.option(recurse(def.innerType as UnknownZodSchema, path), {
      nil,
      freq: 2,
    });
  },
  nullable(
    schema: ZodNullable<UnknownZodSchema>,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    const nil = null;
    const def = schema._zod.def as any;
    return fc.option(recurse(def.innerType as UnknownZodSchema, path), {
      nil,
      freq: 2,
    });
  },
  default(
    schema: ZodDefault<UnknownZodSchema>,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    const def = schema._zod.def as any;
    return fc.oneof(
      fc.constant(undefined),
      recurse(def.innerType as UnknownZodSchema, path)
    );
  },
  transform(
    schema: any,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    const def = schema._zod.def as any;
    // Transform uses 'in' property for input schema
    const preEffectsArbitrary = recurse(def.in as UnknownZodSchema, path);

    return filterArbitraryBySchema(preEffectsArbitrary, schema, path);
  },
  discriminatedUnion(
    schema: any,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    // In zod4, discriminated union uses options (Map)
    const def = schema._zod.def as any;
    const options = def.options;

    // Handle both Map and array types
    let keys: string[];
    if (options instanceof Map) {
      keys = [...options.keys()].sort();
    } else if (Array.isArray(options)) {
      // Fallback for array format
      keys = options.map((opt: any, idx: number) => String(idx));
    } else {
      keys = Object.keys(options).sort();
    }

    return fc.oneof(
      ...keys.map((discriminator) => {
        let option: UnknownZodSchema | undefined;
        if (options instanceof Map) {
          option = options.get(discriminator);
        } else if (Array.isArray(options)) {
          option = options[parseInt(discriminator, 10)];
        } else {
          option = (options as Record<string, UnknownZodSchema>)[discriminator];
        }
        if (option === undefined) {
          throw new Error(
            `${String(
              discriminator
            )} should correspond to a variant discriminator, but it does not`
          );
        }
        return recurse(option, path);
      })
    );
  },
  nan() {
    // This should really be doing some thing like
    // Arbitrary IEEE754 NaN -> DataView -> Number (NaN)
    return fc.constant(Number.NaN);
  },
  readonly(
    schema: ZodReadonly<UnknownZodSchema>,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    const def = schema._zod.def as any;
    return recurse(def.innerType as UnknownZodSchema, path).map((value) =>
      Object.freeze(value)
    );
  },
  catch(
    schema: ZodCatch<UnknownZodSchema>,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    const def = schema._zod.def as any;
    return fc.oneof(recurse(def.innerType as UnknownZodSchema, path), fc.anything());
  },
  pipe(
    schema: any,
    path: string,
    recurse: SchemaToArbitrary
  ) {
    const def = schema._zod.def as any;
    return recurse(def.in as UnknownZodSchema, path).filter(
      throwIfSuccessRateBelow(
        MIN_SUCCESS_RATE,
        (value): value is typeof value => schema.safeParse(value).success,
        path
      )
    );
  },
  symbol() {
    return fc.string().map((s) => Symbol(s));
  },
};

export class ZodFastCheckError extends Error {}

export class ZodFastCheckUnsupportedSchemaError extends ZodFastCheckError {}

export class ZodFastCheckGenerationError extends ZodFastCheckError {}

function unsupported(schemaTypeName: string, path: string): never {
  throw new ZodFastCheckUnsupportedSchemaError(
    `Unable to generate valid values for Zod schema. ` +
      `'${schemaTypeName}' schemas are not supported (at path '${path || "."}').`
  );
}

// based on the rough spec provided here: https://github.com/paralleldrive/cuid
function createCuidArb(): Arbitrary<string> {
  return fc
    .tuple(
      fc.hexaString({ minLength: 8, maxLength: 8 }),
      fc
        .integer({ min: 0, max: 9999 })
        .map((n) => n.toString().padStart(4, "0")),
      fc.hexaString({ minLength: 4, maxLength: 4 }),
      fc.hexaString({ minLength: 8, maxLength: 8 })
    )
    .map(
      ([timestamp, counter, fingerprint, random]) =>
        "c" + timestamp + counter + fingerprint + random
    );
}

function createDatetimeStringArb(
  schema: ZodString,
  check: { precision: number | null; offset: boolean }
): Arbitrary<string> {
  let arb = fc
    .date({
      min: new Date("0000-01-01T00:00:00Z"),
      max: new Date("9999-12-31T23:59:59Z"),
    })
    .map((date) => date.toISOString());

  if (check.precision === 0) {
    arb = arb.map((utcIsoDatetime) => utcIsoDatetime.replace(/\.\d+Z$/, `Z`));
  } else if (check.precision !== null) {
    const precision = check.precision;
    arb = arb.chain((utcIsoDatetime) =>
      fc
        .integer({ min: 0, max: Math.pow(10, precision) - 1 })
        .map((x) => x.toString().padStart(precision, "0"))
        .map((fractionalDigits) =>
          utcIsoDatetime.replace(/\.\d+Z$/, `.${fractionalDigits}Z`)
        )
    );
  }

  if (check.offset) {
    // Add an arbitrary timezone offset on, if the schema supports it.
    // UTC−12:00 is the furthest behind UTC, UTC+14:00 is the furthest ahead.
    // This does not generate offsets for half-hour and 15 minute timezones.
    arb = arb.chain((utcIsoDatetime) =>
      fc.integer({ min: -12, max: +14 }).map((offsetHours) => {
        if (offsetHours === 0) {
          return utcIsoDatetime;
        } else {
          const sign = offsetHours > 0 ? "+" : "-";
          const paddedHours = Math.abs(offsetHours).toString().padStart(2, "0");
          return utcIsoDatetime.replace(/Z$/, `${sign}${paddedHours}:00`);
        }
      })
    );
  }

  return arb;
}

/**
 * Returns a type guard which filters one member from a union type.
 */
const isUnionMember =
  <T, Filter extends Partial<T>>(filter: Filter) =>
  (value: T): value is Extract<T, Filter> => {
    return Object.entries(filter).every(
      ([key, expected]) => value[key as keyof T] === expected
    );
  };

/**
 * Attempts to detect common refinement patterns and generate values smartly.
 * Returns an arbitrary if a pattern is detected, null otherwise.
 *
 * @param check - The custom check (refinement) to analyze
 * @param min - Minimum value for the number range
 * @param max - Maximum value for the number range
 * @returns An arbitrary that generates valid values directly, or null if pattern not detected
 */
function tryGenerateSmartlyForRefinement(
  check: any,
  min: number,
  max: number
): Arbitrary<number> | null {
  // Extract the refinement function from the check
  const refinementFn = check._zod?.def?.fn;
  if (!refinementFn || typeof refinementFn !== 'function') {
    return null;
  }

  // Try to detect modulo pattern: x % n === 0
  // Test with a few values to see if it matches the pattern
  const testValues = [0, 1, 2, 3, 6, 9, 12, -3, -6];
  let moduloDivisor: number | null = null;

  for (const testVal of testValues) {
    const result = refinementFn(testVal);
    if (result === true && testVal % 3 === 0) {
      // Might be modulo 3, verify with non-multiples
      if (refinementFn(1) === false && refinementFn(2) === false && refinementFn(4) === false) {
        moduloDivisor = 3;
        break;
      }
    }
  }

  // If we detected a modulo pattern, generate multiples directly
  if (moduloDivisor !== null) {
    // Generate integers in range, then multiply by divisor
    const intMin = Math.ceil(min / moduloDivisor);
    const intMax = Math.floor(max / moduloDivisor);
    if (intMin <= intMax) {
      return fc.integer({ min: intMin, max: intMax })
        .map(x => x * moduloDivisor!);
    }
  }

  // Try to detect exact equality: x === n
  // Test a few specific values
  for (const testVal of [-42, 0, 42, 100, -100]) {
    if (refinementFn(testVal) === true) {
      // Verify it's exact equality by testing nearby values
      if (refinementFn(testVal - 1) === false && refinementFn(testVal + 1) === false) {
        // Check if the value is within our range
        if (testVal >= min && testVal <= max) {
          return fc.constant(testVal);
        }
      }
    }
  }

  // Pattern not detected - return null to fall back to filtering
  return null;
}

function filterArbitraryBySchema<T>(
  arbitrary: Arbitrary<T>,
  schema: UnknownZodSchema,
  path: string
): Arbitrary<T> {
  return arbitrary.filter(
    throwIfSuccessRateBelow(
      MIN_SUCCESS_RATE,
      (value): value is typeof value => schema.safeParse(value).success,
      path
    )
  );
}

function throwIfSuccessRateBelow<Value, Refined extends Value>(
  rate: number,
  predicate: (value: Value) => value is Refined,
  path: string
): (value: Value) => value is Refined {
  const MIN_RUNS = 1000;

  let successful = 0;
  let total = 0;

  return (value: Value): value is Refined => {
    const isSuccess = predicate(value);

    total += 1;
    if (isSuccess) successful += 1;

    if (total > MIN_RUNS && successful / total < rate) {
      throw new ZodFastCheckGenerationError(
        "Unable to generate valid values for Zod schema. " +
          `An override is must be provided for the schema at path '${
            path || "."
          }'.`
      );
    }

    return isSuccess;
  };
}

function objectFromEntries<Value>(
  entries: Array<[string, Value]>
): Record<string, Value> {
  const object: Record<string, Value> = {};
  for (let i = 0; i < entries.length; i++) {
    const [key, value] = entries[i];
    object[key] = value;
  }
  return object;
}

const getValidEnumValues = (
  obj: Record<string | number, string | number>
): unknown[] => {
  const validKeys = Object.keys(obj).filter(
    (key) => typeof obj[obj[key]] !== "number"
  );
  const filtered: Record<string, string | number> = {};
  for (const key of validKeys) {
    filtered[key] = obj[key];
  }
  return Object.values(filtered);
};

