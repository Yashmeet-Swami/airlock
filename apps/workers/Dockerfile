FROM node:22-alpine

WORKDIR /repo

COPY package.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/workers ./apps/workers

RUN npm install

WORKDIR /repo/apps/workers

CMD ["npm", "run", "start"]
