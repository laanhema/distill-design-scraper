FROM mcr.microsoft.com/playwright/node:20-jammy AS base

WORKDIR /app

# Install dependencies based on lockfile
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

# Build Next.js app
RUN npm run build

# Production image runner stage
FROM mcr.microsoft.com/playwright/node:20-jammy AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 3000

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public

EXPOSE 3000

CMD ["npm", "start"]
