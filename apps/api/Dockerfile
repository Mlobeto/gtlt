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
CMD ["npm", "start"]
