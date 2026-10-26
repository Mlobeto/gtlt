# Laboratorio de lectores

El laboratorio permite probar lectores electrónicos de caravanas desde una computadora, ver exactamente los bytes que envían y averiguar cómo convertirlos en una identificación. No manda lecturas al servidor: las pruebas quedan guardadas en el navegador y se pueden exportar a CSV.

## Qué hace falta

- Chrome o Edge de escritorio, abierto con HTTPS o desde `localhost`.
- Un lector conectado mediante un adaptador USB a serie compatible con el voltaje y la conexión del módulo.
- Una caravana real para comparar la lectura con su número impreso.

Sin lector se puede usar **Agregar puerto simulado** para probar la pantalla y los formatos conocidos, incluido el formato publicado del WL-134 y las dos disposiciones de 64 bits (tabla ISO 11784 y FDX-B con el nacional primero).

## Hacer una prueba

1. Entrá con la cuenta de desarrolladora y abrí **Laboratorio**.
2. Elegí **Agregar lector** y seleccioná el puerto que ofrece el navegador, o agregá uno simulado.
3. Elegí el modelo y configurá baudios y tramado. **Usar formato publicado del WL-134** deja 9600 8N1, tramado inicio + 30 bytes (inicio `0x02`, fin `0x03`) y el decodificador WL-134. ZOCORFID sigue pendiente hasta una captura real.
4. Elegí un decodificador y conectá el puerto. La vista cruda muestra las recepciones en hexadecimal y ASCII; podés copiarla o descargarla.
5. Escribí el número impreso de la caravana. Se aceptan 10, 12 o 15 dígitos, también con espacios o guiones. Las lecturas mostrarán si coinciden.
6. Elegí un puerto y duración de 10, 30 o 60 segundos para iniciar una prueba cronometrada.
7. Revisá el resumen, completá los datos del entorno y guardá. Las pruebas guardadas aparecen en el registro local y **Exportar CSV** descarga una copia.

Una lectura **válida** es un número de 15 dígitos reconocible, no marcado como ambiguo y no marcado como dudoso. Si la suma de control del WL-134 no coincide, el laboratorio igual muestra el número (para no perder la lectura) y lo marca **Suma de control no coincide**: no cuenta como válida.

## WL-134

Trama de 30 bytes: `0x02`, 26 caracteres ASCII hexadecimales, un byte de XOR de esos 26, el mismo valor invertido (`XOR 0xFF`) y `0x03`. También se aceptan 28 bytes sin los delimitadores.

El nacional va en 10 hex ASCII en orden LSB primero (se da vuelta para leerlo). El país va en 4 hex ASCII, igual. El identificador queda `PPP` + 12 dígitos nacionales. Si ambas sumas coinciden aparece **Formato WL-134 confirmado**.

El tramado **Inicio y fin** puede cortar mal la trama si la suma vale `0x02` o `0x03`. **Inicio y largo fijo** busca el `0x02`, toma 30 bytes y, si el último no es `0x03`, descarta ese inicio y busca el siguiente. Eso incluye la suma dentro de la trama.

## 64 bits: tabla ISO y FDX-B

Hay dos disposiciones:

- **iso-tabla**: bit 0 animal, bits 1–14 reservados, bit 15 bloque de datos, bits 16–25 país, bits 26–63 nacional.
- **fdxb-nacional-primero**: bits 0–37 nacional, 38–47 país, 48 bloque de datos, 49–62 reservados, 63 animal.

Cada una se prueba en little-endian y big-endian. El puntaje suma 1 si el bit de animal vale 1 y 1 si los reservados están en 0. País 0 o mayor que 999, o nacional fuera de rango, no es una lectura. El automático, sin número impreso, usa el único candidato con puntaje 2 (por ejemplo FDX-B). Si tipeás el número impreso y coincide con una sola interpretación, esa gana aunque el puntaje sea 0.

## Averiguar un formato desconocido

Conectá el lector, probá los baudios y el tramado posibles y acercá una caravana cuyo número conozcas. Escribí el número impreso, elegí el puerto y usá **Buscar este número en los bytes capturados**. La búsqueda prueba dígitos ASCII, hexadecimal del nacional y del país (también invertidos), hexadecimal ISO 11784, bytes ISO y FDX-B, BCD y dígitos invertidos.

Si aparece en ASCII, elegí el decodificador por dígitos. Si aparece como 8 bytes, probá tabla ISO y FDX-B en los dos órdenes. Si no aparece, revisá la velocidad, el tramado y el número tipeado. Para compartir una captura con el equipo de desarrollo, usá **Copiar muestra para el otro chat**; incluye el modelo, la configuración, el número y hasta 20 tramas en hexadecimal y ASCII.

## Agregar un decodificador

Los decodificadores están en `apps/web/src/lib/readerLab/decoders.ts`. Agregá una entrada con un identificador estable, un nombre y una función `decode` que reciba una `Uint8Array` y devuelva:

```ts
{
  eid15: string | null
  campos: Record<string, string>
  avisos: string[]
}
```

Registrala en `DECODERS`. No completes ZOCORFID hasta capturar y documentar una salida real. Los casos del núcleo se pueden ejecutar con `npx tsx apps/web/src/lib/readerLab/verify.ts`.
