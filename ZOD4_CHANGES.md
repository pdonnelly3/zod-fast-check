# Migrating from Zod 3 to Zod 4: A Practical Guide

**For:** Developers migrating codebases that access Zod's internal APIs  
**Context:** This guide is based on migrating `zod-fast-check`, a library that generates fast-check arbitraries from Zod schemas  
**Last Updated:** 2024-12-03

---

## 🎯 Overview

Zod 4 maintains **backward compatibility for public APIs** but completely restructures **internal APIs**. If your code accesses `schema._def.*` properties, you'll need to migrate.

### What Changed?

```
Zod 3 Internal API          →    Zod 4 Internal API
─────────────────────────────────────────────────────
schema._def.typeName        →    schema._zod.def.type
schema._def.checks          →    schema._zod.def.checks
schema._def.shape()         →    schema._zod.def.shape
schema._def.minLength       →    (check checks array)
```

### Key Insight

> **Zod 4 uses a nested structure (`_zod.def`) instead of a flat structure (`_def`), and type names are lowercase strings without the "Zod" prefix.**

---

## 📊 Visual Comparison

### Schema Structure

**Zod 3:**
```
schema
└── _def
    ├── typeName: "ZodString"
    ├── checks: [check1, check2, ...]
    ├── minLength: { value: 5 }
    └── shape: function() { ... }
```

**Zod 4:**
```
schema
└── _zod
    └── def
        ├── type: "string"
        ├── checks: [
        │     { _zod: { def: { check: "min_length", minimum: 5 } } },
        │     { _zod: { def: { check: "max_length", maximum: 10 } } }
        │   ]
        └── shape: { ... }  (property, not function)
```

### Check Structure

**Zod 3:**
```
check
├── kind: "min"
├── value: 5
└── inclusive: true
```

**Zod 4:**
```
check
└── _zod
    └── def
        ├── check: "min_length"
        ├── minimum: 5
        └── inclusive: true
```

---

## 🔄 Migration Patterns

### 1. Property Access: `_def` → `_zod.def`

**Before (Zod 3):**
```typescript
const typeName = schema._def.typeName;
const checks = schema._def.checks;
const shape = schema._def.shape();
```

**After (Zod 4):**
```typescript
const typeName = schema._zod.def.type;
const checks = schema._zod.def.checks;
const shape = schema._zod.def.shape;  // Property, not method
```

**Impact:** Every schema access must be updated.

---

### 2. Type Names: PascalCase → lowercase

**Before (Zod 3):**
```typescript
if (schema._def.typeName === "ZodString") {
  // handle string
}
```

**After (Zod 4):**
```typescript
if (schema._zod.def.type === "string") {
  // handle string
}
```

**Complete Mapping:**
| Zod 3 | Zod 4 |
|-------|-------|
| `"ZodString"` | `"string"` |
| `"ZodNumber"` | `"number"` |
| `"ZodArray"` | `"array"` |
| `"ZodObject"` | `"object"` |
| `"ZodUnion"` | `"union"` |
| `"ZodOptional"` | `"optional"` |
| `"ZodEffects"` | `"transform"` |
| `"ZodPipeline"` | `"pipe"` |

---

### 3. Check Access: Flat → Nested

**Before (Zod 3):**
```typescript
for (const check of schema._def.checks) {
  if (check.kind === "min") {
    const minValue = check.value;
    // ...
  }
}
```

**After (Zod 4):**
```typescript
for (const check of schema._zod.def.checks || []) {
  if (check._zod.def.check === "min_length") {
    const minValue = check._zod.def.minimum;
    // ...
  }
}
```

**Key Changes:**
- `check.kind` → `check._zod.def.check`
- `check.value` → `check._zod.def.minimum` (for min) or `check._zod.def.maximum` (for max)
- Check type names changed (see below)

---

### 4. Check Type Names Changed

**Arrays:**
```typescript
// Zod 3
check.kind === "min"      // ❌
check.kind === "max"      // ❌

// Zod 4
check._zod.def.check === "min_length"  // ✅
check._zod.def.check === "max_length"  // ✅
```

**Sets:**
```typescript
// Zod 4
check._zod.def.check === "min_size"  // ✅ (different from arrays!)
check._zod.def.check === "max_size"  // ✅
```

**Numbers:**
```typescript
// Zod 3
check.kind === "min"         // ❌
check.kind === "int"         // ❌
check.kind === "multipleOf"  // ❌

// Zod 4
check._zod.def.check === "greater_than"   // ✅
check._zod.def.check === "number_format"  // ✅ (format="safeint")
check._zod.def.check === "multiple_of"    // ✅
```

**Strings:**
```typescript
// Zod 3
check.kind === "startsWith"  // ❌
check.kind === "email"       // ❌

// Zod 4
check._zod.def.check === "string_format"  // ✅
check._zod.def.format === "starts_with"   // ✅
check._zod.def.format === "email"         // ✅
```

---

### 5. Constraints: Direct Properties → Checks Array

**Before (Zod 3):**
```typescript
const minLength = schema._def.minLength?.value;
const maxLength = schema._def.maxLength?.value;
```

**After (Zod 4):**
```typescript
let minLength = 0;
let maxLength: number | undefined = undefined;

for (const check of schema._zod.def.checks || []) {
  if (check._zod.def.check === "min_length") {
    minLength = check._zod.def.minimum;
  } else if (check._zod.def.check === "max_length") {
    maxLength = check._zod.def.maximum;
  }
}
```

**Why:** Constraints are no longer direct properties - they're stored in the checks array.

---

### 6. Shape Access: Method → Property

**Before (Zod 3):**
```typescript
const shape = schema._def.shape();  // Method call
```

**After (Zod 4):**
```typescript
const shape = schema._zod.def.shape;  // Property access
```

**Impact:** Remove parentheses when accessing shape.

---

## 🎨 Real-World Examples

### Example 1: String Schema with Constraints

**Zod 3:**
```typescript
function handleString(schema: ZodString) {
  const typeName = schema._def.typeName;  // "ZodString"
  const checks = schema._def.checks;
  
  for (const check of checks) {
    if (check.kind === "min") {
      const minLength = check.value;
      // ...
    } else if (check.kind === "email") {
      // handle email
    }
  }
}
```

**Zod 4:**
```typescript
function handleString(schema: ZodString) {
  const type = schema._zod.def.type;  // "string"
  const checks = schema._zod.def.checks;
  
  for (const check of checks || []) {
    if (check._zod.def.check === "min_length") {
      const minLength = check._zod.def.minimum;
      // ...
    } else if (
      check._zod.def.check === "string_format" &&
      check._zod.def.format === "email"
    ) {
      // handle email
    }
  }
}
```

---

### Example 2: Array Schema with Constraints

**Zod 3:**
```typescript
function handleArray(schema: ZodArray) {
  const minLength = schema._def.minLength?.value;
  const maxLength = schema._def.maxLength?.value;
  const elementType = schema._def.type;
}
```

**Zod 4:**
```typescript
function handleArray(schema: ZodArray) {
  let minLength = 0;
  let maxLength: number | undefined = undefined;
  
  for (const check of schema._zod.def.checks || []) {
    if (check._zod.def.check === "min_length") {
      minLength = check._zod.def.minimum;
    } else if (check._zod.def.check === "max_length") {
      maxLength = check._zod.def.maximum;
    }
  }
  
  const elementType = schema._zod.def.element;
}
```

---

### Example 3: Number Schema with Refinements

**Zod 3:**
```typescript
function handleNumber(schema: ZodNumber) {
  const checks = schema._def.checks;
  for (const check of checks) {
    if (check.kind === "int") {
      // handle integer constraint
    } else if (check.kind === "custom") {
      // handle refinement
    }
  }
}
```

**Zod 4:**
```typescript
function handleNumber(schema: ZodNumber) {
  const checks = schema._zod.def.checks;
  for (const check of checks || []) {
    if (
      check._zod.def.check === "number_format" &&
      check._zod.def.format === "safeint"
    ) {
      // handle integer constraint (now called "safeint")
      // Must limit to Number.MIN_SAFE_INTEGER to Number.MAX_SAFE_INTEGER
    } else if (check._zod.def.check === "custom") {
      // handle refinement
    }
  }
}
```

---

## ⚠️ Critical Gotchas

### Gotcha 1: Infinity is Rejected

**Zod 3:**
```typescript
z.number().parse(Infinity);  // ✅ Works
```

**Zod 4:**
```typescript
z.number().parse(Infinity);  // ❌ Throws error
```

**Fix:**
```typescript
// When generating numbers with fast-check
fc.double({
  min,
  max,
  noNaN: true,
  noDefaultInfinity: true,  // ← Add this!
});
```

---

### Gotcha 2: Arrays vs Sets Use Different Check Types

**Arrays:**
```typescript
check._zod.def.check === "min_length"  // ✅
check._zod.def.check === "max_length"  // ✅
```

**Sets:**
```typescript
check._zod.def.check === "min_size"    // ✅ (different!)
check._zod.def.check === "max_size"    // ✅ (different!)
```

**Why:** Arrays use "length", sets use "size" - don't confuse them!

---

### Gotcha 3: String Formats Unified

**Zod 3:**
```typescript
case "email":  // Direct check type
case "uuid":   // Direct check type
```

**Zod 4:**
```typescript
case "string_format":
  if (check._zod.def.format === "email") { /* ... */ }
  if (check._zod.def.format === "uuid") { /* ... */ }
```

**Why:** Many string validations now use the same `"string_format"` check type with different format values.

---

### Gotcha 4: Safe Integer Constraints

**Zod 4's `int()` constraint:**
```typescript
z.number().int()  // Adds "safeint" format check
```

**Requires:**
```typescript
// Numbers must be within safe integer range
min = Math.max(min, Number.MIN_SAFE_INTEGER);
max = Math.min(max, Number.MAX_SAFE_INTEGER);
```

**Why:** Zod 4's `int()` ensures numbers are within JavaScript's safe integer range.

---

### Gotcha 5: Record Requires Both Key and Value Types

**Zod 3:**
```typescript
z.record(z.number())  // Keys default to string
```

**Zod 4:**
```typescript
z.record(z.string(), z.number())  // Must specify both
```

**Why:** Zod 4 requires explicit key type specification.

---

## 🔍 Migration Checklist

### Step 1: Find All `_def` Accesses
```bash
# Search for all _def accesses
grep -r "_def\." src/
grep -r "\._def" src/
```

### Step 2: Update Property Access
- Replace `_def` → `_zod.def`
- Replace `typeName` → `type`
- Replace `shape()` → `shape` (remove parentheses)

### Step 3: Update Type Names
- Replace `"ZodString"` → `"string"`
- Replace `"ZodNumber"` → `"number"`
- Replace all PascalCase type names with lowercase

### Step 4: Update Check Access
- Replace `check.kind` → `check._zod.def.check`
- Replace `check.value` → `check._zod.def.minimum/maximum/value`
- Update check type strings

### Step 5: Update Constraint Access
- Remove direct property access (`_def.minLength`)
- Add checks array iteration
- Handle arrays vs sets differently

### Step 6: Fix Infinity Issues
- Add `noDefaultInfinity: true` to `fc.double()`
- Remove explicit Infinity generation

### Step 7: Test Thoroughly
- Run all tests
- Verify each schema type works
- Check error messages

---

## 📈 Migration Statistics

**From `zod-fast-check` migration:**
- **78 TypeScript errors** fixed
- **31 runtime test failures** resolved
- **206 tests** now passing
- **32 documented fixes** applied
- **~1,000 lines** of code updated

**Time Investment:**
- Initial analysis: ~2 hours
- Type system fixes: ~3 hours
- Runtime fixes: ~4 hours
- Testing & verification: ~2 hours
- **Total: ~11 hours**

---

## 🎓 Key Learnings

1. **Systematic Approach Works Best**
   - Fix type errors first
   - Then fix runtime errors
   - Test after each major change

2. **Create Migration Test Suites**
   - Protect critical code paths
   - Catch regressions early
   - Verify API compatibility

3. **Document Everything**
   - Track all changes
   - Note gotchas
   - Create reference guides

4. **Infinity is a Breaking Change**
   - Zod 4 rejects Infinity
   - Must explicitly exclude it
   - Affects many number-related tests

5. **Check Structure is Complex**
   - Nested `_zod.def` structure
   - Different check types for different schemas
   - Must handle optional chaining

---

## 🚀 Quick Reference

### Property Access
```typescript
_def.typeName        → _zod.def.type
_def.checks          → _zod.def.checks
_def.shape()         → _zod.def.shape
_def.minLength       → (check checks array)
```

### Type Names
```typescript
"ZodString"  → "string"
"ZodNumber"  → "number"
"ZodArray"   → "array"
```

### Check Access
```typescript
check.kind   → check._zod.def.check
check.value  → check._zod.def.minimum/maximum
```

### Check Types
```typescript
Arrays:  "min_length", "max_length"
Sets:    "min_size", "max_size"
Numbers: "greater_than", "less_than", "number_format"
Strings: "string_format" (with format property)
```

---

