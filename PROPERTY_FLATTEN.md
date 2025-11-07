# Property Flattening/Nesting Transformation - Type Analysis Approach

## Overview

This document describes an advanced approach to transforming Azure SDK v6 object literals to v7 using TypeScript type analysis via ts-morph. This is an alternative to the heuristic-based approach currently implemented and assumes we're unable to provide a metadata file that helps with identifying flattened properties.

## Problem Statement

In Azure SDK v6, ARM resource types had flattened properties at the top level. In v7, many of these properties are nested under a `properties` object:

**v6 Structure:**
```typescript
interface PrivateCloud {
  location: string;
  sku: Sku;
  managementCluster: ManagementCluster;
  networkBlock: string;
  internet: string;
  identitySources: IdentitySource[];
}
```

**v7 Structure:**
```typescript
interface PrivateCloud {
  location: string;
  sku: Sku;
  properties: {
    managementCluster: ManagementCluster;
    networkBlock: string;
    internet: string;
    identitySources: IdentitySource[];
  };
}
```

## Current Approach: Heuristic-Based

The current implementation uses a hardcoded list of known ARM properties that stay at the top level:
- `location`, `sku`, `tags`, `identity`, `id`, `name`, `type`, `kind`, `etag`, `systemData`, `zones`, `extendedLocation`

Everything else is assumed to need nesting. This works well but requires manual maintenance and makes assumptions about type structure.

## Alternative Approach: Type Analysis

### Core Concept

Instead of guessing which properties should be nested, we can:
1. Analyze the actual TypeScript types from the Azure SDK packages
2. Use ts-morph's type checker to understand the type structure
3. Automatically determine which properties belong at the top level vs nested
4. Optionally compare v6 vs v7 type definitions to detect changes

### How ts-morph Type Analysis Works

ts-morph provides access to TypeScript's type system, allowing us to:
- Get the type of any expression or declaration
- Access type symbols and their properties
- Navigate type hierarchies
- Resolve types from external packages

Key APIs:
```typescript
const type = node.getType();                    // Get the type of a node
const symbol = type.getSymbol();                // Get the type's symbol
const properties = type.getProperties();        // Get all properties
const propType = type.getProperty("name");      // Get a specific property
const typeNode = declaration.getTypeNode();     // Get type annotation
```

### Implementation Strategy

#### Phase 1: Type Detection

The first step is to identify what type an object literal is supposed to be:

```typescript
private getTypeAnnotation(objectLiteral: ObjectLiteralExpression): TypeNode | undefined {
  const parent = objectLiteral.getParent();
  
  // Case 1: Variable declaration with type annotation
  // const params: PrivateCloud = { ... }
  if (Node.isVariableDeclaration(parent)) {
    return parent.getTypeNode();
  }
  
  // Case 2: Function parameter with type annotation
  // function foo(params: PrivateCloud) { ... }
  if (Node.isParameter(parent)) {
    return parent.getTypeNode();
  }
  
  // Case 3: Type assertion
  // const obj = <PrivateCloud>{ ... }
  if (Node.isAsExpression(parent) || Node.isTypeAssertion(parent)) {
    return parent.getTypeNode();
  }
  
  // Case 4: Return type (inferred from function signature)
  // function getParams(): PrivateCloud { return { ... } }
  if (Node.isReturnStatement(parent)) {
    const func = parent.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration);
    return func?.getReturnTypeNode();
  }
  
  return undefined;
}
```

#### Phase 2: Type Structure Analysis

Once we have the type, we analyze its structure to understand which properties should be nested:

```typescript
interface NestingInfo {
  topLevelProperties: Set<string>;
  nestedProperties: Set<string>;
  hasPropertiesProperty: boolean;
}

private analyzeTypeStructure(type: Type): NestingInfo {
  const topLevel = new Set<string>();
  const nested = new Set<string>();
  let hasPropertiesProperty = false;
  
  // Get all declared properties from the type
  const declaredProperties = type.getProperties();
  
  for (const propSymbol of declaredProperties) {
    const propName = propSymbol.getName();
    
    // Check if this property is named "properties"
    if (propName === "properties") {
      hasPropertiesProperty = true;
      
      // Get the type of the "properties" property
      const propType = this.getPropertyType(type, propName);
      
      if (propType) {
        // All properties inside the "properties" type should be nested
        const nestedProps = propType.getProperties();
        nestedProps.forEach(p => nested.add(p.getName()));
      }
    } else {
      // This is a top-level property
      topLevel.add(propName);
    }
  }
  
  return { topLevelProperties: topLevel, nestedProperties: nested, hasPropertiesProperty };
}

private getPropertyType(type: Type, propertyName: string): Type | undefined {
  const property = type.getProperty(propertyName);
  if (!property) return undefined;
  
  const declarations = property.getDeclarations();
  if (declarations.length === 0) return undefined;
  
  const declaration = declarations[0];
  
  if (Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration)) {
    return declaration.getType();
  }
  
  return undefined;
}
```

#### Phase 3: Transformation Decision

Determine whether an object literal needs transformation:

```typescript
private shouldTransformObjectLiteral(
  objectLiteral: ObjectLiteralExpression,
  typeNode: TypeNode
): boolean {
  const type = typeNode.getType();
  
  // Check if the type definition has a "properties" field (v7 structure)
  const hasPropertiesField = type.getProperty("properties") !== undefined;
  
  if (!hasPropertiesField) {
    // Type doesn't expect a properties field, no transformation needed
    return false;
  }
  
  // Check if the object literal already has a "properties" property
  const objectHasProperties = objectLiteral
    .getProperties()
    .some(prop => 
      Node.isPropertyAssignment(prop) && prop.getName() === "properties"
    );
  
  // Transform if:
  // 1. The type expects a "properties" field (v7 signature)
  // 2. The object literal doesn't have one yet (v6 usage pattern)
  return !objectHasProperties;
}
```

#### Phase 4: Smart Property Categorization

Use type information to categorize properties:

```typescript
private categorizePropertiesByType(
  objectLiteral: ObjectLiteralExpression,
  nestingInfo: NestingInfo
): {
  topLevel: PropertyAssignment[];
  nested: PropertyAssignment[];
} {
  const topLevel: PropertyAssignment[] = [];
  const nested: PropertyAssignment[] = [];
  
  for (const prop of objectLiteral.getProperties()) {
    if (!Node.isPropertyAssignment(prop)) {
      continue; // Skip spread assignments, etc.
    }
    
    const propName = prop.getName();
    
    // Use type information to categorize
    if (nestingInfo.topLevelProperties.has(propName)) {
      // Type says this property should be at top level
      topLevel.push(prop);
    } else if (nestingInfo.nestedProperties.has(propName)) {
      // Type says this property should be nested
      nested.push(prop);
    } else {
      // Property not in type definition
      // This could be a v6 property that doesn't match v7 types
      // Use fallback heuristic or skip
      nested.push(prop);
    }
  }
  
  return { topLevel, nested };
}
```

#### Phase 5: Module Resolution

To analyze types from external packages, we need to ensure type definitions are available:

```typescript
class TypeAnalysisPropertyNestingTransform {
  constructor(private project: Project) {
    // Add Azure SDK type definitions to the project
    // This allows ts-morph to resolve types from @azure/* packages
    this.project.addSourceFilesAtPaths([
      "node_modules/@azure/*/dist-esm/src/**/*.d.ts",
      "node_modules/@azure/*/types/**/*.d.ts",
      "node_modules/@azure/**/types.d.ts"
    ]);
  }
  
  private getTypeDefinitionLocation(type: Type): string | undefined {
    const symbol = type.getSymbol();
    if (!symbol) return undefined;
    
    const declarations = symbol.getDeclarations();
    if (declarations.length === 0) return undefined;
    
    const sourceFile = declarations[0].getSourceFile();
    const filePath = sourceFile.getFilePath();
    
    // Check if this comes from an @azure package
    if (filePath.includes("node_modules/@azure/")) {
      return filePath;
    }
    
    return undefined;
  }
  
  private isAzureSDKType(type: Type): boolean {
    const location = this.getTypeDefinitionLocation(type);
    return location !== undefined;
  }
}
```

## Advanced: Cross-Version Type Comparison

The most sophisticated approach would compare v6 and v7 types to detect what changed:

```typescript
interface PropertyMigrationMap {
  topLevel: string[];        // Properties that stay at top level
  nested: string[];          // Properties that should be nested
  removed: string[];         // Properties removed in v7
  added: string[];           // Properties added in v7
}

private compareTypeVersions(typeName: string): PropertyMigrationMap | null {
  // This would require having both v6 and v7 packages available
  // or loading type definitions from different versions
  
  const v6Type = this.getTypeFromPackage(`@azure/arm-avs@6.x`, typeName);
  const v7Type = this.getTypeFromPackage(`@azure/arm-avs@7.x`, typeName);
  
  if (!v6Type || !v7Type) {
    return null; // Fall back to heuristic
  }
  
  const v6Properties = new Set(v6Type.getProperties().map(p => p.getName()));
  const v7Properties = new Set(v7Type.getProperties().map(p => p.getName()));
  const v7PropertiesProperty = v7Type.getProperty("properties");
  
  if (!v7PropertiesProperty) {
    return null; // v7 doesn't have nested structure
  }
  
  const v7NestedProperties = new Set(
    v7PropertiesProperty.getType().getProperties().map(p => p.getName())
  );
  
  // Properties that exist in v6 at top level but are nested in v7
  const shouldBeNested: string[] = [];
  
  for (const v6Prop of v6Properties) {
    if (!v7Properties.has(v6Prop) && v7NestedProperties.has(v6Prop)) {
      shouldBeNested.push(v6Prop);
    }
  }
  
  // Properties that exist at top level in both versions
  const topLevel = Array.from(v7Properties).filter(p => p !== "properties");
  
  return {
    topLevel,
    nested: shouldBeNested,
    removed: Array.from(v6Properties).filter(p => 
      !v7Properties.has(p) && !v7NestedProperties.has(p)
    ),
    added: Array.from(v7NestedProperties).filter(p => !v6Properties.has(p))
  };
}
```

## Advantages of Type Analysis

1. **Accuracy**: Uses actual type definitions, not assumptions or heuristics
2. **Automatic**: Works for any Azure SDK type without manual configuration
3. **Maintainable**: No need to update hardcoded property lists when types change
4. **Type-safe**: Can validate that transformations match type definitions
5. **Handles complex types**: Works with generics, unions, intersections, and nested types
6. **Future-proof**: Adapts to new SDK versions automatically
7. **Validation**: Can detect when code doesn't match expected types

## Challenges and Limitations

1. **Performance**: Type checking is significantly slower than string matching
2. **Type availability**: Requires type definitions to be present in node_modules
3. **Ambiguity**: Cannot transform objects without type annotations
4. **Version detection**: Need to determine if code is using v6 or v7 patterns
5. **Module resolution**: Complex setup to access external package types
6. **Transitive dependencies**: May need to load many type definition files
7. **Edge cases**: Inline types, type aliases, and complex type expressions
8. **Configuration**: Needs proper tsconfig.json setup for module resolution

## Hybrid Approach

The best solution combines both approaches:

```typescript
class HybridPropertyNestingTransform {
  transform(sourceFile: SourceFile): void {
    for (const objectLiteral of this.getObjectLiterals(sourceFile)) {
      const typeInfo = this.getTypeInformation(objectLiteral);
      
      if (typeInfo && this.canUseTypeAnalysis(typeInfo)) {
        // Use type analysis (preferred when available)
        this.transformWithTypeAnalysis(objectLiteral, typeInfo);
      } else {
        // Fall back to heuristic approach
        this.transformWithHeuristic(objectLiteral);
      }
    }
  }
  
  private canUseTypeAnalysis(typeInfo: TypeNode): boolean {
    const type = typeInfo.getType();
    const location = this.getTypeDefinitionLocation(type);
    
    // Only use type analysis for Azure SDK types
    return location?.includes("node_modules/@azure/") ?? false;
  }
}
```

## When to Use Each Approach

### Use Type Analysis When:
- Migrating large codebases with many different types
- Working with multiple Azure SDK packages
- Need high confidence in correctness
- Performance is not critical
- Type definitions are readily available
- Code is well-typed with annotations

### Use Heuristic Approach When:
- Need fast transformation
- Working with a known set of types
- Type definitions are unavailable or incomplete
- Code lacks type annotations
- Prototyping or one-time migrations
- Simple, predictable type structures

## Recommendations

For the current codemod:
1. **Keep the heuristic approach as the default** - It's fast, simple, and works well
2. **Implement type analysis as an optional mode** - Enable with a flag like `--use-type-analysis`
3. **Use hybrid approach for production** - Fall back gracefully when type info unavailable
4. **Validate results** - Compare both approaches on sample code to ensure consistency
5. **Document requirements** - Clearly state when type definitions must be available

## Implementation Complexity

- **Heuristic approach**: 200-300 lines of code, straightforward logic
- **Type analysis approach**: 500-800 lines of code, complex type handling
- **Hybrid approach**: 700-1000 lines of code, best of both worlds

## Conclusion

Type analysis provides superior accuracy and maintainability at the cost of complexity and performance. For most users, the heuristic approach is sufficient. For large-scale enterprise migrations, type analysis becomes valuable.

The proof of concept implementation demonstrates that type analysis is feasible with ts-morph, but the practical value depends on the specific use case and requirements.
