# UX e idioma — usuario final GTLT

## Quién usa la app

Principalmente **tambero** y **dueño** en zona rural argentina. Asumimos:

- Solo habla **español**
- Poca costumbre de apps complejas
- Usa el celular con las manos ocupadas / con apuro
- A veces sin señal

## Reglas

1. **Español en todo** lo que ve el usuario (UI, mensajes, notificaciones, emails futuros).
2. **Palabras simples.** Preferir el vocabulario del tambo: caravana, ordeñe, retiro de leche, tratamiento.
3. **Una acción clara por pantalla.** No menús densos ni opciones avanzadas al frente.
4. **Botones grandes** y texto legible a la luz del día / con guantes mentales (dedos gruesos, apuro).
5. **Estados sin inglés técnico:**

| Evitar | Usar |
|---|---|
| Sync / Pending / Offline | Enviar / Falta enviar / Sin señal |
| Login / Logout | Entrar / Salir |
| Error 401 / Network failed | No se pudo entrar / No hay conexión |
| API / Token / Cache | (no mostrar) |

6. **Errores accionables:** qué pasó + qué puede hacer (“Reintentá” / “Revisá el número de caravana”).
7. **Offline transparente:** puede guardar siempre; avisar con calma si “falta enviar” cuando vuelva la señal.
8. Código interno, logs y docs técnicas pueden estar en español/inglés mixto; **la app del usuario, no**.

## Roles y tono

- **Tambero:** ultra simple, carga rápida, casi sin configuración.
- **Dueño:** claro y breve; resúmenes, no tableros densos al inicio.
- **Veterinario:** un poco más de detalle sanitario, pero igual en español llano.

## Equipo de ordeñe y frío (partes)

**Decisión:** la carga y el reemplazo de piezas (`PartInstance`, equipo de frío) se hacen desde la **app mobile**, en el lugar. Pueden hacerlo el **tambero o el dueño** (quien esté en el tambo). La web dueño, más adelante, es para mirar alertas y pedidos, no para el alta primaria.

## Ficha animal — preñez y pariciones

**Decisión:** no hay entidad “periodo de preñez”. En la ficha se muestra un **resumen derivado** de `ReproEvent`:

- Preñada ≈ último **servicio** sin **parición** ni **aborto** posterior.
- Parto estimado ≈ evento `EXPECTED_CALVING` / campo del servicio, o ~280 días desde el servicio.
- Pariciones y abortos aparecen en el **historial** como eventos (`CALVING`, `ABORTION`).

La carga sigue siendo en Repro (celo, servicio, parto estimado, parición).

---

## Activación por voz durante el ordeñe — decisión de producto

**Estado:** decisión cerrada para el spike. Sujeta a ajuste según resultado de la prueba con wake word en español + ruido real.

### Problema

El tambero necesita cargar eventos (sanitarios, reproductivos) con las manos ocupadas, durante el ordeñe, sin mirar la pantalla. El micrófono no puede estar grabando o transcribiendo de forma continua durante las 2+ horas del turno — consumo de batería, falsos positivos por ruido de sala (bombas, animales, agua), y privacidad.

### Decisión: Modo Ordeñe + palabra clave (wake word)

**Flujo:**

1. El tambero abre la pantalla de ordeñe y toca **"Empezar turno"**.
2. Con el turno activo, la app arma la escucha de una **palabra clave** (wake word) — liviana, offline, bajo consumo. No transcribe ni graba nada hasta que se detecta la palabra.
3. Al escuchar la palabra clave, se abre una ventana corta de captura (3–5 segundos) donde el tambero dice el comando completo (ej: "101 posible mastitis").
4. El sistema interpreta el comando y muestra una **confirmación en pantalla** (ej: "¿Vaca 101, mastitis?").
5. El evento confirmado se guarda en el outbox local, igual que el resto de las cargas offline.
6. Al terminar el turno, el tambero toca **"Terminar turno"** y la escucha de wake word se apaga por completo. Fuera del turno, el micrófono no queda activo bajo ninguna circunstancia.

**Plan B sin voz, dentro del mismo Modo Ordeñe:** si la wake word falla demasiado con ruido real (falsos positivos o falsos negativos frecuentes), un botón grande en pantalla ("Hablar") dispara la misma ventana de captura de 3–5 segundos, sin depender de la palabra clave. No se contempla hardware custom (botón físico en el soporte) por la fragmentación de marcas de celular y fundas — se descartó como camino inestable.

### Separación técnica (para el spike)

Son dos problemas distintos, no uno solo, y probablemente necesiten motores distintos:

1. **Detección de wake word**: tiene que estar escuchando todo el turno, consumir poca batería, funcionar 100% offline. Requiere un motor liviano especializado en detección de palabra clave, no un motor de transcripción completa.
2. **Reconocimiento del comando**: se activa solo después de la wake word, corre una vez por evento, puede ser más "pesado" (más preciso, aunque consuma más recursos momentáneamente).

**Primera opción a evaluar para (1):** Picovoice Porcupine — diseñado específicamente para wake word, bajo consumo, offline, con SDK para React Native/Expo. Verificar en el spike si soporta la palabra clave elegida en español directamente o si requiere entrenamiento personalizado en su consola.

### Elección de la palabra clave

Evitar palabras comunes que puedan aparecer en conversación normal en la sala de ordeñe (riesgo de activación falsa). Ejemplo descartado: "anotar" — es una palabra de uso cotidiano ("tengo que anotar esto").

Candidato preferido: **"GTLT"** — no aparece en conversación normal, pero hay que confirmar en el spike que se pronuncie de forma consistente entre distintas personas y que el motor la reconozca bien fonéticamente en español (distintas formas de decir la sigla en voz alta).

### Alcance del primer spike

1. Pantalla de ordeñe con botones "Empezar turno" / "Terminar turno".
2. Con turno activo: detección de wake word.
3. Captura corta tras la activación (3–5 s).
4. **Confirmación solo en pantalla** para esta primera iteración — no meter confirmación por voz todavía, para poder aislar qué falla si algo no funciona bien. Confirmación por voz queda para una segunda iteración, una vez validado el flujo base.
5. Evento confirmado → outbox (mismo mecanismo offline ya funcionando).

### Explícitamente fuera de este spike

- Botón físico en el soporte (descartado por ahora)
- Confirmación por voz (segunda iteración)
- Afinamiento de precisión con ruido real de sala (se prueba, pero no se optimiza a fondo en esta primera pasada)
