import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";
import { HttpError } from "./http-error.js";

let containerClient: ContainerClient | null = null;

/**
 * Managed identity en Azure (Container App) / az CLI login en desarrollo local
 * (`DefaultAzureCredential` prueba ambas). Sin API keys guardadas en ningún lado.
 */
function getContainerClient(): ContainerClient {
  if (!env.azureStorageAccountName) {
    throw new HttpError(503, "Photo storage not configured (AZURE_STORAGE_ACCOUNT_NAME)");
  }
  if (!containerClient) {
    const service = new BlobServiceClient(
      `https://${env.azureStorageAccountName}.blob.core.windows.net`,
      new DefaultAzureCredential(),
    );
    containerClient = service.getContainerClient(env.azureStorageContainer);
  }
  return containerClient;
}

/** Sube una imagen y devuelve su URL pública en Blob Storage. */
export async function uploadImage(
  tenantId: string,
  buffer: Buffer,
  contentType: string,
  extension: string,
): Promise<string> {
  const container = getContainerClient();
  const blobName = `${tenantId}/${randomUUID()}.${extension}`;
  const blockBlobClient = container.getBlockBlobClient(blobName);
  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
  return blockBlobClient.url;
}
