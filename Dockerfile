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

# Create hiregraph data directories and copy seeded data
RUN mkdir -p /root/.hiregraph/recipes /root/.hiregraph/resumes
COPY deploy/hiregraph-data/ /root/.hiregraph/

# Move resume to a known path and patch identity.json to point at it
RUN if [ -f /root/.hiregraph/resume.pdf ]; then \
      mv /root/.hiregraph/resume.pdf /root/.hiregraph/resumes/resume.pdf && \
      node -e "const fs=require('fs');const p='/root/.hiregraph/identity.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.resume_path='/root/.hiregraph/resumes/resume.pdf';fs.writeFileSync(p,JSON.stringify(d,null,2))"; \
    fi

# Railway sets env vars in dashboard — no .env needed
# Required: ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

CMD ["node", "dist/index.js", "daemon"]
