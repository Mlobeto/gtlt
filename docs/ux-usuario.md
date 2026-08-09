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
