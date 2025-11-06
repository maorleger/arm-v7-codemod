import { describe, it, expect, beforeEach } from "vitest";
import { Project, SourceFile } from "ts-morph";
import { LROTransform } from "../../src/transforms/lro-transform";

describe("LROTransform", () => {
  let project: Project;
  let transform: LROTransform;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
    transform = new LROTransform();
  });

  describe("Pattern 1: Poller with await assignment", () => {
    it("should transform await beginMethod() to method() with submitted()", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const poller = await client.beginCreateOrUpdate(args);
const result = await poller.pollUntilDone();
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain("const poller = client.createOrUpdate(args);");
      expect(text).toContain("await poller.submitted();");
      expect(text).toContain("const result = await poller.pollUntilDone();");
    });

    it("should handle different method names", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const poller = await client.beginStart(options);`
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain("const poller = client.start(options);");
      expect(text).toContain("await poller.submitted();");
    });

    it("should handle nested property access", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const poller = await client.privateClouds.beginCreateOrUpdate(args);`
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain(
        "const poller = client.privateClouds.createOrUpdate(args);"
      );
      expect(text).toContain("await poller.submitted();");
    });
  });

  describe("Pattern 2: AndWait variant", () => {
    it("should transform beginMethodAndWait() to method()", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const result = await client.beginCreateOrUpdateAndWait(args);`
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain(
        "const result = await client.createOrUpdate(args);"
      );
      expect(text).not.toContain("submitted");
    });

    it("should handle different AndWait method names", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const result = await client.beginStartAndWait(options);`
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain("const result = await client.start(options);");
      expect(text).not.toContain("AndWait");
    });

    it("should handle nested property access with AndWait", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const result = await client.privateClouds.beginCreateOrUpdateAndWait(args);`
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain(
        "const result = await client.privateClouds.createOrUpdate(args);"
      );
    });
  });

  describe("Pattern 3: Direct await without assignment", () => {
    it("should transform await beginMethod() to await method().submitted()", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
async function test() {
  await client.beginStart();
}
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain("await client.start().submitted();");
    });
  });

  describe("Edge cases", () => {
    it("should not transform methods that don't start with begin", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const result = await client.createOrUpdate(args);`
      );

      const originalText = sourceFile.getText();
      transform.transform(sourceFile);

      expect(sourceFile.getText()).toBe(originalText);
    });

    it("should not transform begin with lowercase next character", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const result = await client.beginwork();`
      );

      const originalText = sourceFile.getText();
      transform.transform(sourceFile);

      expect(sourceFile.getText()).toBe(originalText);
    });

    it("should handle multiple transformations in one file", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const poller1 = await client.beginStart();
const result1 = await poller1.pollUntilDone();

const result2 = await client.beginCreateAndWait();
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain("const poller1 = client.start();");
      expect(text).toContain("await poller1.submitted();");
      expect(text).toContain("const result2 = await client.create();");
    });

    it("should preserve method arguments", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const poller = await client.beginMethod(arg1, arg2, { option: true });`
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain("client.method(arg1, arg2, { option: true })");
    });
  });

  describe("Real-world example from fixtures", () => {
    it("should transform the AVS example correctly", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
async function testOperations() {
  const poller = await client.privateClouds.beginCreateOrUpdate(
    RESOURCE_GROUP_NAME,
    PRIVATE_CLOUD_NAME,
    privateCloudParams
  );
  let result = await poller.pollUntilDone();

  result = await client.privateClouds.beginCreateOrUpdateAndWait(
    RESOURCE_GROUP_NAME,
    PRIVATE_CLOUD_NAME,
    privateCloudParams
  );
}
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();

      // Check first transformation
      expect(text).toContain(
        "const poller = client.privateClouds.createOrUpdate("
      );
      expect(text).toContain("await poller.submitted();");
      expect(text).toContain("let result = await poller.pollUntilDone();");

      // Check second transformation
      expect(text).toContain(
        "result = await client.privateClouds.createOrUpdate("
      );
      expect(text).not.toContain("beginCreateOrUpdate");
      expect(text).not.toContain("AndWait");
    });
  });
});
