FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig*.json ./
COPY src ./src
COPY scripts/build-migrations.mjs ./scripts/build-migrations.mjs
# 빌드 컨텍스트에는 private 서브모듈 전체가 아닌 마이그레이션 폴더만 전달한다.
COPY --from=recap_migrations . /migration-source/
ENV RECAP_MIGRATIONS_SOURCE=/migration-source
RUN pnpm build && pnpm prune --prod

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# 채널 기록 카드 렌더링용 서체(OFL)와 서비스 아이콘. dist 가 ../assets 상대 경로로 읽는다.
COPY --chown=node:node assets ./assets
USER node
EXPOSE 8180
CMD ["node", "dist/main.js"]
