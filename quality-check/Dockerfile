FROM node:22-alpine AS frontend

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend.py ./
COPY --from=frontend /app/dist ./dist

ENV PORT=43827
EXPOSE 43827

CMD ["python", "backend.py"]
