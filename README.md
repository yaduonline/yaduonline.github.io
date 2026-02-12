# Your Personal Blog Website

## Files Structure

```
yaduonline.github.io/
├── index.html          # Homepage
├── blog.html           # Blog listing page
├── photos.html         # Photo gallery page
├── about.html          # About page
├── style.css           # All styles
└── blog/
    └── first-post.html # Sample blog post
```

## How to Deploy to GitHub Pages

1. Copy all these files to your cloned repository:
   ```bash
   cd /path/to/yaduonline.github.io
   # Copy all files from this folder to your repo
   ```

2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Initial blog setup"
   git push origin main
   ```

3. Your site will be live at: https://yaduonline.github.io

## Customization

### Update Your Information
1. Search and replace "Your Name" with your actual name in all HTML files
2. Update the email in `about.html`
3. Update the copyright year in footer if needed

### Adding New Blog Posts

1. Create a new HTML file in the `blog/` directory (e.g., `blog/my-new-post.html`)
2. Copy the structure from `blog/first-post.html`
3. Update the title, date, and content
4. Add a preview to both `index.html` and `blog.html`:

```html
<article class="post-preview">
    <h3><a href="blog/my-new-post.html">Post Title</a></h3>
    <time datetime="2024-02-12">February 12, 2024</time>
    <p>Brief description of the post...</p>
</article>
```

### Adding Photos

1. Create an `images/` folder in your repository
2. Add your photos there
3. In `photos.html`, add entries like:

```html
<div class="photo-item">
    <img src="images/photo1.jpg" alt="Description">
    <p class="photo-caption">Caption for this photo</p>
</div>
```

## Connecting Your Custom Domain

After your site is live on GitHub Pages:

1. In your repository, go to Settings → Pages
2. Under "Custom domain", enter your domain (e.g., example.com)
3. Save and GitHub will create a CNAME file

4. Update your domain's DNS settings (at your domain registrar):
   - Add an A record pointing to GitHub's IPs:
     - 185.199.108.153
     - 185.199.109.153
     - 185.199.110.153
     - 185.199.111.153
   - Or add a CNAME record pointing to yaduonline.github.io

5. Wait for DNS to propagate (can take up to 24 hours)

## Tips

- Keep the design minimal and fast-loading
- All styles are in one CSS file for easy customization
- Mobile-responsive design works on all devices
- No JavaScript required unless you want to add it
- Consider using WebP format for photos to reduce file size

Enjoy your ad-free, minimal personal website!
