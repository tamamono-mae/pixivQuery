FROM node:latest
ENV NODE_ENV production
WORKDIR /app
COPY src/package*.json ./
RUN npm install
COPY src/. .
CMD ["npm","start"]

LABEL Name="pixivQuery"
LABEL description="pixivQuery"
LABEL version="1.0"
LABEL maintainer="tamamono-mae@github.com"
