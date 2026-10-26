FROM node:22-alpine
WORKDIR /app
COPY server.js engine.js index.html ./
# Make the app files readable by the non-root "node" user, whatever permissions
# they had on the host, and create the folder where league data is saved
# (docker compose and docker run -v mount a volume there to keep leagues)
RUN chmod 644 server.js engine.js index.html && mkdir -p /app/data && chown node:node /app/data
ENV PORT=8080 DATA_DIR=/app/data
EXPOSE 8080
USER node
CMD ["node", "server.js"]
