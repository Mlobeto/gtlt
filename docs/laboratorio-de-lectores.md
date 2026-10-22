# Laboratorio de lectores

El laboratorio permite probar lectores electrónicos de caravanas desde una computadora, ver exactamente los bytes que envían y averiguar cómo convertirlos en una identificación. No manda lecturas al servidor: las pruebas quedan guardadas en el navegador y se pueden exportar a CSV.

## Qué hace falta

- Chrome o Edge de escritorio, abierto con HTTPS o desde `localhost`.
- Un lector conectado mediante un adaptador USB a serie compatible con el voltaje y la conexión del módulo.
- Una caravana real para comparar la lectura con su número impreso.

Sin lector se puede usar **Agregar puerto simulado** para probar la pantalla y los formatos conocidos.

## Hacer una prueba

1. Entrá con la cuenta de desarrolladora y abrí **Laboratorio**.
2. Elegí **Agregar lector** y seleccioná el puerto que ofrece el navegador, o agregá uno simulado.
3. Elegí el modelo y configurá baudios y tramado. Para el lector real, empezá con la configuración que indique el fabricante. El formato del WL-134 y del ZOCORFID queda pendiente hasta observar una salida real.
4. Elegí un decodificador y conectá el puerto. La vista cruda muestra las recepciones en hexadecimal y ASCII; podés copiarla o descargarla.
5. Escribí el número impreso de la caravana. Se aceptan 10, 12 o 15 dígitos, también con espacios o guiones. Las lecturas mostrarán si coinciden.
6. Elegí un puerto y duración de 10, 30 o 60 segundos para iniciar una prueba cronometrada.
7. Revisá el resumen, completá los datos del entorno y guardá. Las pruebas guardadas aparecen en el registro local y **Exportar CSV** descarga una copia.

## Averiguar un formato desconocido

Conectá el lector, probá los baudios y el tramado posibles y acercá una caravana cuyo número conozcas. Escribí el número impreso, elegí el puerto y usá **Buscar este número en los bytes capturados**. La búsqueda prueba dígitos ASCII, hexadecimal ISO 11784, bytes ISO, BCD y dígitos invertidos.

Si aparece en ASCII, elegí el decodificador por dígitos. Si aparece como 8 bytes, elegí ISO 11784 y probá los dos órdenes. Si no aparece, revisá la velocidad, el tramado y el número tipeado. Para compartir una captura con el equipo de desarrollo, usá **Copiar muestra para el otro chat**; incluye el modelo, la configuración, el número y hasta 20 tramas en hexadecimal y ASCII.

## Agregar un decodificador

Los decodificadores están en `apps/web/src/lib/readerLab/decoders.ts`. Agregá una entrada con un identificador estable, un nombre y una función `decode` que reciba una `Uint8Array` y devuelva:

```ts
{
  eid15: string | null
  campos: Record<string, string>
  avisos: string[]
}
```

Registrala en `DECODERS`. No completes los decodificadores de WL-134 o ZOCORFID hasta capturar y documentar una salida real de cada modelo. Los casos del núcleo se pueden ejecutar con `node --experimental-strip-types apps/web/src/lib/readerLab/verify.ts` en Node compatible con el borrado de tipos de TypeScript.
