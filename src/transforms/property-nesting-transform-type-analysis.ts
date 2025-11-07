import {
  Node,
  ObjectLiteralExpression,
  Project,
  PropertyAssignment,
  ShorthandPropertyAssignment,
  SourceFile,
  SyntaxKind,
  Type,
  TypeNode,
} from "ts-morph";

/**
 * PROOF OF CONCEPT: Type Analysis-Based Property Nesting Transform
 *
 * This is an alternative implementation that uses TypeScript's type system
 * to determine which properties should be nested, rather than using heuristics.
 *
 * Note: This is not hooked up to the main codemod. It's a proof of concept
 * demonstrating how type analysis could work.
 *
 * More details can be found in @/docs/PROPERTY_FLATTEN.md
 */

interface NestingInfo {
  topLevelProperties: Set<string>;
  nestedProperties: Set<string>;
  hasPropertiesProperty: boolean;
}

export class TypeAnalysisPropertyNestingTransform {
  constructor(private project: Project) {
    // Attempt to load Azure SDK type definitions
    // This allows ts-morph to resolve types from @azure/* packages
    try {
      this.project.addSourceFilesAtPaths([
        "node_modules/@azure/*/dist-esm/src/**/*.d.ts",
        "node_modules/@azure/**/types.d.ts",
      ]);
    } catch (error) {
      // Type definitions not available, will fall back to heuristics
      console.warn("Could not load Azure SDK type definitions:", error);
    }
  }

  /**
   * Apply the type-based transformation to a source file
   */
  public transform(sourceFile: SourceFile): void {
    const objectLiterals = sourceFile.getDescendantsOfKind(
      SyntaxKind.ObjectLiteralExpression
    );

    // Process from bottom to top to avoid issues with forgotten nodes
    for (let i = objectLiterals.length - 1; i >= 0; i--) {
      const objectLiteral = objectLiterals[i];

      if (!objectLiteral.wasForgotten()) {
        this.transformObjectLiteral(objectLiteral);
      }
    }
  }

  /**
   * Transform a single object literal using type information
   */
  private transformObjectLiteral(objectLiteral: ObjectLiteralExpression): void {
    // Try to get type information
    const typeNode = this.getTypeAnnotation(objectLiteral);

    if (!typeNode) {
      // No type information available, cannot use type analysis
      return;
    }

    // Check if transformation is needed
    if (!this.shouldTransformObjectLiteral(objectLiteral, typeNode)) {
      return;
    }

    // Analyze the type structure
    const type = typeNode.getType();
    const nestingInfo = this.analyzeTypeStructure(type);

    if (!nestingInfo.hasPropertiesProperty) {
      // Type doesn't have a properties field, no transformation needed
      return;
    }

    // Categorize properties based on type information
    const { topLevel, nested } = this.categorizePropertiesByType(
      objectLiteral,
      nestingInfo
    );

    if (nested.length === 0) {
      // Nothing to nest
      return;
    }

    // Perform the transformation
    this.restructureObjectLiteral(objectLiteral, topLevel, nested);
  }

  /**
   * Get the type annotation for an object literal from its context
   */
  private getTypeAnnotation(
    objectLiteral: ObjectLiteralExpression
  ): TypeNode | undefined {
    const parent = objectLiteral.getParent();

    // Case 1: Variable declaration with type annotation
    // const params: PrivateCloud = { ... }
    if (Node.isVariableDeclaration(parent)) {
      return parent.getTypeNode();
    }

    // Case 2: Function parameter with type annotation
    // function foo(params: PrivateCloud) { ... }
    if (Node.isParameterDeclaration(parent)) {
      return parent.getTypeNode();
    }

    // Case 3: Type assertion
    // const obj = <PrivateCloud>{ ... } or { ... } as PrivateCloud
    if (Node.isAsExpression(parent)) {
      return parent.getTypeNode();
    }

    if (Node.isTypeAssertion(parent)) {
      return parent.getTypeNode();
    }

    // Case 4: Property assignment with type annotation
    // const obj = { prop: <Type>{ ... } }
    if (Node.isPropertyAssignment(parent)) {
      const init = parent.getInitializer();
      if (init && (Node.isAsExpression(init) || Node.isTypeAssertion(init))) {
        return init.getTypeNode();
      }
    }

    return undefined;
  }

  /**
   * Analyze the structure of a type to determine nesting requirements
   */
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
          nestedProps.forEach((p) => nested.add(p.getName()));
        }
      } else {
        // This is a top-level property
        topLevel.add(propName);
      }
    }

    return {
      topLevelProperties: topLevel,
      nestedProperties: nested,
      hasPropertiesProperty,
    };
  }

  /**
   * Get the type of a specific property
   */
  private getPropertyType(type: Type, propertyName: string): Type | undefined {
    const property = type.getProperty(propertyName);
    if (!property) return undefined;

    const declarations = property.getDeclarations();
    if (declarations.length === 0) return undefined;

    const declaration = declarations[0];

    if (
      Node.isPropertySignature(declaration) ||
      Node.isPropertyDeclaration(declaration)
    ) {
      return declaration.getType();
    }

    return undefined;
  }

  /**
   * Determine if an object literal should be transformed
   */
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
      .some(
        (prop) =>
          Node.isPropertyAssignment(prop) && prop.getName() === "properties"
      );

    // Transform if:
    // 1. The type expects a "properties" field (v7 signature)
    // 2. The object literal doesn't have one yet (v6 usage pattern)
    return !objectHasProperties;
  }

  /**
   * Categorize properties based on type information
   */
  private categorizePropertiesByType(
    objectLiteral: ObjectLiteralExpression,
    nestingInfo: NestingInfo
  ): {
    topLevel: Array<PropertyAssignment | ShorthandPropertyAssignment>;
    nested: Array<PropertyAssignment | ShorthandPropertyAssignment>;
  } {
    const topLevel: Array<PropertyAssignment | ShorthandPropertyAssignment> =
      [];
    const nested: Array<PropertyAssignment | ShorthandPropertyAssignment> = [];

    for (const prop of objectLiteral.getProperties()) {
      if (
        !Node.isPropertyAssignment(prop) &&
        !Node.isShorthandPropertyAssignment(prop)
      ) {
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
        // This could be a v6 property or an extra property
        // Default to nesting it
        nested.push(prop);
      }
    }

    return { topLevel, nested };
  }

  /**
   * Restructure the object literal with a properties wrapper
   */
  private restructureObjectLiteral(
    objectLiteral: ObjectLiteralExpression,
    topLevel: Array<PropertyAssignment | ShorthandPropertyAssignment>,
    nested: Array<PropertyAssignment | ShorthandPropertyAssignment>
  ): void {
    const parts: string[] = [];

    // Add top-level properties first
    for (const prop of topLevel) {
      parts.push(prop.getText());
    }

    // Add properties wrapper with nested properties
    const nestedProps = nested.map((prop) => prop.getText()).join(",\n      ");
    parts.push(`properties: {\n      ${nestedProps}\n    }`);

    // Replace the object literal
    const newObjectText = `{\n    ${parts.join(",\n    ")}\n  }`;
    objectLiteral.replaceWithText(newObjectText);
  }

  /**
   * Check if a type comes from an Azure SDK package
   */
  private isAzureSDKType(type: Type): boolean {
    const location = this.getTypeDefinitionLocation(type);
    return location?.includes("node_modules/@azure/") ?? false;
  }

  /**
   * Get the file path where a type is defined
   */
  private getTypeDefinitionLocation(type: Type): string | undefined {
    const symbol = type.getSymbol();
    if (!symbol) return undefined;

    const declarations = symbol.getDeclarations();
    if (declarations.length === 0) return undefined;

    const sourceFile = declarations[0].getSourceFile();
    return sourceFile.getFilePath();
  }

  /**
   * Get diagnostic information about a type (useful for debugging)
   */
  public getTypeDiagnostics(type: Type): {
    name: string;
    location: string | undefined;
    properties: string[];
    hasPropertiesField: boolean;
  } {
    const symbol = type.getSymbol();
    const name = symbol?.getName() ?? "anonymous";
    const location = this.getTypeDefinitionLocation(type);
    const properties = type.getProperties().map((p) => p.getName());
    const hasPropertiesField = type.getProperty("properties") !== undefined;

    return { name, location, properties, hasPropertiesField };
  }
}
