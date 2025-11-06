export type TransformationResult = {
    success: boolean;
    message: string;
    transformedCode?: string;
};

export interface Transform {
    apply(input: string): TransformationResult;
}

export interface CodemodOptions {
    dryRun?: boolean;
    verbose?: boolean;
}