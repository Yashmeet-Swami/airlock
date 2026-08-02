FROM node:22-alpine

WORKDIR /repo

COPY package.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/gateway ./apps/gateway

RUN npm install

WORKDIR /repo/apps/gateway

EXPOSE 3000

CMD ["sh", "-c", "npm run migrate && npm run start"]
