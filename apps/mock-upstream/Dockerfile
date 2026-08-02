FROM node:22-alpine

WORKDIR /repo

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/mock-upstream ./apps/mock-upstream

RUN npm install

WORKDIR /repo/apps/mock-upstream

EXPOSE 4000

CMD ["npm", "run", "start"]
