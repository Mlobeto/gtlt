# GTLT Web Dashboard

Panel interno para la persona que desarrolla y mantiene el prototipo GTLT.

## Características

### 🎫 Gestión de Tickets de Soporte
- **Listado** de todos los tickets de soporte por tenant
- **Filtrado** por estado: Abierto, En revisión, En progreso, Cerrado
- **Visualización detallada** con descripción completa, categoría y prioridad
- **Actualización** de estado e incorporación de notas internas (solo para DUENIO/ADMIN)
- **Asignación de prioridad** (LOW, MEDIUM, HIGH, URGENT)
- **Identificación del usuario** que reportó el problema y tambo asociado

### ⚙️ Configuración del Prototipo
- **Listado** de versiones del prototipo disponibles
- **Indicador visual** de versión activa (verde)
- **Creación** de nuevas versiones con:
  - Nombre descriptivo
  - Número de versión
  - URL del repositorio de código
  - URL del prototipo en producción
  - Notas internas (testing, cambios, credenciales demo)
- **Activación/desactivación** de versiones
- **Enlaces directos** a código y prototipo en vivo

## Requisitos

- Node.js 24 LTS
- npm 10+

## Instalación

```bash
npm install
```

## Variables de Entorno

Crear archivo `.env` (basado en `.env.example`):

```env
VITE_API_URL=http://localhost:3001
```

Para producción, cambiar la URL según el servidor API.

## Desarrollo

```bash
npm run dev
```

Acceso: http://localhost:5173

**Demo credentials:**
- Email: `admin@gtlt.local`
- Password: `demo1234`

## Build para Producción

```bash
npm run build
```

Los archivos optimizados se generan en la carpeta `dist/`.

## Estructura del Proyecto

```
src/
  App.tsx                    # Punto de entrada (login → dashboard)
  main.tsx                   # Renderizado de React
  index.css                  # Estilos Tailwind
  
  types/
    auth.ts                  # Tipos AuthToken
    dashboard.ts             # Tipos SupportTicket, AppPrototypeConfig
  
  lib/
    api.ts                   # Cliente HTTP (todos los endpoints)
  
  pages/
    LoginPage.tsx            # Formulario de login
    DashboardPage.tsx        # Contenedor principal con tabs
  
  components/
    TicketsTab.tsx           # Gestión de tickets
    PrototypeTab.tsx         # Gestión de versiones del prototipo

dist/                        # Build de producción (generado)
```

## Flujo de Autenticación

1. Usuario ingresa email y contraseña en `LoginPage`
2. API valida credenciales en `POST /auth/login`
3. Respuesta contiene JWT con roles, tenantId, userId
4. Token se almacena en localStorage (clave: `gtlt_auth`)
5. Componentes usan token en header `Authorization: Bearer <token>`
6. Al desloguear, se limpia localStorage y vuelve a `LoginPage`

## Roles y Permisos

### DUENIO / ADMIN
- Acceso completo al panel
- Visualizar todos los tickets del tenant
- Actualizar estado, prioridad y notas de tickets
- Crear y activar nuevas versiones del prototipo
- Ver todas las configuraciones

### DESARROLLADORA
- Acceso al panel
- Visualizar tickets del tenant (lectura)
- Crear nuevas versiones del prototipo
- Ver todas las configuraciones
- **No puede** modificar estado de tickets

### VETERINARIO
- Acceso al panel (lectura)
- Visualizar configuraciones
- **No puede** crear ni modificar nada

## API Endpoints Utilizados

### Autenticación
- `POST /auth/login` → Obtener JWT
- `GET /auth/me` → Datos del usuario actual

### Tickets
- `GET /support-tickets?status=...` → Listar tickets
- `PATCH /support-tickets/:id` → Actualizar ticket

### Prototype Config
- `GET /app-prototype-config` → Listar versiones
- `POST /app-prototype-config` → Crear nueva versión
- `PATCH /app-prototype-config/:id` → Activar/desactivar

## Estilos

Utiliza **Tailwind CSS v4** con configuración minimalista:
- Sin colores customizados (usa paleta por defecto)
- Responsive mobile-first
- Badges de colores para estado y prioridad:
  - Prioridad: azul (LOW), amarillo (MEDIUM), naranja (HIGH), rojo (URGENT)
  - Estado: verde (OPEN), azul (IN_REVIEW), amarillo (IN_PROGRESS), gris (CLOSED)

## Desarrollo Futuro

- [ ] Toast notifications para feedback visual
- [ ] Paginación en listados largos
- [ ] Búsqueda y filtros avanzados
- [ ] Exportación de reportes
- [ ] Dashboard de métricas (tickets por categoría, tiempo de resolución)
- [ ] Integración con Slack/webhooks para notificaciones
- [ ] Autorizaciones más finas por tambo (multitenancy tier 2)

## Documentación Relacionada

- [arquitectura.md](../docs/arquitectura.md) — Visión de sistema completo
- [reglas-negocio-app.md](../docs/reglas-negocio-app.md) — Validaciones de negocio

  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
