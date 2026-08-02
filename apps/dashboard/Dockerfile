FROM node:22-alpine

WORKDIR /repo

COPY package.json ./
COPY tsconfig.base.json ./
COPY apps/dashboard ./apps/dashboard

RUN npm install

WORKDIR /repo/apps/dashboard

EXPOSE 5173

CMD ["npm", "run", "dev"]
