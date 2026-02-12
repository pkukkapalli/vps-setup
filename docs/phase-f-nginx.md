# Phase F — Nginx + custom domain + TLS + load balancing

[← Guide index](guide.md)

## What it does

- Installs Nginx and Certbot (and certbot-nginx where available).
- Asks for a primary domain and optional extra domains for one certificate.
- Optionally sets up an upstream (round-robin) and a server block that proxies to it.
- Writes a config under `/etc/nginx/conf.d/vps-setup-<domain>.conf`.
- Runs `nginx -t`, reloads Nginx, then runs Certbot for the given domains.

## How to do it manually

1. Install nginx and certbot (see your distro’s packages).
2. Create a server block in `/etc/nginx/conf.d/` with `server_name` and either `proxy_pass` to an upstream or `root` for static files.
3. Run `sudo nginx -t && sudo systemctl reload nginx`.
4. Run `sudo certbot --nginx -d example.com -d www.example.com`.

## Troubleshooting

| Problem | What to try |
|--------|-------------|
| Certbot fails (e.g. “Connection refused”) | Point your domain’s DNS A record to this server’s IP. Ensure ports 80 and 443 are open. Retry: `sudo certbot --nginx -d example.com`. |
| Nginx config test failed | Fix the reported file/line (often a typo or missing semicolon). The script prints the path; edit and run `sudo nginx -t` until it passes, then `sudo systemctl reload nginx`. |
| 502 Bad Gateway behind proxy | Your backend (e.g. app on port 3000) must be listening and reachable. Check with `curl http://127.0.0.1:3000`. |
| Need to add another domain later | Add a new server block or extend `server_name` and run certbot again with the new `-d` option. |
