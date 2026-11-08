# Docs Site (MkDocs Material)

This folder contains the MkDocs Material configuration for the DevDeck documentation site.

- Content source: `../docs`
- MkDocs config: `mkdocs.yml`
- Build output: `site/`

## Local Preview

```bash
cd docs-site
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
mkdocs serve
```

## Cloudflare Pages

Recommended settings:

- Production branch: `main`
- Build command:
  - `pip install -r docs-site/requirements.txt && mkdocs build -f docs-site/mkdocs.yml`
- Build output directory:
  - `docs-site/site`
- Custom domain:
  - `dtb.256th.com`
