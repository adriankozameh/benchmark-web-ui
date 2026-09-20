Create .env manually:
```bash
cd /Users/adriankozameh/greenfield/benchmark-web-ui

cat > .env <<'EOF'
VITE_API_BASE_URL=http://localhost:8080
EOF
```

Verify it:
```bash
cat .env
```

You should see:
```
VITE_API_BASE_URL=http://localhost:8080
```

Then install dependencies:
```bash
npm install
```

Then run the UI:
```bash
npm run dev
```

You should get something like:
```
Local: http://localhost:5173/
```

Open:
```
http://localhost:5173
```