FROM node:22.11-slim
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000

# Configurar variável de ambiente para aumentar a memória do Node.js
ENV NODE_OPTIONS="--max-old-space-size=4096"

CMD ["npm", "start"]