import { DefaultAzureCredential } from "@azure/identity";
import { AzureVMwareSolutionAPI } from "@azure/arm-avs";
import type { PrivateCloud } from "@azure/arm-avs";

const SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000000000";
const RESOURCE_GROUP_NAME = "test-resource-group";
const LOCATION = "eastus";
const PRIVATE_CLOUD_NAME = "test-private-cloud";

async function testOperations() {
  const credential = new DefaultAzureCredential();
  const client = new AzureVMwareSolutionAPI(credential, SUBSCRIPTION_ID);

  const privateCloudParams: PrivateCloud = {
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

  const poller = await client.privateClouds.beginCreateOrUpdate(
    RESOURCE_GROUP_NAME,
    PRIVATE_CLOUD_NAME,
    privateCloudParams
  );
  let result = await poller.pollUntilDone();
  console.log(`Private Cloud created: ${result.name}`);

  result = await client.privateClouds.beginCreateOrUpdateAndWait(
    RESOURCE_GROUP_NAME,
    PRIVATE_CLOUD_NAME,
    privateCloudParams
  );
  console.log(
    `Private Cloud created with beginCreateOrUpdateAndWait: ${result.name}`
  );
}

testOperations().catch((err) => {
  console.error("An error occurred during the test operations:", err);
});
