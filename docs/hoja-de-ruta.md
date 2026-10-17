# Hoja de ruta de CAL

Complementa `roles-de-cal.md` (qué hace cada rol) y `catalogo-de-piezas-inicial.md` (qué cargar en el catálogo de producción).

## 1. Orden de los próximos prompts

| # | Prompt | Qué incluye |
|---|---|---|
| 1 | **Dueño con acceso por tambo** | Titular y administradores: un dueño puede tener acceso a todos sus tambos o solo a algunos. El titular da y quita accesos y es el único que ve el costo |
| 2 | **Veterinario y notas del animal** | Menú reducido a las fichas de animales; acceso por celular y web; notas del tambero y del veterinario en una sola línea de tiempo; tareas para el tambero; tratamientos en la ficha; convertir una nota en tratamiento |
| 3 | **Panel de las empresas socias** | Un usuario por empresa (Lobeto, Omega); lista de técnicos sin cuenta; períodos de historia; cotización e informe de service enviados al dueño y no al tambero; "pedir service a otro proveedor"; la desarrolladora define el proveedor predeterminado al crear el tambo |
| 4 | **Panel de la desarrolladora** | Errores del sistema y de los dispositivos; pruebas de hardware; vista de actividad de service (solo lectura) |
| 5 | **Centro de notificaciones (web y app)** | Campanita y contador, actualización automática mientras está abierta, avisos por rol según la tabla de `roles-de-cal.md`. Incluye el ajuste del modelo para avisar a las empresas socias y a la desarrolladora |
| 6 | **Próximo APK** | Aviso al celular aunque la app esté cerrada, audio real con transcripción y reducción de fotos antes de subirlas. Se agrupan porque los tres necesitan módulos nativos |

**Cómo se conecta el centro de notificaciones con el resto:** cada prompt anterior deja definido qué evento se avisa y a quién, y el centro los muestra al final.

## 1b. Rediseño visual (amarillo, negro y crema)

Diseño aprobado en el lienzo "CAL · Estilo amarillo y negro" (celular: Hoy del dueño, Máquinas, Hoy del tambero, Dictar una nota; web: panel del dueño y de la desarrolladora, **sin barra lateral**, con navegación arriba).

| Etapa | Qué incluye | Estado |
|---|---|---|
| 0 | Logo nuevo: 3 referencias en el código (celular, barra del web, entrada del web) | Archivos copiados; **falta cambiar las referencias** |
| 1 | Paleta, radios y estados (`theme.ts` e `index.css`) | Aplicado |
| 2 | Componentes: tarjetas, chips, anillos de progreso, pestañas con solapa, tarjetas oscuras | Se escribe con el código de la etapa 1 aplicado |
| 3 | Celular: barra inferior con botón central (Service para el dueño, Dictar para el tambero) | Pendiente |
| 4 | Web: navegación arriba en vez de la barra lateral, y "Hoy" con todo a la vista | Pendiente |
| APK | Ícono nuevo (negro sobre amarillo), pantalla de inicio y fuente DM Sans en el celular | Junto al próximo APK |

**Lo que muestra el diseño y todavía no existe como función:** las notas de los animales (tambero y veterinaria), las tareas de la veterinaria, el botón de dictar con voz y la línea de tiempo del tambo. En las etapas 2 a 4 solo se muestra lo que ya existe; esas tarjetas se suman cuando se construyan esas funciones.

## 2. Listo para aplicar

- **Prompt Q (invitación con enlace):** dos mensajes y un enlace de un toque. Antes de aplicarlo, cargar la dirección pública del web (`EXPO_PUBLIC_WEB_URL`) en `apps/mobile/.env` y en `eas.json`.

## 3. En pausa o para rehacer

- **Prompt P (aviso por mail al proveedor):** en pausa. Se retoma si más adelante se quiere mail para urgentes.
- **Prompt K1 (empresas de service):** se rehace con los roles definidos en la versión 3. Queda absorbido por el punto 3 de arriba.

## 4. Pendiente de operación (no es código)

- **Limpieza de producción:** retirar el dispositivo de prueba de la bomba, borrar sus eventos falsos y rotar la contraseña de la base de datos.
- **Fotos:** borrar los archivos de prueba de `gtlt-photos` y abrir el contenedor con acceso por dirección y sin listado.
- **Copia de la clave de firma del celular** (`npx eas-cli credentials`), guardada fuera del repositorio.
- **Catálogo de producción:** cargar los tipos y campos desde el panel (no se corre el seed en producción).
- **Dominio propio para CAL:** registrar uno. `cal.com` pertenece a otra empresa. Incluir en la verificación de marca del INPI, porque existe un producto de software conocido con ese nombre.
- **Reducir las fotos antes de subirlas** (módulo nativo, va en el próximo APK).
- **Versión visible en "Cuenta":** línea con la actualización y el servidor al que se conecta la app (prompt chico).
- **Probar con una persona real:** el diseñador o un tambero, con su usuario propio.

## 5. Decisiones tomadas (resumen)

- El dueño no crea tambos: los crea la desarrolladora, y el cobro es por tambo **activo**.
- Los técnicos que no son socios no tienen cuenta ni acceso.
- Ser socio de servicio es un estado que da la desarrolladora; hoy lo tienen Lobeto Tambos y Omega.
- Las empresas socias ven solo la historia de los períodos en que fueron el proveedor.
- El dueño y el administrador son el mismo rol; el titular maneja los accesos y la facturación.
- El tambero no ve cotizaciones ni informes de service.
- El veterinario ve solo lo del animal; el dueño ve siempre todas las notas.
