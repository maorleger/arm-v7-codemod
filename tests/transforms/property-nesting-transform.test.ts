import { describe, it, expect, beforeEach } from "vitest";
import { Project } from "ts-morph";
import { PropertyNestingTransform } from "../../src/transforms/property-nesting-transform";

describe("PropertyNestingTransform", () => {
  let project: Project;
  let transform: PropertyNestingTransform;

  beforeEach(() => {
    project = new Project({ useInMemoryFileSystem: true });
    transform = new PropertyNestingTransform();
  });

  describe("Basic property nesting", () => {
    it("should wrap non-ARM properties in a properties object", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const resource = {
  location: "eastus",
  sku: { name: "Standard" },
  managementCluster: { clusterSize: 3 },
  networkBlock: "192.168.48.0/22"
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain('location: "eastus"');
      expect(text).toContain('sku: { name: "Standard" }');
      expect(text).toContain("properties: {");
      expect(text).toContain("managementCluster: { clusterSize: 3 }");
      expect(text).toContain('networkBlock: "192.168.48.0/22"');
    });

    it("should handle multiple properties correctly", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const resource = {
  location: "westus",
  prop1: "value1",
  prop2: "value2",
  prop3: { nested: true }
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain('location: "westus"');
      expect(text).toContain("properties: {");
      expect(text).toContain('prop1: "value1"');
      expect(text).toContain('prop2: "value2"');
      expect(text).toContain("prop3: { nested: true }");
    });

    it("should preserve all top-level ARM properties", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const resource = {
  id: "/subscriptions/...",
  name: "myResource",
  type: "Microsoft.Resource/type",
  location: "eastus",
  sku: { name: "Standard" },
  tags: { env: "prod" },
  identity: { type: "SystemAssigned" },
  kind: "basic",
  etag: "abc123",
  zones: ["1", "2"],
  customProp: "value"
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      // All ARM properties should stay at top level
      expect(text).toMatch(/^\s*id:/m);
      expect(text).toMatch(/^\s*name:/m);
      expect(text).toMatch(/^\s*type:/m);
      expect(text).toMatch(/^\s*location:/m);
      expect(text).toMatch(/^\s*sku:/m);
      expect(text).toMatch(/^\s*tags:/m);
      expect(text).toMatch(/^\s*identity:/m);
      expect(text).toMatch(/^\s*kind:/m);
      expect(text).toMatch(/^\s*etag:/m);
      expect(text).toMatch(/^\s*zones:/m);

      // Custom property should be nested
      expect(text).toContain("properties: {");
      expect(text).toContain('customProp: "value"');
    });
  });

  describe("Edge cases", () => {
    it("should not transform objects without ARM properties", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const config = {
  prop1: "value1",
  prop2: "value2"
};
        `.trim()
      );

      const originalText = sourceFile.getText();
      transform.transform(sourceFile);

      expect(sourceFile.getText()).toBe(originalText);
    });

    it("should not transform objects that already have a properties field", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const resource = {
  location: "eastus",
  properties: {
    existing: "value"
  }
};
        `.trim()
      );

      const originalText = sourceFile.getText();
      transform.transform(sourceFile);

      expect(sourceFile.getText()).toBe(originalText);
    });

    it("should not transform objects with only top-level properties", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const resource = {
  location: "eastus",
  sku: { name: "Standard" },
  tags: { env: "prod" }
};
        `.trim()
      );

      const originalText = sourceFile.getText();
      transform.transform(sourceFile);

      expect(sourceFile.getText()).toBe(originalText);
    });

    it("should not transform empty objects", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `const empty = {};`
      );

      const originalText = sourceFile.getText();
      transform.transform(sourceFile);

      expect(sourceFile.getText()).toBe(originalText);
    });
  });

  describe("Real-world example from fixtures", () => {
    it("should transform the PrivateCloud example correctly", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const privateCloudParams = {
  location: LOCATION,
  sku: {
    name: "AV36",
  },
  managementCluster: {
    clusterSize: 3,
  },
  networkBlock: "192.168.48.0/22",
  internet: "Disabled",
  identitySources: [],
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();

      // Check top-level properties remain
      expect(text).toContain("location: LOCATION");
      expect(text).toContain("sku: {");
      expect(text).toContain('name: "AV36"');

      // Check nested properties are wrapped
      expect(text).toContain("properties: {");
      expect(text).toContain("managementCluster: {");
      expect(text).toContain("clusterSize: 3");
      expect(text).toContain('networkBlock: "192.168.48.0/22"');
      expect(text).toContain('internet: "Disabled"');
      expect(text).toContain("identitySources: []");
    });
  });

  describe("Nested object literals", () => {
    it("should handle nested object literals correctly", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const outer = {
  location: "eastus",
  nestedResource: {
    location: "westus",
    customProp: "value"
  }
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();

      // Outer object should be transformed
      expect(text).toContain("properties: {");

      // Inner nested resource should also be transformed
      expect(text).toContain("nestedResource:");
    });
  });

  describe("Complex property values", () => {
    it("should handle arrays as property values", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const resource = {
  location: "eastus",
  items: [1, 2, 3],
  complexItems: [{ id: 1 }, { id: 2 }]
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain('location: "eastus"');
      expect(text).toContain("properties: {");
      expect(text).toContain("items: [1, 2, 3]");
      expect(text).toContain("complexItems: [{ id: 1 }, { id: 2 }]");
    });

    it("should handle function calls as property values", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const resource = {
  location: getLocation(),
  computedValue: compute(),
  staticValue: "test"
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();
      expect(text).toContain("location: getLocation()");
      expect(text).toContain("properties: {");
      expect(text).toContain("computedValue: compute()");
      expect(text).toContain('staticValue: "test"');
    });
  });

  describe("Multiple objects in same file", () => {
    it("should transform multiple object literals independently", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
const resource1 = {
  location: "eastus",
  prop1: "value1"
};

const resource2 = {
  location: "westus",
  prop2: "value2"
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();

      // Both should be transformed
      const propertiesCount = (text.match(/properties: \{/g) || []).length;
      expect(propertiesCount).toBe(2);
    });
  });
});
