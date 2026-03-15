#!/bin/bash
# Ollama Model Setup Helper for UI_K
# Run this on Mac 2 (The Vault)

set -e

echo "=== UI_K Ollama Model Setup ==="
echo ""

# Check if ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "Installing Ollama..."
    brew install ollama
fi

echo "Ollama version: $(ollama --version 2>&1 || echo 'unknown')"
echo ""

# Start Ollama if not running
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "Starting Ollama..."
    ollama serve &
    sleep 3
fi

echo "Pulling Qwen3-32B (thinking model — this may take a while)..."
ollama pull qwen3:32b

echo ""
echo "Pulling Qwen3-8B (fast model for intent parsing)..."
ollama pull qwen3:8b

echo ""
echo "Available models:"
ollama list

echo ""
echo "Done! Models are ready for Agent_K-Vault."
echo "Ollama API available at: http://localhost:11434"
