# Visión del producto: App de gestión para tambos chicos
### Documento de trabajo — etapa de investigación

---

## 1. Para quién es esto (ICP)

- Tambos de **hasta 20 bajadas**, no robotizados
- Productor que en general **hace todo solo o con muy poco personal**
- **Sin caravana con chip** — identificación de animales es visual, por número
- Conectividad **limitada o inexistente** en el momento del ordeñe
- Muchos dueños **no viven en el tambo**, ya invierten en monitoreo remoto (cámaras)
- Clientes actuales o potenciales de **Lobeto Tambos** (fabricante de ordeñadoras y equipos de frío, service en zona Lincoln, Pcia. Buenos Aires)
- Usuario final **solo habla español** y suele tener **poca familiaridad con apps** → UI en español llano, pocos pasos, sin jerga técnica (ver `docs/ux-usuario.md`)

## 2. Por qué existe una oportunidad (research hasta ahora)

Los competidores relevados (VISUAL Tambo, Uniform-Agri, Infotambo, Gestambo, DIRSA, tambero.com) apuntan mayormente a:
- Tambos medianos/grandes o cooperativas
- Uso con asesoramiento veterinario constante
- Interfaces de escritorio o carga posterior al trabajo, no en el momento del ordeñe

**Ninguno resuelve, al mismo tiempo:**
- Identificación sin chip (carga 100% manual del número de caravana)
- Carga de datos con las manos ocupadas, en el momento exacto del ordeñe
- Offline real en el punto de uso
- Integración con datos del equipo de ordeñe (porque ningún competidor de software fabrica máquinas)

**Nuestra ventaja estructural:** Lobeto Tambos fabrica el equipo, da service, y ya tiene la confianza de los clientes en la zona. Eso es un canal de distribución y una base de confianza que ningún competidor de software puro puede replicar rápido.

## 3. Roles del sistema

| Rol | Qué necesita | Contexto de uso |
|---|---|---|
| **Tambero** | Cargar datos rápido, manos libres, sin conexión | En el momento del ordeñe, con las manos ocupadas — puede haber 2-3 personas cargando a la vez desde distintos dispositivos |
| **Dueño** | Visibilidad remota, alertas, no operar el día a día | Muchas veces lejos del tambo, con conexión normal — puede tener más de un tambo |
| **Admin** | Configuración general | Rol independiente en el modelo; en la práctica muchas veces la misma persona que el dueño, resuelto en el frontend, no colapsado en el backend |
| **Veterinario** | Ver historial sanitario/reproductivo, cargar en visitas puntuales | Acceso periódico, no diario |
| **Técnico** | Ver equipo del tambo + atender solicitudes de service | Actor **externo** (no es gente del tambo); invitado a tambos puntuales. Puede ser de Lobeto u **otros fabricantes** — no modelamos “pertenece a una sola empresa” |

Los roles son independientes en el modelo de datos (un mismo Membership puede tener varios roles asignados). El técnico se invita por email/teléfono a un tambo; no ve animales ni producción. Cómo se combinan en la práctica se resuelve en el frontend/configuración, no colapsando roles en el backend.

## 4. Diferenciadores clave (validados o hipotéticos)

- **Carga por voz** con soporte físico tipo collar/arnés para el celular — resuelve manos ocupadas sin hardware nuevo, sin batería que gestionar
- **Offline-first real** en el punto de carga
- **Identificación simple sin chip** — UI pensada para carga rápida por número visual
- **Datos del equipo de ordeñe** (vacuómetro digital, sensor de bomba de vacío) — nadie en el mercado lo tiene
- **Confianza de marca heredada** de Lobeto Tambos como fabricante

---

## FASE 1 — MVP (lo que se valida y construye primero)

**Hipótesis a validar en entrevistas (en curso):** el dolor más grande y con mayor disposición a pagar es la carga de datos básicos en el momento del ordeñe.

**Alcance:**
- Registro de producción: **litros totales por sesión de ordeñe** (turno mañana/tarde, por tambo) — no desagregado por bajada ni por animal, porque sin caudalímetro eso no se puede medir de forma confiable
- Control lechero periódico (cada ~6 meses): producción por animal por bajada, evento independiente de la carga diaria, con estructura pensada para eventualmente compartir forma con datos futuros de caudalímetro
- Reconciliación de entrega de leche: litros medidos por el equipo de frío en el período vs. litros que declara el camión que retira, **más temperatura de entrega registrada por ambas partes** (para resolver diferencias de "plus por temperatura" y detectar fallas del equipo de frío a tiempo)
- Registro sanitario básico (mastitis, tratamientos, período de retiro de leche) — siempre por animal individual
- Registro reproductivo básico (celos, servicios, fechas estimadas de parto) — siempre por animal individual
- Identificación por número de caravana visual
- Carga por voz con soporte físico para el celular (eventos sanitarios/reproductivos por animal, no depende de ningún hardware)
- Funcionamiento offline con sincronización posterior — incluye cache local de tratamientos activos con retiro de leche vigente, no solo la carga de datos nuevos
- Soporte para múltiples dispositivos simultáneos en la sala de ordeñe (2-3 personas cargando a la vez), cada evento con trazabilidad de qué usuario lo generó
- Rol tambero + rol dueño (panel simple, aún sin sensores de equipo)

**Explícitamente afuera de esta fase:** costos, sensores de equipo, protocolos reproductivos avanzados, transplante de embriones, analítica compleja.

---

## FASE 2 — Diferenciación con hardware propio

Depende de validación con clientes + desarrollo del ingeniero de Lobeto Tambos.

- **Vacuómetro digital** — visibilidad de vacío correcto para el dueño
- **Sensor de bomba de vacío** — mantenimiento predictivo + registro automático de horario de ordeñe
- **Lectura del controlador de frío (Danfoss EKC 202)** — el EKC 202 admite salida de datos por Modbus o LON-RS485 mediante tarjeta de comunicación adicional; permite registrar temperatura real del tanque con timestamp para: (a) resolver conflictos de "plus por temperatura" con la industria láctea con dato objetivo propio, y (b) generar alertas de service si la temperatura sale de rango antes de perder la leche. **El EKC 101 (más básico) no parece tener esta salida de datos** — en esos casos, evaluar reemplazo por 202 en el próximo recambio, o sensor externo en paralelo. No todos los clientes van a poder tener esta funcionalidad de entrada; depende del modelo de controlador instalado.
- **Gestión de partes y repuestos** (pezoneras, etc.) — alertas de vida útil + pedido directo a Lobeto Tambos
- **Panel del dueño ampliado** — alertas automáticas (bomba no arrancó, vacío fuera de rango), resumen diario, sin necesidad de entrar a mirar todo

## FASE 3 — Capa económica

Depende de que la Fase 1 esté generando datos operativos consistentes (sin datos confiables de producción, sanidad y mano de obra, el cálculo de costos es inútil).

- Costo de producción por litro (referencia metodológica: Costos App de INTA)
- Traducción de indicadores sanitarios a pérdida económica (ej: células somáticas altas → $ perdidos/año, misma lógica que usa INTA)
- Reportes para contador / banco / toma de decisiones
- Comparación entre períodos

---

## 5. Consideraciones de arquitectura (pensar ahora, construir después)

Aunque no se construya todo en Fase 1, el modelo de datos debería dejar previsto desde el día uno:
- Entidad **"equipo de ordeñe"** separada de las entidades de animales, para poder conectar sensores en Fase 2 sin rediseñar
- Estructura que permita vincular **precios e insumos** a eventos ya registrados (producción, tratamientos, mano de obra) para no rehacer nada cuando llegue la Fase 3 de costos
- Diseño offline-first desde el modelo de datos, no como parche posterior

## 6. Pendiente de validación (research en curso)

- Entrevistas a tamberos (guía propia)
- Relevamiento pasivo vía equipo de service (guía service)
- Entrevistas a dueños remotos (guía dueños)
- Confirmación técnica de integración con el caudalímetro del proveedor (protocolo de salida de datos)
- Reacción real de tamberos a la carga por voz y al soporte físico tipo collar
