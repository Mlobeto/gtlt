# Imagen de producción para la API GTLT (Express + Prisma).
# Corre vía `tsx` (igual que en desarrollo) — no hay build a JS compilado todavía;
# por eso se instalan también las devDependencies (tsx vive ahí).
FROM node:24-slim AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS runner
WORKDIR /app
COPY . .
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN npx prisma generate
ENV NODE_ENV=production
# Debe coincidir con --target-port del Container App (ver despliegue).
ENV PORT=3000
EXPOSE 3000
# Migraciones al arrancar (DATABASE_URL del secret del Container App).
# Si fallan, el contenedor sale y Azure no marca la revisión nueva como lista:
# sigue sirviendo la anterior. No hace falta abrir el firewall de Postgres a GitHub.
# El arranque en frío suma ~1–3 s por este chequeo.
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
