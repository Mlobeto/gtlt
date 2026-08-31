import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  nodeEnv: process.env.NODE_ENV ?? "development",
  /// Storage de fotos (Azure Blob Storage). Opcional: si falta, /uploads/photo responde 503.
  azureStorageAccountName: process.env.AZURE_STORAGE_ACCOUNT_NAME ?? null,
  azureStorageContainer: process.env.AZURE_STORAGE_CONTAINER_NAME ?? "gtlt-photos",
};
