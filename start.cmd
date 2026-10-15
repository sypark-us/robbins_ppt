@echo off
cd /d "%~dp0"
start "" http://localhost:8080/
node test\serve.mjs 8080
