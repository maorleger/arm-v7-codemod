# Azure SDK v6 to v7 Codemod

## Overview

The `arm-v7-codemod` is an automated codemod tool for migrating Azure SDK for JavaScript/TypeScript code from v6 (AutoRest-generated) to v7 (TypeSpec-generated). This tool uses `ts-morph` to perform intelligent AST-based transformations.

## Features

- **LRO (Long-Running Operation) Migration**: Automatically transforms `begin*` methods to their v7 equivalents
- **Property Nesting**: Restructures ARM resource objects to use the new nested `properties` structure
- **Type-Safe**: Uses TypeScript AST manipulation for accurate transformations
- **Glob Pattern Support**: Transform multiple files at once

## Project Structure

```
arm-v7-codemod
├── src
│   ├── index.ts                                      # Main entry point with CLI
│   ├── transforms                                    # Transformation implementations
│   │   ├── lro-transform.ts                         # LRO method transformations
│   │   ├── property-nesting-transform.ts            # Property flattening/nesting
│   │   └── property-nesting-transform-type-analysis.ts  # Type analysis POC
│   ├── utils                                         # Utility functions
│   │   └── helpers.ts
│   └── types                                         # Type definitions
│       └── index.ts
├── tests                                             # Comprehensive test suite
│   ├── transforms                                    # Unit tests for each transform
│   │   ├── lro-transform.test.ts
│   │   ├── property-nesting-transform.test.ts
│   │   └── property-nesting-transform-type-analysis.test.ts
│   ├── integration                                   # Integration tests
│   │   └── fixtures-integration.test.ts
│   └── fixtures                                      # Test input/output samples
│       ├── input.ts
│       └── expected.ts
├── example                                           # Example files for testing
│   └── test.ts
├── AGENTS.md                                         # Detailed codemod specifications
├── PROPERTY_FLATTEN.md                               # Type analysis documentation
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

Install the project dependencies:

```bash
pnpm install
```

## Usage

### Basic Usage

Transform files in the example directory (default):
```bash
npm run codemod
```

### Transform Specific Files

Use glob patterns to target specific files:
```bash
npm run codemod -- "src/**/*.ts"
npm run codemod -- "example/**/*.ts"
npm run codemod -- "path/to/file.ts"
```

## Transformations

### 1. LRO Method Migration

Transforms long-running operation methods from v6 to v7 patterns:

**Before (v6):**
```typescript
const poller = await client.beginCreateOrUpdate(args);
const result = await poller.pollUntilDone();

const result2 = await client.beginCreateOrUpdateAndWait(args);
```

**After (v7):**
```typescript
const poller = client.createOrUpdate(args);
await poller.submitted();
const result = await poller.pollUntilDone();

const result2 = await client.createOrUpdate(args);
```

### 2. Property Nesting

Restructures ARM resource objects from flat to nested structure:

**Before (v6):**
```typescript
const resource: PrivateCloud = {
  location: "eastus",
  sku: { name: "AV36" },
  managementCluster: { clusterSize: 3 },
  networkBlock: "192.168.48.0/22",
  internet: "Disabled"
};
```

**After (v7):**
```typescript
const resource: PrivateCloud = {
  location: "eastus",
  sku: { name: "AV36" },
  properties: {
    managementCluster: { clusterSize: 3 },
    networkBlock: "192.168.48.0/22",
    internet: "Disabled"
  }
};
```

Top-level ARM properties that remain unchanged:
- `location`, `sku`, `tags`, `identity`, `id`, `name`, `type`, `kind`, `etag`, `systemData`, `zones`, `extendedLocation`

## Testing

Run the full test suite:
```bash
pnpm test
```

Run specific tests:
```bash
pnpm test lro-transform
pnpm test property-nesting
pnpm test fixtures-integration
```

Watch mode for development:
```bash
pnpm test:watch
```

## Test Coverage

- **34 tests** across 4 test files
- Unit tests for each transformation
- Integration tests for end-to-end workflows
- Idempotency tests to ensure transformations are stable
- Proof of concept tests for type analysis approach

## Architecture

### Transformation Pipeline

The codemod applies transformations in the following order:

1. **Property Nesting Transform**: Restructures object literals first (modifies structure)
2. **LRO Transform**: Updates method calls (modifies behavior)

This order ensures that object structures are correct before method transformations are applied.

### Type Analysis (Proof of Concept)

An alternative type-based approach is available as a proof of concept. See `PROPERTY_FLATTEN.md` for details on how TypeScript type analysis can be used for more accurate transformations.

## Advanced Usage

### Programmatic API

You can also use the transforms programmatically:

```typescript
import { Project } from "ts-morph";
import { LROTransform } from "./src/transforms/lro-transform";
import { PropertyNestingTransform } from "./src/transforms/property-nesting-transform";

const project = new Project();
const sourceFile = project.addSourceFileAtPath("path/to/file.ts");

const lroTransform = new LROTransform();
const propertyTransform = new PropertyNestingTransform();

propertyTransform.transform(sourceFile);
lroTransform.transform(sourceFile);

sourceFile.saveSync();
```

## Limitations

- Requires valid TypeScript code (must parse correctly)
- Property nesting uses heuristics for ARM resources
- LRO detection is based on `begin*` method naming convention
- Does not handle dynamic property names or computed properties
- Spread operators in objects are preserved but may need manual review

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass (`pnpm test`)
5. Submit a pull request with a clear description

## Documentation

- `AGENTS.md`: Detailed specification of the codemod transformations
- `PROPERTY_FLATTEN.md`: Type analysis approach and proof of concept
- Test files: Examples of transformation patterns

## License

This project is licensed under the MIT License.
