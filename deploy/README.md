# deploying to disinteg

## one-time setup (on disinteg)

```bash
# pull repo somewhere convenient; only server runs on the box, client is static
ssh disinteg
sudo tee /etc/nginx/sites-available/monopoly-api < monopoly-api.nginx.conf
sudo tee /etc/nginx/sites-available/monopoly-frontend < monopoly.nginx.conf
sudo ln -sf /etc/nginx/sites-available/monopoly-api /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/monopoly-frontend /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS for both subdomains — same flow the other ojee.net subs use
sudo certbot --nginx -d monopoly.ojee.net -d monopoly-api.ojee.net

# systemd unit for the node server
sudo cp monopoly-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now monopoly-server
```

## ship new code

```bash
# from local machine
./deploy/push.sh
```

`push.sh` rsyncs `server/` to `/home/disinteg/monopoly-server`, builds the
client locally (`cd client && npm run build`), rsyncs `client/build/` to
`/home/disinteg/monopoly-client`, restarts the systemd unit, and reloads
nginx. The unit uses `/home/disinteg/monopoly-server/.env` (not in git) —
make sure it has:

```
MONGODB_URI=mongodb://localhost:27017/monopoly
CLIENT_URL=https://monopoly.ojee.net
PORT=5004
NODE_ENV=production
```

## DNS

In Cloudflare (or wherever ojee.net's DNS lives), add A records:

- `monopoly.ojee.net` → disinteg's public IP
- `monopoly-api.ojee.net` → same IP

Proxying through Cloudflare is fine — socket.io falls back to long-polling
if the WS upgrade is blocked, but our nginx + CF both allow websockets.
