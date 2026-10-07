# syntax=docker/dockerfile:1

# ============================ 构建阶段 ============================
FROM node:22-alpine AS build
WORKDIR /app

# 先拷贝清单，利用缓存安装依赖
COPY package.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm install --workspaces --include-workspace-root --no-audit --no-fund

# 拷贝源码并构建（前端产物 -> web/dist，后端 -> server/dist）
COPY . .
RUN npm run build

# ============================ 运行阶段 ============================
FROM node:22-alpine AS runtime

RUN apk add --no-cache su-exec tini

# 仅安装后端生产依赖（不引入工作区，保持镜像精简）
WORKDIR /app/server
ENV NODE_ENV=production \
    PORT=7582 \
    CONFIG_DIR=/config \
    ROOTS=/data

COPY server/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/server/dist ./dist
COPY --from=build /app/web/dist /app/web/dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data /config

EXPOSE 7582
VOLUME ["/data", "/config"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7582)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
