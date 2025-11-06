import {
  SourceFile,
  Node,
  SyntaxKind,
  AwaitExpression,
  CallExpression,
  PropertyAccessExpression,
  VariableDeclaration,
} from "ts-morph";

/**
 * Transforms Long-Running Operation (LRO) method calls from v6 to v7 pattern.
 *
 * Transformations:
 * 1. const poller = await client.beginMethod() → const poller = client.method(); await poller.submitted();
 * 2. await client.beginMethodAndWait() → await client.method()
 * 3. await client.beginMethod() (not assigned) → await client.method().submitted()
 */
export class LROTransform {
  /**
   * Apply the LRO transformation to a source file
   */
  public transform(sourceFile: SourceFile): void {
    // Process all await expressions in the file
    this.processAwaitExpressions(sourceFile);
  }

  /**
   * Process all await expressions in the source file
   */
  private processAwaitExpressions(sourceFile: SourceFile): void {
    const awaitExpressions = sourceFile.getDescendantsOfKind(
      SyntaxKind.AwaitExpression
    );

    for (const awaitExpression of awaitExpressions) {
      this.transformAwaitExpression(awaitExpression);
    }
  }

  /**
   * Transform a single await expression if it's an LRO method call
   */
  private transformAwaitExpression(awaitExpression: AwaitExpression): void {
    const expression = awaitExpression.getExpression();

    // Check if this is a call expression
    if (!Node.isCallExpression(expression)) {
      return;
    }

    const callExpression = expression;
    const callee = callExpression.getExpression();

    // Check if this is a property access (e.g., client.method())
    if (!Node.isPropertyAccessExpression(callee)) {
      return;
    }

    const propertyAccess = callee;
    const methodName = propertyAccess.getName();

    // Check if this is a begin* method
    if (!this.isBeginMethod(methodName)) {
      return;
    }

    // Transform based on the pattern
    if (this.isAndWaitMethod(methodName)) {
      // Pattern 2: await beginMethodAndWait() → await method()
      this.transformAndWaitPattern(propertyAccess, methodName);
    } else {
      // Pattern 1 or 3: await beginMethod()
      this.transformBeginPattern(
        awaitExpression,
        callExpression,
        propertyAccess,
        methodName
      );
    }
  }

  /**
   * Transform beginMethodAndWait pattern
   */
  private transformAndWaitPattern(
    propertyAccess: PropertyAccessExpression,
    methodName: string
  ): void {
    const newMethodName = this.transformMethodName(methodName);
    propertyAccess.getNameNode().replaceWithText(newMethodName);
  }

  /**
   * Transform beginMethod pattern (with or without variable assignment)
   */
  private transformBeginPattern(
    awaitExpression: AwaitExpression,
    callExpression: CallExpression,
    propertyAccess: PropertyAccessExpression,
    methodName: string
  ): void {
    const newMethodName = this.transformMethodName(methodName);
    propertyAccess.getNameNode().replaceWithText(newMethodName);

    // Check if this is assigned to a variable
    const parent = awaitExpression.getParent();

    if (Node.isVariableDeclaration(parent)) {
      // Pattern 1: const poller = await beginMethod()
      // Transform to: const poller = method(); await poller.submitted();
      this.transformPollerAssignment(parent, awaitExpression, callExpression);
    } else {
      // Pattern 3: await beginMethod() (not assigned)
      // Transform to: await method().submitted()
      this.transformDirectAwait(awaitExpression, callExpression);
    }
  }

  /**
   * Transform Pattern 1: const poller = await beginMethod()
   * to: const poller = method(); await poller.submitted();
   */
  private transformPollerAssignment(
    variableDeclaration: VariableDeclaration,
    awaitExpression: AwaitExpression,
    callExpression: CallExpression
  ): void {
    const variableName = variableDeclaration.getName();

    // Remove the await from the initializer
    variableDeclaration.setInitializer(callExpression.getText());

    // Find the variable statement (the parent of the declaration)
    const variableStatement = variableDeclaration.getVariableStatement();

    if (!variableStatement) {
      return;
    }

    // Get the parent block or source file to insert the statement
    const parent = variableStatement.getParent();

    if (Node.isBlock(parent) || Node.isSourceFile(parent)) {
      const index = variableStatement.getChildIndex();
      parent.insertStatements(index + 1, `await ${variableName}.submitted();`);
    }
  }

  /**
   * Transform Pattern 3: await beginMethod()
   * to: await method().submitted()
   */
  private transformDirectAwait(
    awaitExpression: AwaitExpression,
    callExpression: CallExpression
  ): void {
    // Replace the awaited expression with method().submitted()
    const newExpression = `${callExpression.getText()}.submitted()`;
    awaitExpression.setExpression(newExpression);
  }

  /**
   * Check if a method name starts with "begin" and is an LRO method
   */
  private isBeginMethod(methodName: string): boolean {
    return (
      methodName.startsWith("begin") &&
      methodName.length > 5 &&
      /^[A-Z]/.test(methodName[5]) // Next char after "begin" should be uppercase
    );
  }

  /**
   * Check if a method name ends with "AndWait"
   */
  private isAndWaitMethod(methodName: string): boolean {
    return methodName.endsWith("AndWait");
  }

  /**
   * Transform method name: beginCreateOrUpdate → createOrUpdate
   * or beginCreateOrUpdateAndWait → createOrUpdate
   */
  private transformMethodName(methodName: string): string {
    // Remove "begin" prefix
    let name = methodName.slice(5);

    // Remove "AndWait" suffix if present
    if (name.endsWith("AndWait")) {
      name = name.slice(0, -7);
    }

    // Convert first character to lowercase (camelCase)
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
}
