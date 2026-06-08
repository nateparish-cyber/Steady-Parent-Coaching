# Publishing a new blog post

Every post lives as a single static HTML file in `/blog/`. SEO-optimal, no build step.

## The 3-file checklist

To publish a post, edit 3 files:

### 1. Create `/blog/<your-slug>.html`

Copy `welcome.html` and rename it. Update:

- `<title>` — keep under 60 chars. Format: `<Post title> — Steady Parenting Coach`
- `<meta name="description">` — under 155 chars. This is what shows in Google results.
- `<link rel="canonical">` — change the URL to match your slug.
- All `og:*` and `article:*` meta tags — title, description, URL, image, published date.
- The JSON-LD `Article` schema block — headline, description, image, datePublished, mainEntityOfPage.
- `<div class="post-tags">` — one or more of: `Anxiety`, `ADHD`, `Accommodation`, or your own.
- `<h1>` — your post title (must match `<title>` semantically).
- `<p class="lede">` — your hook paragraph.
- The cover image: drop a PNG/JPG into `/blog/images/<your-slug>.png`, then replace the empty `<div class="cover">` with `<img src="/blog/images/<your-slug>.png" alt="...">`.
- Body content.

**Slug rules:** lowercase, hyphenated, descriptive of the post topic. Example file: `school-refusal-mornings.html` → public URL `/blog/school-refusal-mornings` (Vercel's `cleanUrls: true` strips `.html` for you). Internal links, canonical URLs, sitemap entries should all use the clean form without `.html`.

### 2. Add a card to `/blog/index.html`

Find the `<main id="posts">` block. Add a new `<article class="post-card">` **at the top** (newest first). Pattern:

```html
<article class="post-card" data-tags="anxiety accommodation">
  <a class="cover" href="/blog/your-slug" aria-label="Your post title">
    <img src="/blog/images/your-slug.png" alt="Your post title" />
  </a>
  <div class="body">
    <div class="tags">
      <span class="tag">Anxiety</span>
      <span class="tag">Accommodation</span>
    </div>
    <h2><a href="/blog/your-slug">Your post title</a></h2>
    <p class="excerpt">One or two sentences that make people want to click.</p>
    <div class="meta">By Nate Parish, LMFT · May 2026</div>
  </div>
</article>
```

`data-tags` controls which filter chip shows the card. Use any combination of: `anxiety`, `adhd`, `accommodation`.

### 3. Add the URL to `/sitemap.xml`

Add a `<url>` block:

```xml
<url>
  <loc>https://www.steadyparentingcoach.com/blog/your-slug</loc>
  <lastmod>2026-05-27</lastmod>
  <changefreq>monthly</changefreq>
  <priority>0.7</priority>
</url>
```

This is what tells Google a new page exists. Without it, indexing is slower.

## Optional but recommended

- **Feature it on the landing page.** If a post is especially strong, swap one of the three cards in the "Latest from the blog" section on `/index.html` to point at it.
- **Cross-link.** Inside the post body, link to other related posts on your domain. Internal links concentrate SEO authority.

## Commit + ship

```bash
git add blog/ index.html sitemap.xml
git commit -m "Add post: <slug>"
git push
```

Vercel auto-deploys on push. The post is live within ~10 seconds.

## After publishing

- Submit the new URL to [Google Search Console](https://search.google.com/search-console) ("URL Inspection" → paste URL → "Request indexing"). Speeds up indexing from days to hours.
- Share it. Internal links rank you; external links rank you faster.

## Per-post SEO checklist (paste into commit message or task)

- [ ] Title under 60 chars
- [ ] Description under 155 chars
- [ ] Canonical URL set
- [ ] Cover image set (with descriptive `alt` text)
- [ ] All `og:*` and `article:*` meta tags updated
- [ ] JSON-LD Article schema updated (headline, datePublished, image)
- [ ] Tags applied on both the post and the index card
- [ ] Sitemap entry added
- [ ] At least one internal link to another SPC page or post
