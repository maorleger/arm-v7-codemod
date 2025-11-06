import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { LROTransform } from "../../src/transforms/lro-transform";
import { readFileSync } from "fs";
import { join } from "path";

describe("LROTransform - Fixture Integration", () => {
  it("should transform input.ts to match expected.ts (LRO changes only)", () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const transform = new LROTransform();

    // Read the input fixture
    const inputPath = join(__dirname, "../fixtures/input.ts");
    const inputContent = readFileSync(inputPath, "utf-8");

    // Create source file with input content
    const sourceFile = project.createSourceFile("test.ts", inputContent);

    // Apply transformation
    transform.transform(sourceFile);

    const result = sourceFile.getText();

    // Check that LRO transformations were applied correctly
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
});
