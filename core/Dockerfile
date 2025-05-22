# Use a lightweight Node.js base image
# Using node:20-alpine as Node.js v22 might have some cutting-edge changes
# that whatsapp-web.js or its dependencies haven't fully caught up with in stable releases.
# If you specifically need v22.x, change this to `node:22-alpine`, but be aware
# you might face more dependency complexities.
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# 1. Install necessary system dependencies for Chromium on Alpine Linux
#    - ca-certificates: For HTTPS connections (fetching npm packages, etc.)
#    - chromium: The headless browser itself
#    - udev: Required by some Chromium dependencies
#    - nss: Network Security Services
#    - freetype: Font rendering
#    - harfbuzz: Text shaping
#    - openjdk17-jre: Sometimes needed for certain puppeteer versions/features (optional, but safe to include)
RUN apk add --no-cache \
	chromium \
	nss \
	freetype \
	harfbuzz \
	ttf-freefont \
	alsa-lib \
	dbus \
	libxml2 \
	libxslt \
	fontconfig \
	udev \
	openjdk17-jre \
	ca-certificates

# 2. Set environment variable to tell Puppeteer to skip downloading Chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium-browser"

# Copy package.json and package-lock.json to the working directory
# This allows caching of dependencies.
COPY . .

# 3. Install project dependencies
RUN npm install

# Build the TypeScript project
RUN npm run build
# This will run the 'build' script defined in your package.json

# Remove dev dependencies after build to reduce final image size
RUN npm prune --production

# Ensure the 'data' directory exists and declare it as a Docker Volume.
RUN mkdir -p /app/data
VOLUME /app/data

# Define the command to run your application
CMD ["npm", "run", "serve"]