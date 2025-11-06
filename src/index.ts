import { Project } from "ts-morph";
import { LROTransform } from "./transforms/lro-transform";
import * as path from "path";

// Parse command line arguments
const args = process.argv.slice(2);
const filePattern = args[0] || "example/**/*.ts";
const dryRun = args.includes("--dry-run");

// Initialize project and transformations
const project = new Project({
  tsConfigFilePath: path.join(__dirname, "../tsconfig.json"),
});

const lroTransform = new LROTransform();

// Initialize the codemod process
function runCodemod(pattern: string) {
  console.log(`🔍 Searching for files matching: ${pattern}`);

  // Load the source files
  const sourceFiles = project.addSourceFilesAtPaths(pattern);

  if (sourceFiles.length === 0) {
    console.log("❌ No files found matching the pattern");
    return;
  }

  console.log(`📝 Found ${sourceFiles.length} file(s) to process\n`);

  // Apply transformations
  sourceFiles.forEach((sourceFile) => {
    console.log(`Processing: ${sourceFile.getFilePath()}`);

    // Apply LRO transformation
    lroTransform.transform(sourceFile);

    console.log("  ✓ LRO transformation applied");
  });

  // Save changes
  if (dryRun) {
    console.log("\n🔍 Dry run mode - no files were modified");
    console.log("\nPreview of changes:\n");
    sourceFiles.forEach((sourceFile) => {
      console.log(`\n--- ${sourceFile.getFilePath()} ---`);
      console.log(sourceFile.getText());
    });
  } else {
    project.saveSync();
    console.log(`\n✅ Successfully transformed ${sourceFiles.length} file(s)`);
  }
}

// Start the codemod process
console.log("🚀 Azure SDK v6 → v7 Codemod\n");
runCodemod(filePattern);
