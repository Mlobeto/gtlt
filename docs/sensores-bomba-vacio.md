# Sensor de arranque de bomba de vacío (Fase 2 — diseño)

Documento de diseño. **No implementado** en API/firmware todavía. Engancha en el gancho `Sensor` / `SensorReading` de [arquitectura.md](./arquitectura.md) y [erd.md](./erd.md).

---

## 1. Separación: hardware vs app

| Capa | Rol |
|---|---|
| **Tablero + módulo** | Detecta ON/OFF (y opcionalmente disparo térmico). Sin esto no hay detector. |
| **Gateway** (WiFi/LTE) | Publica eventos a la API GTLT. |
| **API** | Persiste `SensorReading`, deriva horarios, dispara alertas. |
| **Web dueño** | Ve alertas (“bomba no arrancó”, “apagó temprano”, “disparó térmico”). |
| **App mobile** | **No detecta el motor.** No hace falta que esté abierta. Opcional: mostrar estado “bomba ON” en sala. El tambero sigue cargando litros/eventos a mano. |

La app **no sustituye** el sensor. El celular no “escucha” el arranque.

---

## 2. Qué da el tablero (contactor + llave térmica)

En un arranque directo clásico:

```
Marcha → bobina contactor → contactos de potencia al motor
                         → contacto auxiliar NO del contactor  →  señal “mandado a marchar”
Relé térmico 95-96 (NC) → corta el mando ante sobrecarga
Relé térmico 97-98 (NO) → señal de FALLA / disparo (no de “está corriendo”)
```

| Señal | Origen | Significa para GTLT |
|---|---|---|
| Contacto auxiliar **NO del contactor** | Contactor KM | Mejor proxy de **bomba ON** (contactor energizado) |
| Contactos **95-96** del térmico | Relé térmico | Protección: abre ante sobrecarga |
| Contactos **97-98** del térmico | Relé térmico | **Falla / disparo**, no “motor en marcha” |

**Decisión de diseño:** para horario de ordeñe / “¿arrancó la bomba?” usar el **auxiliar del contactor** (contacto seco hacia el módulo). El térmico se usa aparte para alerta `FAULT_TRIP`.

**Alternativa** si no hay auxiliar libre: pinza de corriente / TC en una fase (amperaje real). Más trabajo de instalación; confirma corriente, no solo mando.

---

## 3. Enfoque concreto (default Lobeto / service)

1. Entrada digital por **contacto seco** del auxiliar NO del contactor de la bomba de vacío.
2. Segunda entrada opcional: **97-98** del térmico → evento `FAULT_TRIP`.
3. Dispositivo: módulo pequeño (MCU + WiFi o LTE) instalado por service Lobeto; independiente del celular del tambero y de Expo Go.
4. Hacia GTLT (cuando se implemente): `POST` autenticado de lecturas, p. ej.:

   - `sensorId`, `tamboId`
   - `type = VACUUM_PUMP_RUN`, `value = 0 | 1`, `at` (ISO)
   - opcional: `type = VACUUM_PUMP_FAULT_TRIP`, `value = 1`

   Auth de dispositivo (device token) se define al implementar Fase 2.

5. Reglas de negocio (backend):

   - Flanco `0 → 1` = inicio de marcha; `1 → 0` = fin.
   - Debounce **5–10 s** (evitar rebotes del contactor).
   - Si hay ventana de ordeñe esperada y no hay ON → alerta dueño (“bomba no arrancó”).
   - El sensor puede **sugerir** horario de `MilkingSession`; **no reemplaza** los litros que carga el tambero.

Fuera de este documento: vacuómetro digital, EKC 202, pedido de partes.

---

## 4. Flujo de datos

```
Contactor auxiliar (ON/OFF)
        ↓
Módulo / gateway Lobeto
        ↓
API → Sensor + SensorReading (tenantId, tamboId, …)
        ↓
├─ Alertas dueño (web)
├─ Opcional: estado en mobile
└─ Enganche: sugerir / enriquecer horario de MilkingSession
```

Modelo previsto (aún no en Prisma): `Sensor` / `SensorReading` con FK a `Tambo` y, si aplica, a `PartInstance` del grupo de ordeñe.

---

## 5. Checklist de relevamiento en campo (service Lobeto)

Usar en 2–3 instalaciones reales antes de fijar firmware/BOM.

### Tablero / motor

- [ ] ¿Arranque **directo**, estrella-triángulo o soft-starter? (cambia dónde tomar la señal)
- [ ] Marca/modelo del **contactor** de la bomba de vacío
- [ ] ¿Queda un contacto auxiliar **NO libre** en el contactor?
- [ ] Si no: ¿se puede agregar bloque auxiliar, o hace falta **TC / pinza de corriente**?
- [ ] Marca/modelo del **relé térmico** (o guardamotor)
- [ ] ¿Están accesibles bornes **97-98** para señal de disparo?
- [ ] Tensión de **circuito de mando** (24 V / 220 V / otra)
- [ ] El módulo usará **contacto seco** (recomendado): confirmar que no se inyecta tensión de mando al MCU sin aislamiento

### Sitio / conectividad

- [ ] ¿Hay **WiFi** estable en la sala / cerca del tablero?
- [ ] Si no: ¿modem **4G/LTE** en el gateway? Cobertura en el punto de instalación
- [ ] Distancia cable desde contactor hasta ubicación segura del módulo
- [ ] Alimentación del módulo (fuente local 5/12/24 V o tomacorriente protegido)
- [ ] Acceso físico seguro (tablero cerrado, IP, humedad)

### Producto / operación

- [ ] Horarios habituales de ordeñe (mañana / tarde) para alertas “no arrancó”
- [ ] ¿Un solo motor de vacío o más de uno por tambo?
- [ ] Contacto del dueño / tambero para prueba de arranque controlada tras instalar

### Validación post-instalación

- [ ] Flanco ON al pulsar marcha (debounce OK)
- [ ] Flanco OFF al parar
- [ ] Prueba de disparo térmico (si se cableó 97-98) sin riesgo innecesario
- [ ] Eventos llegan a API / entorno de prueba GTLT

---

## 6. Pendiente de validación (no bloquea este doc)

- Preferencia final WiFi vs LTE según relevamientos.
- Soft-starter / variador: punto de señal acordado con electricista.
- Umbral de “ventana esperada” de ordeñe (config por tambo).
