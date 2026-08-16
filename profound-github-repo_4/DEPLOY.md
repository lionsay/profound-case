# Deploying this dashboard

Two routes. Do the Netlify one first as a safety net, then GitHub Pages as the link you submit.

## 1. Netlify Drop — about thirty seconds, no account

1. Unzip this repo somewhere.
2. Go to https://app.netlify.com/drop
3. Drag the whole folder onto the page.
4. You get a live URL immediately, something like `https://cheerful-moon-1a2b3c.netlify.app`.

That URL is public and permanent. Claim it with a free account if you want to rename it.

## 2. GitHub Pages — about ten minutes, and the repo becomes a second artifact

```bash
cd profound-operating-model
git init
git add .
git commit -m "Profound operating model, dashboard and validation harnesses"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/profound-operating-model.git
git push -u origin main
```

Then in the repo on github.com:

1. **Settings** → **Pages**
2. **Source**: Deploy from a branch
3. **Branch**: `main`, folder `/ (root)`
4. **Save**

Give it a minute or two. The site appears at:

```
https://YOUR-USERNAME.github.io/profound-operating-model/
```

Update the link at the top of `README.md` once you know the URL.

### Notes

- `.nojekyll` is already present, which stops GitHub trying to process the files as a Jekyll site.
- `index.html` is fully self contained with no external dependencies, so it also works by opening the
  file directly from disk.
- Keep the commit history clean. One or two well described commits read better than twenty.
