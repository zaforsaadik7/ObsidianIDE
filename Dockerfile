# Multi-Stage Dockerfile for ObsidianIDE (Unified Production Deployment)

# Stage 1: Build Frontend SPA Assets
FROM node:22-alpine AS builder
WORKDIR /app

# Provide default build arguments for Vite client bundle
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID

ENV VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY:-AIzaSyDagqJtp7AnGBh0xyky4SvAME-8ZS7PeaQ}
ENV VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN:-obsidianide-1606f.firebaseapp.com}
ENV VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID:-obsidianide-1606f}
ENV VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET:-obsidianide-1606f.firebasestorage.app}
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID:-760717239168}
ENV VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID:-1:760717239168:web:ec973488753109c8a0d765}
ENV VITE_FIREBASE_MEASUREMENT_ID=${VITE_FIREBASE_MEASUREMENT_ID:-G-5E5KK5H153}

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
RUN npm ci --omit=dev

# Copy compiled frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend server code and configuration
COPY server ./server
COPY firestore.rules ./firestore.rules

EXPOSE 5000

CMD ["npm", "start"]
