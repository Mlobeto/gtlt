# App mobile (CAL) — builds de Android y actualizaciones

La app se construye con **EAS** (servicio de Expo). Solo Android por ahora.

- Perfil `preview`: genera un **APK** que se instala con un link. Es el que usamos para el piloto.
- Perfil `production`: genera un **app bundle** para Google Play (todavía no se usa).

Todos los comandos se corren desde `apps/mobile`.

## 1. La primera vez

```powershell
npm install -g eas-cli
eas login               # cuenta de Expo
eas init                # crea el proyecto en Expo y agrega extra.eas.projectId a app.json
eas update:configure    # agrega updates.url a app.json
git add -A; git commit -m "EAS: proyecto y updates"
npm run build:android   # primer APK (perfil preview)
```

`eas init` y `eas update:configure` modifican `app.json`: commiteá ese cambio.

Al terminar el build, EAS muestra un link y un QR para bajar el APK.

## 2. Instalar el APK en un celular Android

1. Abrí el link del build en el celular (o escaneá el QR).
2. Tocá **Instalar**. Si Android avisa que el navegador no puede instalar apps, entrá a la configuración que te ofrece y activá **"Permitir de esta fuente"** (instalar apps de orígenes desconocidos) para ese navegador.
3. Volvé atrás e instalá. La app aparece como **CAL**.

## 3. ¿Actualización OTA o build nuevo?

**Alcanza con una actualización OTA** (sin reinstalar) cuando el cambio es solo de JavaScript/TypeScript: pantallas, textos, lógica, estilos.

```powershell
npm run update:preview -- "Arreglo del listado de retiros"
```

La app la baja sola al abrirse (se aplica en la apertura siguiente).

**Hace falta un build nuevo** (`npm run build:android`) y reinstalar cuando cambia algo nativo:

- se agrega, saca o actualiza una dependencia con código nativo (cualquier `expo-*` o librería de React Native);
- cambian permisos;
- cambia `app.json` (nombre, íconos, plugins, versión).

## 4. Antes de `eas build`: todo commiteado

EAS construye **desde git**: lo que no está commiteado no entra en el build. Corré `git status` y commiteá antes de lanzar el build.

## 5. Credenciales de firma (keystore)

En el primer build, EAS genera y guarda la **clave de firma** de Android. Bajá una copia y guardala en un lugar seguro (gestor de contraseñas o similar, nunca en el repo):

```powershell
eas credentials   # Android → Keystore → Download
```

Sin esa clave no se puede actualizar la app ya instalada: un APK firmado con otra clave no se instala encima.

## 6. Dependencias nativas nuevas = reinstalar

El `runtimeVersion` sale de la versión de la app (`"policy": "appVersion"`). Si agregás una dependencia nativa, subí `version` en `app.json` (por ejemplo `1.0.0` → `1.1.0`) y hacé un build nuevo: las actualizaciones OTA solo llegan a los APK con el mismo runtime, así que hay que **reinstalar el APK** en los celulares.
