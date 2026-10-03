# Despliegue GTLT (API en Azure Container Apps)

El **web** se despliega solo en Vercel (integración con Git). No hay workflow de deploy para web ni mobile. El **API** se construye en Azure Container Registry y se publica en el Container App `gtlt-api`.

URL pública del API:

`https://gtlt-api.proudmoss-fef6994b.eastus2.azurecontainerapps.io`

Salud (sin auth): `GET /health` → `{ "ok": true, "service": "gtlt-api" }`.

## Migraciones

`npx prisma migrate deploy` corre **al arrancar el contenedor** (`CMD` del Dockerfile), con el `DATABASE_URL` del secret del Container App. Así no hace falta abrir el firewall de Postgres a GitHub.

Si una migración falla, el proceso termina, la revisión nueva no queda lista y Azure sigue sirviendo la anterior.

El arranque en frío suma **1–3 segundos** por el chequeo de migraciones.

## CI

`.github/workflows/ci.yml` corre en cada PR y en cada push a `main` (api `tsc`, web `npm run build`, mobile `tsc`).

## Deploy automático del API

`.github/workflows/deploy-api.yml` se dispara con push a `main` cuando cambia `apps/api/**` (o el propio workflow) y con `workflow_dispatch`. Un solo deploy a la vez (`cancel-in-progress: false`). Login a Azure con **OIDC** (sin contraseña de service principal). La imagen se tagea con el SHA del commit (no solo `latest`, para forzar revisión nueva). Al final hay smoke test de `/health` con reintentos (~60 s, el app escala a cero).

### Configuración única (una vez)

Los IDs son los de la suscripción actual:

```powershell
$SUB = "395251fb-b530-48ce-a005-7fe86755bb56"
$RG  = "inno-prod-rg"

# 1) App registration + service principal para GitHub
$APP_ID = az ad app create --display-name "gtlt-github-actions" --query appId -o tsv
az ad sp create --id $APP_ID

# 2) Credencial federada: solo la rama main del repo Mlobeto/gtlt
@'
{"name":"gtlt-main","issuer":"https://token.actions.githubusercontent.com","subject":"repo:Mlobeto/gtlt:ref:refs/heads/main","audiences":["api://AzureADTokenExchange"]}
'@ | Out-File -Encoding ascii cred.json
az ad app federated-credential create --id $APP_ID --parameters cred.json

# 3) Permisos mínimos: solo el registry y la app (no todo el resource group)
$ACR_ID = az acr show -n innoprodgtltacr --query id -o tsv
$APP_RES = az containerapp show -n gtlt-api -g $RG --query id -o tsv
az role assignment create --assignee $APP_ID --role Contributor --scope $ACR_ID
az role assignment create --assignee $APP_ID --role Contributor --scope $APP_RES

# 4) Datos para los secrets de GitHub
az account show --query "{tenantId:tenantId, subscriptionId:id}" -o json
$APP_ID
```

En GitHub → **Settings → Secrets and variables → Actions**, crear:

- `AZURE_CLIENT_ID` (= `$APP_ID`)
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Si el deploy falla por permisos al actualizar el Container App, sumar el rol **Reader** sobre el Managed Environment `inno-prod-cae`.

La credencial federada cubre **solo `main`**. `workflow_dispatch` tiene que correr desde esa rama.

## Logs

```powershell
az containerapp logs show --name gtlt-api --resource-group inno-prod-rg --follow
```

## Rollback

Los SHA quedan en el registry. Volvé a una imagen anterior:

```powershell
az containerapp update --name gtlt-api --resource-group inno-prod-rg --image innoprodgtltacr.azurecr.io/gtlt-api:<sha-anterior>
```

## Vercel (web)

El web se despliega solo en Vercel. Cargá `VITE_API_URL` (la URL pública del Container App) en **Production** y **Preview**.

## Deploy manual (si GitHub Actions no está configurado)

```powershell
az acr build --registry innoprodgtltacr --image gtlt-api:<tag> --image gtlt-api:latest ./apps/api
az containerapp update --name gtlt-api --resource-group inno-prod-rg --image innoprodgtltacr.azurecr.io/gtlt-api:<tag>
```

Usá un tag distinto de `latest` (por ejemplo el SHA) para que Azure cree una revisión nueva.
