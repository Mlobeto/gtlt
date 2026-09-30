# GTLT — Sistema de diseño (UI)

Documento vivo de **colores, tipografía, formularios y componentes**.  
Toda pantalla de producto (mobile y web) debe alinearse acá.  
Complementa [ux-usuario.md](./ux-usuario.md) (idioma y simplicidad).

**Última actualización:** 2026-09-29

---

## 1. Principios visuales

1. **Fondo claro / blanco** — legible a la intemperie y con poco brillo.
2. **Verde** = acción principal, marca, confirmación.
3. **Amarillo** = aviso, pendiente, atención (sin alarmar).
4. **Pocas pantallas, mucho aire** — no saturar.
5. **Controles grandes** — dedos / apuro / posible uso con guantes mentales.
6. **Sin jerga visual de “dashboard SaaS”** — evitar púrpura, glows, pills infinitos, sombras pesadas.

---

## 2. Colores

### Paleta principal

| Token | Hex | Uso |
|---|---|---|
| `color.bg` | `#FFFFFF` | Fondo de pantalla |
| `color.bgSubtle` | `#F2F4F5` | Fondos secundarios / listas |
| `color.surface` | `#FFFFFF` | Cards, formularios |
| `color.border` | `#E1E5E8` | Bordes de inputs y separadores |
| `color.text` | `#33383D` | Texto principal |
| `color.textMuted` | `#6B7278` | Ayudas, meta |
| `color.primary` | `#4C9A6A` | Botón principal, links fuertes, éxito (verde de marca) |
| `color.primaryPressed` | `#3D7D57` | Pressed / active del verde |
| `color.primarySoft` | `#E8F2EC` | Fondo de botón secundario / chips ok — **pálido, no saturado** |
| `color.brandDark` | `#123B4F` | Headers, nav, superficies oscuras de marca (nuevo) |
| `color.brandBlue` | `#1F6F8B` | Acentos secundarios, eyebrows, links de apoyo (nuevo) |
| `color.accent` | `#F0C419` | Amarillo — avisos, "falta enviar" (sin cambios) |
| `color.accentSoft` | `#FFF6CC` | Fondo de alerta suave — **pálido, no saturado** |
| `color.accentText` | `#6B5400` | Texto sobre amarillo suave (sin cambios) |
| `color.danger` | `#B42318` | Error / destructivo (sin cambios) |
| `color.dangerSoft` | `#FCEBEA` | Fondo error (sin cambios) |

### Semántica rápida

- **Entrar / Guardar / Confirmar** → verde (`primary`)
- **Enviar / Actualizar / secundario** → borde verde + fondo `primarySoft`, o outline
- **Sin señal / Falta enviar** → amarillo (`accent` / `accentSoft`)
- **Error** → rojo solo cuando bloquea la acción

### CSS variables (web futuro)

```css
:root {
  --color-bg: #ffffff;
  --color-bg-subtle: #f2f4f5;
  --color-surface: #ffffff;
  --color-border: #e1e5e8;
  --color-text: #33383d;
  --color-text-muted: #6b7278;
  --color-primary: #4c9a6a;
  --color-primary-pressed: #3d7d57;
  --color-primary-soft: #e8f2ec;
  --color-brand-dark: #123b4f;
  --color-brand-blue: #1f6f8b;
  --color-accent: #f0c419;
  --color-accent-soft: #fff6cc;
  --color-accent-text: #6b5400;
  --color-danger: #b42318;
  --color-danger-soft: #fcebea;
}
```

Tokens RN: `apps/mobile/src/theme.ts`.

---

## 3. Tipografía

### Familias

| Rol | Mobile (RN) | Web |
|---|---|---|
| UI / cuerpo | System default (San Francisco / Roboto) — legible y familiar | `"DM Sans", system-ui, sans-serif` |
| Títulos (opcional marca) | Misma familia, peso bold | `"Fraunces", Georgia, serif` solo en brand/landing; **no** en formularios del tambero |

> En la app operativa del tambero priorizar **sans del sistema**: máxima claridad. La serif de marca queda para web/marketing.

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
| `radius.sm` | 8 |
| `radius.md` | 12 |
| `radius.lg` | 16 |
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
| Primario | fondo `primary`, texto blanco, full-width en mobile |
| Secundario | fondo `primarySoft` o blanco + borde `primary`, texto `primary` |
| Aviso | fondo `accent` / texto oscuro — solo para CTAs de atención |
| Texto / link | sin borde, color `primary` o `textMuted` |

- Un **primario** por pantalla.
- Separación clara entre “Guardar” (verde) y “Enviar” (secundario).

---

## 6. Componentes de feedback

| Caso | UI |
|---|---|
| Sin señal | chip/banner amarillo suave: “Sin señal” |
| Falta enviar | badge amarillo: “Falta enviar” |
| Éxito | mensaje breve verde/oscuro: “Listo.” |
| Error | caja `dangerSoft` + frase accionable |

Mensajes de feedback **dentro del formulario**, arriba de los botones — nunca tapar “Guardar” / “Enviar” con un toast fijo abajo.

---

## 7. Iconografía e imagen

- Íconos simples, trazo medio; preferir pocos.
- Fotos de animales/piezas: ratio claro, esquinas `radius.md`.
- No depender solo del color (acompañar con texto).
- **Menú mobile (provisional):** emoji nativo en botones grandes (`🐄` Ordeñe, `💊` Tratamiento, `❌` Retiros = leche que no se mezcla) + texto claro. Se puede cambiar después a vector icons o ilustraciones propias.

---

## 8. Accesibilidad rápida

- Contraste texto/fondo AA como mínimo.
- Área táctil ≥ 48×48.
- No transmitir estado solo con color (texto “Falta enviar”).
- Evitar animaciones que distraigan en la carga del ordeñe.

---

## 9. Qué falta definir (abierto)

- [ ] Logo final Lobeto / GTLT y variantes
- [ ] Confirmar tipografía web de marca (¿Fraunces u otra?)
- [ ] Ilustraciones / foto hero si hay landing
- [ ] Modo “alta visibilidad” (texto aún más grande) si entrevistas lo piden

---

## 10. Fuente de verdad en código

| Plataforma | Archivo |
|---|---|
| Mobile | `apps/mobile/src/theme.ts` |
| Web | (pendiente) `apps/web/src/styles/tokens.css` |
| Doc | este archivo |

---

## Changelog

- **2026-09-29** — Paleta alineada a la identidad usada en la presentación para socios — antes verde/amarillo saturado, ahora verde/azul oscuro con tintes pálidos. Colores de advertencia/error sin cambios.
