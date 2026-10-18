# Publishing to GitHub

The files are ready to upload, but this package hasn’t been pushed to a remote repository for you.

## Before you publish

Read [NOTICE.md](../NOTICE.md). The original provider repository had no declared license when checked, so attribution alone isn’t permission to redistribute it. The folder is technically ready for GitHub; that doesn’t settle the upstream licensing question.

The provider source also retains the original public TMDB API key. If you have your own key, change `TMDB_API_KEY` in both `src/4khdhub.js` and `src/hdhub4u.js`, then run `npm run build`. Don’t put private credentials into a public repository.

## Option 1: Upload through the browser

1. Create an empty GitHub repository. `nuvio-dual-providers` is a suitable name.
2. Choose **Add file → Upload files**.
3. Upload the contents of this folder, keeping the folders intact. Don’t upload the enclosing folder itself or the ZIP.
4. Commit the upload to `main`.

The root should contain `manifest.json`. The provider files must be at:

```text
providers/4khdhub.js
providers/hdhub4u.js
```

Some browser uploaders skip hidden files. If `.github/workflows/test.yml` isn’t uploaded, add it separately if you want the automated checks. It isn’t needed for Nuvio to load the providers.

## Option 2: Push with Git

Create an empty repository on GitHub first. Don’t prefill it with a README or license. Then open a terminal in the extracted project folder:

```sh
git init -b main
git add .
git commit -m "Add 4KHDHub and HDHub4u providers"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace the username and repository name before running the last two commands. Git may ask you to set your name and email before the first commit; use your own details. Authenticate through your usual GitHub sign-in method—don’t paste a token into a tracked file.

If you use the prepared workspace folder, Git is already initialized on `main`, so you can skip `git init`. The ZIP doesn’t include Git history or a `.git` folder.

## Add it to Nuvio

Open `manifest.json` in your new GitHub repository, choose **Raw**, and copy the URL. It should look like:

```text
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPOSITORY/main/manifest.json
```

Add that URL in Nuvio’s plugin settings. Disable the two providers from your old repository before enabling these copies.

## Later updates

If you change the source, rebuild and test before pushing:

```sh
npm ci --omit=optional --ignore-scripts
npm run build
npm run check
npm test
```

Bump the relevant versions in `manifest.json` when publishing provider changes so clients can recognize the update. Commit both the source and generated provider files. Refresh the repository in Nuvio after pushing.

The included GitHub Actions workflow runs the build and tests on pushes and pull requests. It hasn’t been run on a remote repository as part of this delivery.
