import { describe, it, expect, beforeEach } from "vitest";
import { Project } from "ts-morph";
import { TypeAnalysisPropertyNestingTransform } from "../../src/transforms/property-nesting-transform-type-analysis";

/**
 * PROOF OF CONCEPT TESTS
 *
 * These tests demonstrate how the type analysis approach would work.
 * They are not part of the main test suite.
 */
describe("TypeAnalysisPropertyNestingTransform (Proof of Concept)", () => {
  let project: Project;
  let transform: TypeAnalysisPropertyNestingTransform;

  beforeEach(() => {
    project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        target: 99, // ESNext
        module: 99, // ESNext
        strict: true,
      },
    });
    transform = new TypeAnalysisPropertyNestingTransform(project);
  });

  describe("Type detection", () => {
    it("should detect type from variable declaration", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
// Define a v7-style type with properties field
interface Resource {
  location: string;
  sku: { name: string };
  properties: {
    customProp: string;
    networkBlock: string;
  };
}

// Create an object in v6 style (flat)
const resource: Resource = {
  location: "eastus",
  sku: { name: "Standard" },
  customProp: "value",
  networkBlock: "192.168.0.0/24"
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();

      // Should wrap customProp and networkBlock in properties
      expect(text).toContain("properties: {");
      expect(text).toContain("customProp: ");
      expect(text).toContain("networkBlock: ");

      // Should keep location and sku at top level
      expect(text).toMatch(/^\s*location: "eastus"/m);
      expect(text).toMatch(/^\s*sku: /m);
    });

    it("should not transform when type doesn't have properties field", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
// Define a simple type without nested properties
interface SimpleResource {
  location: string;
  customProp: string;
}

const resource: SimpleResource = {
  location: "eastus",
  customProp: "value"
};
        `.trim()
      );

      const originalText = sourceFile.getText();
      transform.transform(sourceFile);

      // Should not change anything
      expect(sourceFile.getText()).toBe(originalText);
    });

    it("should not transform when object already has properties field", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
interface Resource {
  location: string;
  properties: {
    customProp: string;
  };
}

const resource: Resource = {
  location: "eastus",
  properties: {
    customProp: "value"
  }
};
        `.trim()
      );

      const originalText = sourceFile.getText();
      transform.transform(sourceFile);

      // Should not change anything - already in correct format
      expect(sourceFile.getText()).toBe(originalText);
    });
  });

  describe("Type diagnostics", () => {
    it("should provide diagnostic information about a type", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
interface TestResource {
  id: string;
  name: string;
  properties: {
    prop1: string;
    prop2: number;
  };
}

const resource: TestResource = {
  id: "123",
  name: "test",
  prop1: "value",
  prop2: 42
};
        `.trim()
      );

      // Get the type node
      const varDecl = sourceFile.getVariableDeclarations()[0];
      const typeNode = varDecl.getTypeNode();

      if (typeNode) {
        const type = typeNode.getType();
        const diagnostics = transform.getTypeDiagnostics(type);

        expect(diagnostics.name).toBe("TestResource");
        expect(diagnostics.hasPropertiesField).toBe(true);
        expect(diagnostics.properties).toContain("id");
        expect(diagnostics.properties).toContain("name");
        expect(diagnostics.properties).toContain("properties");
      }
    });
  });

  describe("Complex scenarios", () => {
    it("should handle optional properties", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
interface Resource {
  location: string;
  tags?: Record<string, string>;
  properties: {
    optionalProp?: string;
    requiredProp: string;
  };
}

const resource: Resource = {
  location: "eastus",
  requiredProp: "value"
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();

      expect(text).toContain("properties: {");
      expect(text).toContain("requiredProp: ");
    });

    it("should handle nested object literals", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
interface InnerResource {
  location: string;
  properties: {
    innerProp: string;
  };
}

interface OuterResource {
  name: string;
  properties: {
    nested: InnerResource;
  };
}

const outer: OuterResource = {
  name: "outer",
  nested: {
    location: "eastus",
    innerProp: "value"
  }
};
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();

      // Both outer and inner should be transformed
      expect(text).toContain("properties: {");
    });
  });

  describe("Type annotation variations", () => {
    it("should detect type from as expression", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
interface Resource {
  location: string;
  properties: {
    customProp: string;
  };
}

const resource = {
  location: "eastus",
  customProp: "value"
} as Resource;
        `.trim()
      );

      transform.transform(sourceFile);

      const text = sourceFile.getText();

      expect(text).toContain("properties: {");
      expect(text).toContain("customProp: ");
    });

    it("should handle missing type annotations gracefully", () => {
      const sourceFile = project.createSourceFile(
        "test.ts",
        `
// No type annotation
const resource = {
  location: "eastus",
  customProp: "value"
};
        `.trim()
      );

      const originalText = sourceFile.getText();
      transform.transform(sourceFile);

      // Should not transform without type information
      expect(sourceFile.getText()).toBe(originalText);
    });
  });
});
