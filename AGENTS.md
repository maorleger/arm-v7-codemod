# A Codemod for Upgrading Azure SDK for JavaScript/TypeScript from AutoRest to TypeSpec Generated Libraries

Using ts-morph, write a codemod that updates code using the Azure SDK for JavaScript/TypeScript to replace deprecated long-running operation methods with their newer counterparts. Specifically, the codemod should:

## Upgrade Azure SDK Long-Running Operation Method Calls to the new paradigm


Previously (libraries generated with AutoRest), each LRO exposed two methods (e.g., beginStart and beginStartAndWait). Now (libraries generated from TypeSpec), there’s a single method that behaves as a poller and can be directly awaited.

An example of the old and new method signatures is as follows:

```ts
// v6

beginStart(
    options?: IntegrationRuntimesStartOptionalParams,
  ): Promise<
    SimplePollerLike<
      OperationState<IntegrationRuntimesStartResponse>,
      IntegrationRuntimesStartResponse
    >
  >;
beginStartAndWait(
    options?: IntegrationRuntimesStartOptionalParams,
  ): Promise<IntegrationRuntimesStartResponse>;

// v7

start(options?: IntegrationRuntimesStartOptionalParams): PollerLike<
      OperationState<IntegrationRuntimesStartResponse>,
      IntegrationRuntimesStartResponse
    >;
```

Migration looks like this:

```ts

// Before (AutoRest-generated)
const result = await beginStartAndWait();

const poller = await beginStart();
poller.onProgress((state) => console.log(`Progress: ${state.percentComplete}%`));
const result2 = await poller.pollUntilDone();

// After (TypeSpec-generated)
const result = await start();           // awaiting returns the final result

const poller = start();                 // direct access to the poller
await poller.submitted();               // optional: await initial submission
poller.onProgress((state) => console.log(`Progress: ${state.percentComplete}%`));
const result2 = await poller;           // or: await poller.pollUntilDone()
```

## Migrate flattened properties to nested properties in parameters

Previously, libraries generated with AutoRest supported the x-ms-client-flatten extension, which allowed deeply nested payloads to be flattened into a top-level object structure. 

An example of the old and new  signatures is as follows:

```ts
// v6

/** An HCX Enterprise Site resource */
export interface HcxEnterpriseSite extends ProxyResource {
  /**
   * The provisioning state of the resource.
   * NOTE: This property will not be serialized. It can only be populated by the server.
   */
  readonly provisioningState?: HcxEnterpriseSiteProvisioningState;
  /**
   * The activation key
   * NOTE: This property will not be serialized. It can only be populated by the server.
   */
  readonly activationKey?: string;
  /**
   * The status of the HCX Enterprise Site
   * NOTE: This property will not be serialized. It can only be populated by the server.
   */
  readonly status?: HcxEnterpriseSiteStatus;
}

// v7

/** An HCX Enterprise Site resource */
export interface HcxEnterpriseSite extends ProxyResource {
  /** The resource-specific properties for this resource. */
  properties?: HcxEnterpriseSiteProperties;
}

/** The properties of an HCX Enterprise Site */
export interface HcxEnterpriseSiteProperties {
  /** The provisioning state of the resource. */
  readonly provisioningState?: HcxEnterpriseSiteProvisioningState;
  /** The activation key */
  readonly activationKey?: string;
  /** The status of the HCX Enterprise Site */
  readonly status?: HcxEnterpriseSiteStatus;
}
```

Migration looks like this:

```ts

// Before (AutoRest-generated)
const result = await client.hcxEnterpriseSites.get("resourceGroupName", "privateCloudName", "hcxEnterpriseSiteName");
console.log(result.activationKey);

// After (TypeSpec-generated)
const result = await client.hcxEnterpriseSites.get("resourceGroupName", "privateCloudName", "hcxEnterpriseSiteName");
console.log(result.properties?.activationKey);
```