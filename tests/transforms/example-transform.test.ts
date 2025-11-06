import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExampleTransform } from "../../src/transforms/example-transform";
import { Project } from "ts-morph";
import * as fs from "fs";
import * as path from "path";

describe("ExampleTransform", () => {
  let project: Project;
  let testFilePath: string;

  beforeEach(() => {
    project = new Project();
    testFilePath = path.join(__dirname, "test-input.ts");
  });

  afterEach(() => {
    // Clean up test file if it exists
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  it("should transform input correctly", () => {
    const inputCode = `function testFunc() { return 42; }`;
    const expectedOutputCode = `function testFuncTransformed() { return 42; }`;

    const sourceFile = project.createSourceFile(testFilePath, inputCode);
    sourceFile.saveSync();

    const transform = new ExampleTransform();
    transform.applyTransform(sourceFile.getFilePath());

    // Read the file from disk to get the updated content
    const updatedContent = fs.readFileSync(testFilePath, "utf-8");
    expect(updatedContent.trim()).toEqual(expectedOutputCode.trim());
  });

  // Additional test cases can be added here
});
