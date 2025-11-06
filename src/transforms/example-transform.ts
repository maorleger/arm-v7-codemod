import { Project, SyntaxKind, FunctionDeclaration, Node } from "ts-morph";

export class ExampleTransform {
  private project: Project;

  constructor() {
    this.project = new Project();
  }

  public applyTransform(filePath: string): void {
    const sourceFile = this.project.addSourceFileAtPath(filePath);

    sourceFile.forEachDescendant((node) => {
      if (Node.isFunctionDeclaration(node)) {
        this.transformFunction(node);
      }
    });

    sourceFile.saveSync();
  }

  private transformFunction(node: FunctionDeclaration): void {
    // Example transformation logic
    const currentName = node.getName();
    if (currentName) {
      node.rename(currentName + "Transformed");
    }
  }
}
