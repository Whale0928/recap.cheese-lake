FROM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
RUN sed -i 's,^pid .*;,pid /tmp/nginx.pid;,' /etc/nginx/nginx.conf \
 && sed -i '/^user /d' /etc/nginx/nginx.conf \
 && chown -R nginx:nginx /var/cache/nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080
