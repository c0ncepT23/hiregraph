FROM node:20-slim

# Install Playwright system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
    libasound2 libatspi2.0-0 libwayland-client0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Install Playwright Chromium
RUN npx playwright install chromium

COPY dist/ ./dist/
COPY src/data/ ./dist/data/

# Copy deploy data (identity, answers, recipes, resume)
# Use a wildcard so the build doesn't fail if the directory is missing
RUN mkdir -p /root/.hiregraph/recipes /root/.hiregraph/resumes
COPY deploy/ /tmp/deploy/
RUN if [ -d /tmp/deploy/hiregraph-data ]; then \
      cp -r /tmp/deploy/hiregraph-data/* /root/.hiregraph/ 2>/dev/null || true; \
    fi && \
    if [ -f /root/.hiregraph/resume.pdf ]; then \
      mv /root/.hiregraph/resume.pdf /root/.hiregraph/resumes/resume.pdf && \
      node -e "const fs=require('fs');const p='/root/.hiregraph/identity.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.resume_path='/root/.hiregraph/resumes/resume.pdf';fs.writeFileSync(p,JSON.stringify(d,null,2))"; \
    fi && \
    rm -rf /tmp/deploy

# Railway sets env vars in dashboard — no .env needed
# Required: ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

CMD ["node", "dist/index.js", "daemon"]
