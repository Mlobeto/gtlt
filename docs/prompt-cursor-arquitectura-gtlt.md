# Prompt para Cursor — Diseño de arquitectura GTLT

Copiá y pegá esto en Cursor (chat o composer) como punto de partida. Está pensado para pedir **diseño de arquitectura**, no código de producción todavía.

---

## PROMPT

Estoy diseñando la arquitectura de **GTLT (Gestión Tambera Lobeto Tambos)**, una aplicación SaaS multitenant para la gestión operativa de tambos chicos (hasta 20 bajadas, no robotizados) en Argentina. Todavía estoy en etapa de diseño de arquitectura, no quiero que generes código de producción todavía — quiero que pensemos juntos la estructura antes de escribir nada.

### Contexto de negocio

- Cada tenant es un tambo individual (o un pequeño grupo de tambos de un mismo dueño)
- Usuarios con roles distintos por tenant: **tambero** (carga datos operativos), **dueño** (visibilidad, puede o no estar físicamente en el tambo), **admin** (configuración, en tambos chicos suele ser la misma persona que el dueño), **veterinario** (acceso de lectura + carga puntual en sus visitas)
- Restricción crítica: **el tambero va a cargar datos en el momento del ordeñe, con las manos ocupadas, y muchas veces sin conexión a internet.** La app tiene que funcionar 100% offline en el punto de carga y sincronizar después.
- Los animales se identifican **por número de caravana visual, sin chip RFID** — no hay lectura automática de identidad todavía.
- Fase futura (no ahora, pero el modelo de datos debería dejar lugar): integración con hardware propio — vacuómetro digital, sensor de bomba de vacío, caudalímetro de un proveedor externo. Necesito que la arquitectura no me obligue a rediseñar cuando llegue esa fase.
- Fase futura también: módulo de costos de producción, que va a consumir datos ya cargados en fase 1 (producción, sanidad, mano de obra) — no necesita entidades nuevas grandes, pero sí que los datos operativos existentes queden bien modelados desde ahora para poder calcular costos sobre ellos después.

### Stack ya definido (no lo cambies, diseñemos sobre esto)

- Backend: Node.js
- ORM / base de datos: Prisma sobre **PostgreSQL** en el servidor (es lo que uso habitualmente y quiero mantenerlo salvo que haya una razón de peso para no hacerlo). Sí quiero que analicemos qué pasa del lado del cliente/mobile para el caso offline-first — ahí no está cerrado si conviene algo tipo SQLite local u otra solución, y cómo eso convive con Postgres del lado del servidor.
- Frontend web: React + Redux + Tailwind
- App móvil: React Native con Expo
- Ya tengo experiencia con este stack en otro SaaS multitenant (GestionProp, para inmobiliarias), así que podés asumir que conozco los fundamentos de Node/Prisma/React — no hace falta explicarme conceptos básicos, sí quiero que pensemos las decisiones específicas de este dominio.

### Lo que necesito que diseñemos juntos, en este orden

1. **Estrategia de multitenancy sobre PostgreSQL**: dado que son tambos chicos (posiblemente cientos de tenants pequeños, no pocos tenants grandes), ¿shared database con `tenant_id` (con o sin Row Level Security de Postgres), schema-per-tenant, o algo híbrido? Quiero que me des ventajas/desventajas aplicadas a este caso puntual — volumen esperado, costo operativo de mantener muchos schemas si son cientos de tambos chicos, y cómo cada opción impacta la complejidad de la sincronización offline — no una explicación genérica.

2. **Estrategia offline-first para la app móvil**: esto es lo más crítico y menos parecido a lo que hice en GestionProp (que era 100% online). Necesito que propongamos cómo el tambero carga datos sin conexión y cómo se sincronizan después sin conflictos — pensando en que la mayoría de los registros son "eventos" (una carga de producción, un evento sanitario) más que ediciones concurrentes del mismo dato. Quiero opciones concretas (¿WatermelonDB, SQLite local + cola de sync, algo con Prisma también en el cliente?) con trade-offs.

3. **Modelo de datos inicial (Fase 1)** para estas entidades, pensando en multitenancy y en dejar espacio para las fases futuras que mencioné:
   - Tenant (tambo)
   - Usuario + Rol (tambero, dueño, admin, veterinario) por tenant
   - Animal (identificado por número de caravana, sin chip)
   - Registro de producción (por bajada, por animal si es posible)
   - Evento sanitario (tratamiento, mastitis, período de retiro de leche)
   - Evento reproductivo (celo, servicio, fecha estimada de parto)
   - Una entidad "Equipo de ordeñe" separada, vacía de funcionalidad por ahora, pero lista para conectar sensores en el futuro

4. **Autenticación y permisos multitenant**: cómo estructurar el control de acceso por rol y por tenant, pensando en que un mismo usuario (ej: un dueño) podría eventualmente tener más de un tambo.

5. **Estructura de carpetas/monorepo** sugerida para manejar backend + web + mobile compartiendo tipos y lógica donde tenga sentido (Prisma types, validaciones, etc.)

### Qué NO quiero todavía

- No generes el schema completo de Prisma todavía, quiero discutir las decisiones de arquitectura primero
- No implementes autenticación ni ninguna pantalla
- No diseñes el módulo de costos ni la integración de sensores en detalle — solo dejá señalado en el modelo dónde van a enganchar

### Formato de respuesta que espero

Quiero que me respondas en formato de documento de arquitectura: decisiones propuestas, alternativas consideradas y por qué se descartan, y preguntas abiertas que necesito responder yo antes de avanzar. Si hay algo ambiguo en lo que te conté, preguntame en vez de asumir.

---

## Notas para vos (no es parte del prompt)

- Llevá este prompt a Cursor recién cuando tengas resultados de al menos algunas entrevistas — la arquitectura offline-first en particular puede cambiar según lo que confirmes sobre conectividad real en los tambos.
- El punto 2 (offline-first) es el que más se aleja de tu experiencia previa con GestionProp — dedicale tiempo extra a entender las opciones antes de decidir, es la pieza más riesgosa técnicamente de todo el proyecto.
- Guardá la respuesta de Cursor en un documento aparte (por ejemplo `docs/arquitectura.md` en el repo) para tener trazabilidad de las decisiones y por qué se tomaron.
