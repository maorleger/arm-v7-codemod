# arm-v7-codemod

## Overview

The `arm-v7-codemod` project is a TypeScript codemod tool designed to facilitate the transformation of code using the `ts-morph` library. This project provides a structured way to apply code modifications across TypeScript files.

## Project Structure

```
arm-v7-codemod
├── src
│   ├── index.ts               # Entry point for the codemod process
│   ├── transforms             # Contains transformation logic
│   │   └── example-transform.ts
│   ├── utils                  # Utility functions for the codemod
│   │   └── helpers.ts
│   └── types                  # Type definitions and interfaces
│       └── index.ts
├── tests                      # Unit tests for the codemod
│   ├── transforms
│   │   └── example-transform.test.ts
│   └── fixtures               # Sample input and expected output for tests
│       ├── input.ts
│       └── expected.ts
├── package.json               # Project metadata and dependencies
├── tsconfig.json              # TypeScript configuration
├── pnpm-lock.yaml             # Dependency lock file
└── README.md                  # Project documentation
```

## Installation

To install the project dependencies, run:

```
pnpm install
```

## Usage

To run the codemod, execute the following command:

```
pnpm run codemod
```

Make sure to replace `codemod` with the actual script name defined in `package.json`.

## Contribution

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and ensure that all tests pass.
4. Submit a pull request with a clear description of your changes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.