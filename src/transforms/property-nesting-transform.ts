import {
  SourceFile,
  Node,
  SyntaxKind,
  ObjectLiteralExpression,
  PropertyAssignment,
  ShorthandPropertyAssignment,
  SpreadAssignment,
} from "ts-morph";

/**
 * Transforms object literals to wrap certain properties in a 'properties' object.
 * This handles the v6 -> v7 migration where ARM resources moved from flattened
 * properties to nested properties.
 *
 * Example:
 * Before: { location: "eastus", managementCluster: {...}, networkBlock: "..." }
 * After:  { location: "eastus", properties: { managementCluster: {...}, networkBlock: "..." } }
 */
export class PropertyNestingTransform {
  /**
   * ARM resource properties that should remain at the top level.
   * These are common across all ARM resources.
   */
  private readonly topLevelProperties = new Set([
    "location",
    "sku",
    "tags",
    "identity",
    "id",
    "name",
    "type",
    "kind",
    "etag",
    "systemData",
    "zones",
    "extendedLocation",
  ]);

  /**
   * Apply the property nesting transformation to a source file
   */
  public transform(sourceFile: SourceFile): void {
    this.processObjectLiterals(sourceFile);
  }

  /**
   * Process all object literals in the source file
   */
  private processObjectLiterals(sourceFile: SourceFile): void {
    // Process from bottom to top (innermost to outermost) to avoid issues
    // with nodes being forgotten after transformation
    const objectLiterals = sourceFile.getDescendantsOfKind(
      SyntaxKind.ObjectLiteralExpression
    );

    // Reverse the array to process innermost objects first
    for (let i = objectLiterals.length - 1; i >= 0; i--) {
      const objectLiteral = objectLiterals[i];

      // Check if the node is still valid (not forgotten)
      if (!objectLiteral.wasForgotten()) {
        this.transformObjectLiteral(objectLiteral);
      }
    }
  }

  /**
   * Transform a single object literal if it needs property nesting
   */
  private transformObjectLiteral(objectLiteral: ObjectLiteralExpression): void {
    // Check if this object literal should be transformed
    if (!this.shouldTransformObjectLiteral(objectLiteral)) {
      return;
    }

    // Check if it already has a 'properties' property
    const existingProperties = objectLiteral
      .getProperties()
      .find(
        (prop) =>
          Node.isPropertyAssignment(prop) && prop.getName() === "properties"
      );

    if (existingProperties) {
      // Already has properties, skip transformation
      return;
    }

    // Separate properties into top-level and nested
    const { topLevel, nested, spreads } =
      this.categorizeProperties(objectLiteral);

    // Only transform if we have properties to nest
    if (nested.length === 0) {
      return;
    }

    // Rebuild the object literal with nested properties
    this.restructureObjectLiteral(objectLiteral, topLevel, nested, spreads);
  }

  /**
   * Determine if an object literal should be transformed
   */
  private shouldTransformObjectLiteral(
    objectLiteral: ObjectLiteralExpression
  ): boolean {
    const properties = objectLiteral.getProperties();

    // Need at least some properties
    if (properties.length === 0) {
      return false;
    }

    // Check if this looks like an ARM resource object
    // Heuristic: has at least one top-level property AND one that should be nested
    let hasTopLevelProp = false;
    let hasNestableProp = false;

    for (const prop of properties) {
      if (Node.isSpreadAssignment(prop)) {
        continue;
      }

      const propName = this.getPropertyName(prop);
      if (!propName) {
        continue;
      }

      if (this.topLevelProperties.has(propName)) {
        hasTopLevelProp = true;
      } else if (propName !== "properties") {
        hasNestableProp = true;
      }
    }

    // Only transform if it looks like an ARM resource
    return hasTopLevelProp && hasNestableProp;
  }

  /**
   * Categorize properties into top-level, nested, and spreads
   */
  private categorizeProperties(objectLiteral: ObjectLiteralExpression): {
    topLevel: Array<PropertyAssignment | ShorthandPropertyAssignment>;
    nested: Array<PropertyAssignment | ShorthandPropertyAssignment>;
    spreads: SpreadAssignment[];
  } {
    const topLevel: Array<PropertyAssignment | ShorthandPropertyAssignment> =
      [];
    const nested: Array<PropertyAssignment | ShorthandPropertyAssignment> = [];
    const spreads: SpreadAssignment[] = [];

    for (const prop of objectLiteral.getProperties()) {
      if (Node.isSpreadAssignment(prop)) {
        spreads.push(prop);
        continue;
      }

      const propName = this.getPropertyName(prop);
      if (!propName) {
        continue;
      }

      if (this.topLevelProperties.has(propName)) {
        topLevel.push(prop as PropertyAssignment | ShorthandPropertyAssignment);
      } else {
        nested.push(prop as PropertyAssignment | ShorthandPropertyAssignment);
      }
    }

    return { topLevel, nested, spreads };
  }

  /**
   * Get the property name from a property assignment or shorthand
   */
  private getPropertyName(prop: Node): string | undefined {
    if (Node.isPropertyAssignment(prop)) {
      return prop.getName();
    } else if (Node.isShorthandPropertyAssignment(prop)) {
      return prop.getName();
    }
    return undefined;
  }

  /**
   * Restructure the object literal with a properties wrapper
   */
  private restructureObjectLiteral(
    objectLiteral: ObjectLiteralExpression,
    topLevel: Array<PropertyAssignment | ShorthandPropertyAssignment>,
    nested: Array<PropertyAssignment | ShorthandPropertyAssignment>,
    spreads: SpreadAssignment[]
  ): void {
    // Build the new object literal structure
    const parts: string[] = [];

    // Add top-level properties first
    for (const prop of topLevel) {
      parts.push(prop.getText());
    }

    // Add properties wrapper with nested properties
    const nestedProps = nested.map((prop) => prop.getText()).join(",\n      ");
    parts.push(`properties: {\n      ${nestedProps}\n    }`);

    // Add spread assignments at the end
    for (const spread of spreads) {
      parts.push(spread.getText());
    }

    // Replace the object literal
    const newObjectText = `{\n    ${parts.join(",\n    ")}\n  }`;
    objectLiteral.replaceWithText(newObjectText);
  }
}
