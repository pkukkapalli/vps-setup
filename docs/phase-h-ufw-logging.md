# Phase H — UFW logging

[← Guide index](guide.md)

## What it does

- Shows the current UFW logging level and optionally sets it to `medium` for easier debugging.

## How to do it manually

```bash
sudo ufw status verbose   # see current logging
sudo ufw logging medium
```
