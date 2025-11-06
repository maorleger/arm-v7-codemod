import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { LROTransform } from "../../src/transforms/lro-transform";
import { PropertyNestingTransform } from "../../src/transforms/property-nesting-transform";
import { readFileSync } from "fs";
import { join } from "path";

describe("Full Transform Integration", () => {
  it("should transform input.ts with both LRO and property nesting", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const lroTransform = new LROTransform();
    const propertyNestingTransform = new PropertyNestingTransform();

    // Read the input fixture
    const inputPath = join(__dirname, "../fixtures/input.ts");
    const inputContent = readFileSync(inputPath, "utf-8");

    // Create source file with input content
    const sourceFile = project.createSourceFile("test.ts", inputContent);

    // Apply both transformations
    propertyNestingTransform.transform(sourceFile);
    lroTransform.transform(sourceFile);

    const result = sourceFile.getText();

    // Check property nesting transformations
    expect(result).toContain("properties: {");
    expect(result).toContain("managementCluster:");
    expect(result).toContain("networkBlock:");
    expect(result).toContain('internet: "Disabled"');

    // Check that top-level properties remain
    expect(result).toContain("location: LOCATION");
    expect(result).toContain("sku: {");

    // Check LRO transformations
    expect(result).toContain(
      "const poller = client.privateClouds.createOrUpdate("
    );
    expect(result).toContain("await poller.submitted();");
    expect(result).toContain(
      "result = await client.privateClouds.createOrUpdate("
    );

    // Check that begin method calls are removed (but not in strings)
    expect(result).not.toMatch(/client\.privateClouds\.beginCreateOrUpdate\(/);
    expect(result).not.toMatch(
      /client\.privateClouds\.beginCreateOrUpdateAndWait\(/
    );
  });

  it("should be idempotent - running twice produces same result", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const lroTransform = new LROTransform();
    const propertyNestingTransform = new PropertyNestingTransform();

    // Read the input fixture
    const inputPath = join(__dirname, "../fixtures/input.ts");
    const inputContent = readFileSync(inputPath, "utf-8");

    // Create source file with input content
    const sourceFile = project.createSourceFile("test.ts", inputContent);

    // Apply transformations once
    propertyNestingTransform.transform(sourceFile);
    lroTransform.transform(sourceFile);
    const firstResult = sourceFile.getText();

    // Apply transformations again
    propertyNestingTransform.transform(sourceFile);
    lroTransform.transform(sourceFile);
    const secondResult = sourceFile.getText();

    // Results should be identical
    expect(secondResult).toBe(firstResult);
  });
});
