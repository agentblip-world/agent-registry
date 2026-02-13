#!/bin/bash
set -e

echo "Installing root dependencies..."
npm install

echo "Installing app dependencies..."
cd src/app
npm install

echo "Building app..."
npm run build

echo "Build complete!"
