# Datos de demostración de animales (solo local)

Script: `apps/api/src/scripts/seed-animal-demo.ts`.

Crea una familia de caravanas `9001`–`9006` y `9010`, el toro externo “Toro Demo” (`DEMO-001`) y un toro propio vinculado a `9010`, más reproducción y cuatro controles lecheros para probar la ficha y el árbol. Todo lo que crea lleva `notes: "DEMO CAL"` (los toros se reconocen por el código de registro).

## Protección

Si el host de `DATABASE_URL` no es `localhost` ni `127.0.0.1`, el script **sale con error** y no toca nada. No usarlo contra Azure ni ninguna base remota.

## Cómo correrlo

Desde `apps/api`, con el `.env` local:

```bash
npx tsx src/scripts/seed-animal-demo.ts
```

Tambo concreto:

```bash
npx tsx src/scripts/seed-animal-demo.ts --tamboId <uuid>
```

Si no pasás tambo, usa el primer tambo de la base (el del primer tenant).

Borrar solo lo que creó:

```bash
npx tsx src/scripts/seed-animal-demo.ts --clean
npx tsx src/scripts/seed-animal-demo.ts --tamboId <uuid> --clean
```

Es idempotente: la segunda corrida actualiza las mismas filas, no duplica caravanas.

En el web, buscá la caravana `9003` (madre `9002`, abuela `9001`, padre Toro Demo, cría `9004`). `9005` tiene padre propio `9010` y a `9006` vendida en el árbol.
