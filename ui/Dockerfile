FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM --platform=$BUILDPLATFORM nginx:1.27-alpine AS configured
ARG RECAP_API_PROXY=false
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx/recap.conf.template /tmp/recap.conf.template
RUN mkdir -p /etc/nginx/templates \
 && if [ "$RECAP_API_PROXY" = "true" ]; then mv /tmp/recap.conf.template /etc/nginx/templates/default.conf.template; else rm /tmp/recap.conf.template; fi
COPY --from=build /src/dist /usr/share/nginx/html
RUN sed -i 's,^pid .*;,pid /tmp/nginx.pid;,' /etc/nginx/nginx.conf \
 && sed -i '/^user /d' /etc/nginx/nginx.conf \
 && chown -R nginx:nginx /var/cache/nginx /usr/share/nginx/html /etc/nginx/conf.d

FROM nginx:1.27-alpine
COPY --from=configured /etc/nginx /etc/nginx
COPY --from=configured --chown=nginx:nginx /var/cache/nginx /var/cache/nginx
COPY --from=configured --chown=nginx:nginx /usr/share/nginx/html /usr/share/nginx/html
USER nginx
EXPOSE 8080
