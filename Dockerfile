# Multi-Stage Dockerfile for ObsidianIDE (Unified Production Deployment)

# Stage 1: Build Frontend SPA Assets
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build production bundle
COPY . .
RUN npm run build

# Stage 2: Production Server Node Environment
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend server code and configuration
COPY server ./server
COPY firestore.rules ./firestore.rules

EXPOSE 5000

CMD ["npm", "start"]
