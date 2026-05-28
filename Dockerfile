# 1단계: 의존성 설치 (Dependencies Stage)
FROM node:20-slim AS deps
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 패키지 매니저 파일들만 먼저 복사하여 캐싱 활용
COPY package.json package-lock.json ./
RUN npm ci

# 2단계: 애플리케이션 빌드 (Builder Stage)
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Generate를 실행하여 Prisma Client 생성
RUN npx prisma generate

# Next.js 빌드 진행 전 PDF 수동 컴파일 수행
RUN node scripts/generate-pdfs.js

# Next.js 빌드 진행 (next.config.ts의 output: "standalone"을 기반으로 최적화 빌드됨)
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# 3단계: 프로덕션 실행 런타임 (Runner Stage)
FROM node:20-slim AS runner
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# 빌드 결과물 중 실행에 필요한 경량 standalone 폴더 및 정적 리소스만 이관
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache and manual uploads volume mount point
RUN mkdir -p .next /app/uploads/manuals
RUN chown -R node:node /app

# standalone 빌드는 node_modules와 서버 로직이 포함된 단일 번들 디렉토리입니다.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/src/data/manuals ./src/data/manuals

USER node

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# standalone 배포 시 실행 스크립트
CMD ["node", "server.js"]
