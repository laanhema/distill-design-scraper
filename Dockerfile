# The image tag MUST match the "playwright" version in package.json exactly —
# the runner stage relies on this image's preinstalled browsers, and a version
# mismatch means "browser not found" at launch. When bumping playwright in
# package.json, bump this tag in the same commit (both stages).
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS base

WORKDIR /app

# Install dependencies based on lockfile
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js app
RUN npm run build

# Production image runner stage
FROM mcr.microsoft.com/playwright:v1.61.1-jammy AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=base --chown=pwuser:pwuser /app/node_modules ./node_modules
COPY --from=base --chown=pwuser:pwuser /app/package.json ./package.json
COPY --from=base --chown=pwuser:pwuser /app/.next ./.next
COPY --from=base --chown=pwuser:pwuser /app/next.config.mjs ./next.config.mjs

# Run as the image's built-in non-root user; Chromium launches without
# root-sandbox workarounds, and .next stays writable for Next's runtime cache.
USER pwuser

EXPOSE 3000

CMD ["npm", "start"]
