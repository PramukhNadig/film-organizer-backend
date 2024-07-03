# Use an official Node.js runtime as the base image
FROM node:alpine

# Set the working directory in the container to /app
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the application dependencies
RUN yarn install

# Copy the rest of the application code to the working directory
COPY . .

# Expose the application on port 3000
EXPOSE 3000

# Define the command to run the application
CMD [ "yarn", "dev" ]