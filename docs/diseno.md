# GTLT — Sistema de diseño (UI)

Documento vivo de **colores, tipografía, formularios y componentes**.  
Toda pantalla de producto (mobile y web) debe alinearse acá.  
Complementa [ux-usuario.md](./ux-usuario.md) (idioma y simplicidad).

**Última actualización:** 2026-10-17

---

## 1. Principios visuales

1. **Fondo crema** — `#EFE8E2`, legible a la intemperie y con poco brillo.
2. **Negro** = acción principal y marca. El verde queda **solo para éxito**.
3. **Amarillo** = acento de marca (fondos, texto sobre negro) y avisos suaves.
4. **Pocas pantallas, mucho aire** — no saturar.
5. **Controles grandes** — dedos / apuro / posible uso con guantes mentales.
6. **Sin jerga visual de “dashboard SaaS”** — evitar púrpura, glows y sombras pesadas.

---

## 2. Colores

### Paleta principal

| Token | Hex | Uso |
|---|---|---|
| `color.bg` / `--color-subtle` | `#EFE8E2` | Fondo de pantalla (crema) |
| `color.bgSubtle` | `#F3EEE9` | Relleno suave dentro de tarjetas |
| `color.surface` | `#FFFEFD` | Cards, formularios |
| `color.border` / `--color-line` | `#E3DAD2` | Bordes y separadores |
| `color.text` / `--color-ink` | `#222222` | Texto principal |
| `color.textMuted` / `--color-ink-muted` | `#5E5750` | Ayudas, meta |
| `color.primary` | `#222222` | Acción principal, selección, links |
| `color.primaryPressed` / `--color-primary-deep` | `#000000` | Pressed del botón negro |
| `color.primaryLight` | `#3A3A3A` | Negro suave decorativo |
| `color.primarySoft` | `#FBEBB8` | Seleccionado, hover de secundario |
| `color.onPrimary` | `#F8D05F` | Texto sobre botón negro (amarillo) |
| `color.brandDark` | `#222222` | Barra lateral, paneles oscuros |
| `color.brandBlue` | `#5E5750` | Acentos secundarios (ya no es azul) |
| `color.accent` | `#F8D05F` | Amarillo de marca: **solo como fondo** o como texto sobre negro |
| `color.accentSoft` | `#FBEBB8` | Fondo de aviso |
| `color.accentText` | `#5B4300` | Texto sobre amarillo suave |
| `color.success` | `#2F7D4A` | Éxito (conectado, activo, “Con señal”) |
| `color.successSoft` | `#DDF0E3` | Fondo de éxito |
| `color.successText` | `#1E5B35` | Texto sobre `successSoft` |
| `color.warning` | `#E3A800` | Advertencia (por vencer) |
| `color.danger` | `#B3261E` | Error / destructivo |
| `color.dangerSoft` | `#F9DEDC` | Fondo error |
| `color.dangerText` | `#8C1D18` | Texto sobre `dangerSoft` (mobile) |
| `color.darkSurface` | `#333333` | Superficie oscura (reservado; etapas 2–4) |
| `color.onDark` | `#FFFFFF` | Texto sobre negro |
| `color.onDarkMuted` | `#D9D2C8` | Texto atenuado sobre negro |

### Contraste (no negociable)

- El amarillo **nunca** es color de texto sobre crema o blanco. Va como fondo (con texto negro / `accentText`) o como texto sobre negro (`onPrimary`).
- El verde **no es de marca**. Solo estados de éxito: conectado, activo, “Con señal”, guardado.

### Semántica rápida

- **Entrar / Guardar / Confirmar** → negro (`primary`) + texto `onPrimary`
- **Secundario** → borde negro + texto `ink` + hover `primarySoft`
- **Seleccionado** → fondo `primarySoft`, borde/texto `primary`
- **Sin señal / Falta enviar** → `accentSoft` + `accentText`
- **Éxito** → `success` / `successSoft` / `successText`
- **Error** → `danger` / `dangerSoft`

### CSS variables (web)

Definidas con `@theme` (Tailwind v4) en `apps/web/src/index.css`. Cada variable genera sus utilidades (`--color-ink` → `text-ink`, `bg-ink`, `border-ink`…).

```css
@theme {
  --color-surface: #FFFEFD;
  --color-subtle: #EFE8E2;
  --color-line: #E3DAD2;
  --color-ink: #222222;
  --color-ink-muted: #5E5750;
  --color-primary: #222222;
  --color-primary-deep: #000000;
  --color-primary-light: #3A3A3A;
  --color-primary-soft: #FBEBB8;
  --color-on-primary: #F8D05F;
  --color-brand-dark: #222222;
  --color-brand-blue: #5E5750;
  --color-accent: #F8D05F;
  --color-accent-soft: #FBEBB8;
  --color-accent-text: #5B4300;
  --color-success: #2F7D4A;
  --color-success-soft: #DDF0E3;
  --color-success-text: #1E5B35;
  --color-warning: #E3A800;
  --color-dark-surface: #333333;
  --color-danger: #B3261E;
  --color-danger-soft: #F9DEDC;
  --font-sans: "DM Sans", system-ui, sans-serif;
  --font-brand: "DM Sans", system-ui, sans-serif;
}
```

Utilidades del web:

| Utilidad | Uso |
|---|---|
| `text-ink` | Texto principal |
| `text-ink-muted` | Ayudas, meta |
| `border-line` | Bordes y separadores |
| `bg-surface` | Cards, formularios |
| `bg-subtle` | Fondo de la app, filas hover |
| `bg-primary` / `text-on-primary` / `hover:bg-primary-deep` | Botón principal (negro + amarillo) |
| `bg-primary-soft` | Selección / hover de secundario |
| `bg-success-soft` / `text-success-text` | Éxito |
| `text-brand-dark` / `text-brand-blue` | Marca, acentos de apoyo |
| `bg-accent-soft` / `text-accent-text` | Avisos |
| `bg-danger` / `bg-danger-soft` | Error / destructivo |

Componentes base: `apps/web/src/components/ui.tsx` (`Card`, `Button`, `Badge`, `Field`, `EmptyState`, `ErrorBanner`, `StatCard`) y `AppShell.tsx`.

Tokens RN: `apps/mobile/src/theme.ts`.

---

## 3. Tipografía

### Familias

| Rol | Mobile (RN) | Web |
|---|---|---|
| UI / cuerpo | System default (San Francisco / Roboto) — legible y familiar | `"DM Sans", system-ui, sans-serif` |
| Títulos | Misma familia, peso bold | `"DM Sans", system-ui, sans-serif` (`--font-brand` = la misma familia; el diseño no usa Fraunces) |

> En la app operativa del tambero priorizar **sans del sistema**: máxima claridad.

### Escala (mobile operativa)

| Token | Size | Peso | Uso |
|---|---|---|---|
| `font.display` | 28 | 700 | Nombre de app / pantalla |
| `font.title` | 22 | 700 | Título de sección / card |
| `font.body` | 18 | 400 | Texto y ayudas |
| `font.label` | 16 | 600 | Labels de campos |
| `font.input` | 18 | 400 | Valor dentro del input |
| `font.button` | 18 | 700 | Texto de botón |
| `font.meta` | 14 | 400 | Estados (“Con señal”) |

### Reglas

- Mínimo cuerpo **16–18** en mobile.
- No usar todo en mayúsculas.
- Line-height cómodo (~1.35) en ayudas.

---

## 4. Espaciado y radio

| Token | Valor |
|---|---|
| `space.xs` | 4 |
| `space.sm` | 8 |
| `space.md` | 12 |
| `space.lg` | 16 |
| `space.xl` | 24 |
| `radius.sm` | 12 |
| `radius.md` | 24 |
| `radius.lg` | 28 |
| `radius.pill` | 999 (botones principales y chips) |
| `touch.min` | 48 (altura mínima de botón/input) |

---

## 5. Formularios

### Campo

- Fondo blanco, borde `color.border`, radio `md`
- Padding vertical generoso (≥ 14)
- Label **arriba** del input (nunca solo placeholder)
- Placeholder en español, ejemplo concreto (“Ej: 101”)
- Texto de ayuda debajo si hace falta (una línea)

### Estados

| Estado | Tratamiento |
|---|---|
| Normal | borde `border` |
| Focus | borde `primary` (2px si se puede) |
| Error | borde `danger` + texto corto debajo |
| Disabled | opacidad ~0.55 |

### Botones

| Tipo | Estilo |
|---|---|
| Primario | fondo `primary`, texto `onPrimary`, full-width en mobile, radio `pill` |
| Secundario | fondo `primarySoft` o superficie + borde `primary`, texto `ink` / `primary` |
| Aviso | fondo `accentSoft` / texto `accentText` |
| Texto / link | sin borde, color `primary` o `textMuted` (nunca amarillo sobre claro) |

- Un **primario** por pantalla.
- Separación clara entre “Guardar” (negro) y “Enviar” (secundario).

---

## 6. Componentes de feedback

| Caso | UI |
|---|---|
| Sin señal | chip/banner amarillo suave: “Sin señal” |
| Falta enviar | badge amarillo: “Falta enviar” |
| Éxito | mensaje breve con `successSoft` / `successText`: “Listo.” |
| Error | caja `dangerSoft` + frase accionable |

Mensajes de feedback **dentro del formulario**, arriba de los botones — nunca tapar “Guardar” / “Enviar” con un toast fijo abajo.

---

## 7. Iconografía e imagen

- Íconos simples, trazo medio; preferir pocos.
- Fotos de animales/piezas: ratio claro, esquinas `radius.md`.
- No depender solo del color (acompañar con texto).
- **Íconos mobile (`src/Icon.tsx`):** PNG blancos en `assets/icons/ic-<nombre>.png`, coloreados con `tintColor`. Nombres: `home`, `vacas`, `ordene`, `sanidad`, `repro`, `entrega`, `control`, `service`, `maquinas`, `cuenta`, `campana`, `microfono`, `flecha-abajo`, `flecha-derecha`, `flecha-izquierda`, `check`, `camara`, `cerrar`, `ubicacion`, `bomba`, `alerta`, `frio`. Uso: `Icon({ name, size, color })`. No usar librerías de íconos ni emojis en el menú de inicio.
- **Anillos de vida útil (`src/Ring.tsx`):** pista `ring-track.png` + avance `ring-005`…`ring-100` (de 5 en 5). Color según estado: OK → `success`, SOON → `warning`, OVERDUE → `danger`. El chip al lado lleva siempre el texto (OK / Cambiar pronto / Para cambiar).
- En el celular, las piezas de ordeñe y frío se llaman **Máquinas** (no "Equipo": en el web "Equipo" son las personas).

---

## 8. Accesibilidad rápida

- Contraste texto/fondo AA como mínimo.
- Área táctil ≥ 48×48.
- No transmitir estado solo con color (texto “Falta enviar”).
- Evitar animaciones que distraigan en la carga del ordeñe.

---

## 9. Navegación mobile

- **`apps/mobile/src/BottomBar.tsx`:** barra fija inferior negra, con esquinas superiores `radius.lg`, cuatro pestañas y un botón amarillo central elevado. Usa `Icon` y los tokens de `theme.ts`; incluye el margen seguro inferior del dispositivo.
- **Dueño o administrador que no ordeña:** Inicio, Vacas, Service al centro, Máquinas y Cuenta.
- **Tambero, veterinario o dueño que también ordeña:** Inicio, Vacas, Dictar al centro, Sanidad y Cuenta.
- Las pestañas reutilizan los mismos manejadores del menú de inicio. Dictar abre la captura de voz solo si el turno ya está activo; no inicia un turno.
- La barra se oculta con el teclado y no aparece en el login, el cambio obligatorio de clave ni para el técnico solo. El contenido desplazable reserva espacio para que su último elemento no quede debajo de la barra; cuando esta está visible, el margen seguro inferior lo gestiona la propia barra.
- La campanita de la franja amarilla abre Avisos y muestra un punto cuando hay notificaciones sin leer.

---

## 10. Qué falta definir (abierto)

- [ ] Logo final Lobeto / GTLT y variantes
- [x] Tipografía web de marca: DM Sans (sin Fraunces)
- [ ] Ilustraciones / foto hero si hay landing
- [ ] Modo “alta visibilidad” (texto aún más grande) si entrevistas lo piden

---

## 11. Fuente de verdad en código

| Plataforma | Archivo |
|---|---|
| Mobile | `apps/mobile/src/theme.ts` |
| Web | `apps/web/src/index.css` (`@theme`) |
| Doc | este archivo |

---

## Changelog

- **2026-10-22** — Barra de navegación inferior mobile por rol, botón central Service/Dictar, ocultamiento con teclado y campanita de Avisos.
- **2026-10-17** — Celular etapa 3: franja amarilla, `Icon`/`Ring`, mosaicos de inicio y anillos en Máquinas. `radius.md` 24.
- **2026-10-17** — Paleta amarillo/negro/crema (etapa 1 del rediseño). `primary` es negro; `onPrimary` amarillo sobre negro; verde solo en tokens de éxito. Radios: sm 12 / md 24 / lg 28 / pill. `--font-brand` = DM Sans.
- **2026-10-03** — Contraste: `primary` pasa a `#3D7D57` (4.9:1 con blanco); el verde del PDF `#4C9A6A` queda como `primaryLight`, solo decorativo. Web: tokens con `@theme` en `index.css` (Tailwind v4 no cargaba `tailwind.config.ts`, que se borró).
- **2026-09-29** — Paleta alineada a la identidad usada en la presentación para socios — antes verde/amarillo saturado, ahora verde/azul oscuro con tintes pálidos. Colores de advertencia/error sin cambios.
