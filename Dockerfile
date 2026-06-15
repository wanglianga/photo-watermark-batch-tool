FROM node:20-bullseye-slim

LABEL maintainer="Photo Watermark Tool"
LABEL description="本地照片版权水印批处理工具 - Electron 桌面应用"

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    ELECTRON_DISABLE_SANDBOX=1 \
    DISPLAY=:0

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libgcc-s1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libgtk-4-1 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libuuid1 \
    libvulkan1 \
    libwayland-client0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxdmcp6 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    xvfb \
    dbus-x11 \
    procps \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./

RUN npm config set registry https://registry.npmmirror.com || true \
    && npm config set sharp_binary_host "https://npmmirror.com/mirrors/sharp" || true \
    && npm config set sharp_libvips_binary_host "https://npmmirror.com/mirrors/sharp-libvips" || true \
    && npm install --omit=dev --no-audit --no-fund 2>&1 || npm install --omit=dev --no-audit --no-fund --registry https://registry.npmjs.org 2>&1

COPY main.js ./
COPY src ./src
COPY assets ./assets

RUN groupadd -r appuser && useradd -r -g appuser -G audio,video appuser \
    && mkdir -p /home/appuser/Downloads /app/output /app/input \
    && chown -R appuser:appuser /home/appuser /app

USER appuser

ENTRYPOINT ["npm", "start"]
