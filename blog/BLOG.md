# Publishing a blog post

## The fast path: drop a draft in `/blog/drafts/`

Two accepted draft formats — pick whichever feels easier:

- **Markdown** (`.md`) — copy `/blog/TEMPLATE.md` as a starting point and fill in the YAML frontmatter at the top.
- **Word doc** (`.docx`) — write the post in Word with a small SEO metadata block at the very top (target keyword, title tag, meta description, slug), then the post body. Claude parses both the metadata and the body when publishing.

Either way:

1. **Save the draft to `/blog/drafts/<anything>.md`** or `<anything>.docx`.
2. **Ping Claude with "publish blog drafts"** (or paste the post in chat). Claude reads the file(s), renders the HTML, slots in all the SEO scaffolding (canonical URL, OG/Twitter cards, JSON-LD Article schema, byline, breadcrumb, end-of-post CTA), adds the card to `/blog/index.html`, adds the URL to `/sitemap.xml`, and commits + pushes.

### Optional: distinct `<title>` and `<h1>`

If you want the Google-results title to be shorter than the on-page H1 (good practice — Google cuts titles around 58 chars but H1s can be longer), provide both in the frontmatter:

```yaml
title: "Your long, descriptive on-page headline"   # becomes <h1>
metaTitle: "Your short Google-results title"        # becomes <title>
```

If only `title` is provided, it's used for both.

That's it. Drafts in `/blog/drafts/` are **gitignored** — they never end up in the repo or on the public site. Only the rendered HTML for the published version is committed.

**The slug becomes the public URL.** `/blog/drafts/school-refusal-mornings.md` → `https://www.steadyparentingcoach.com/blog/school-refusal-mornings`. Pick keyword-relevant slugs.

**Tag values control the filter chips** on `/blog/`. Use any combo of: `anxiety`, `adhd`, `accommodation`.

**Cover images:** drop a PNG/JPG into `/blog/images/<filename>` and reference it by filename only in the frontmatter (`cover: my-image.png`). Leave it blank to use the default warm gradient cover.

**Feature on the landing page:** set `featured: true` in the frontmatter and the post replaces the welcome card in the landing-page "Latest from the blog" section.

## After publishing

- **[Google Search Console](https://search.google.com/search-console)** → URL Inspection → paste the new URL → "Request indexing." Cuts indexing from days to hours.
- **Share it.** External links + social shares are how new content gets discovered.

## The slow path: write HTML directly

If you ever want to bypass the markdown workflow and edit HTML by hand, the pattern is:

1. Copy `/blog/welcome.html` to `/blog/<slug>.html`
2. Update the title, description, canonical URL, og/twitter meta, JSON-LD Article block, and body
3. Add a `<article class="post-card">` block to `/blog/index.html` (`data-tags` controls the filter chip)
4. Add a `<url>` block to `/sitemap.xml`
5. Commit + push

The markdown workflow does all of this for you. Use the slow path only if you want maximal control over the HTML (custom inline CSS, embedded widgets, etc.).
