const { DateTime } = require("luxon");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
const markdownItFootnote = require("markdown-it-footnote");
const markdownItSub = require("markdown-it-sub");
const markdownItSup = require("markdown-it-sup");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginRss = require("@11ty/eleventy-plugin-rss");

// Strips the leading <h1> from a post body, so the title isn't printed twice
// (posts repeat their title as an H1 so the markdown stands alone).
const removeTitle = (str) => str.replace(/<h\d.+<\/h\d>\s+/, "");

module.exports = function (eleventyConfig) {
  // Inline markdown renderer, exposed as a filter for titles etc.
  const md = new markdownIt({ html: true });
  eleventyConfig.addFilter("markdown", (content) =>
    md.renderInline(content || ""),
  );

  // Static assets copied through untouched.
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("fonts");
  eleventyConfig.addPassthroughCopy("img");
  eleventyConfig.addPassthroughCopy("favicon.ico");
  eleventyConfig.addPassthroughCopy("paoloanzn.gpg");
  eleventyConfig.addPassthroughCopy("llms.txt");
  // Cloudflare static-asset config files.
  eleventyConfig.addPassthroughCopy("_headers");
  eleventyConfig.addPassthroughCopy("_redirects");

  // Remove all characters except letters, numbers and dashes.
  eleventyConfig.addFilter("pathify", (str) =>
    str.replace(/[^A-Za-z0-9\-]/g, ""),
  );

  // ISO-ish dates everywhere.
  eleventyConfig.addFilter("readableDate", (dateObj) =>
    DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy-MM-dd"),
  );
  eleventyConfig.addFilter("htmlDateString", (dateObj) =>
    DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat("yyyy-MM-dd"),
  );

  // Straight quotes -> typographic quotes.
  eleventyConfig.addFilter("apostrophy", (str) =>
    str
      .replace(/\B\'/g, "\u2018")
      .replace(/\'/g, "\u2019")
      .replace(/\B\"/g, "\u201c")
      .replace(/\"/g, "\u201d"),
  );

  // Reading time, at 300 wpm, matching the "N min read" label used in the
  // post list and on each post.
  eleventyConfig.addFilter("readTime", (content) => {
    const text = String(content || "").replace(/<[^>]*>/g, " ");
    const words = text.split(/\s+/).filter(Boolean).length;
    return `${Math.max(1, Math.round(words / 300))} min read`;
  });

  // Markdown: footnotes, heading anchors, sub/sup, smart typography.
  const markdownLibrary = markdownIt({
    html: true,
    breaks: true,
    linkify: true,
    typographer: true,
  })
    .use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.linkInsideHeader({
        class: "direct-link",
        symbol: "#",
        placement: "after",
      }),
    })
    .use(markdownItFootnote)
    .use(markdownItSub)
    .use(markdownItSup);

  markdownLibrary.renderer.rules.footnote_block_open = () =>
    "<h2 id='footnotes'>Footnotes</h2>\n<ol class='footnotes-list'>\n";
  markdownLibrary.renderer.rules.footnote_block_close = () => "</ol>\n";

  eleventyConfig.setLibrary("md", markdownLibrary);

  eleventyConfig.addFilter("removeTitle", (str) => removeTitle(str));

  // Look up the series (if any) that a post belongs to, by slug.
  eleventyConfig.addFilter("getSeries", (slug, series) =>
    (series || []).find((s) => s.posts.map((p) => p.slug).includes(slug)),
  );

  // Resolve _data/featured.json entries to real posts, dropping any that
  // don't exist yet so the "start here" page can't break the build.
  eleventyConfig.addFilter("featuredPosts", (posts, featured) =>
    (featured || [])
      .map(({ slug, image }) => {
        const post = (posts || []).find((p) => p.fileSlug === slug);
        return post ? { ...post, image } : null;
      })
      .filter(Boolean),
  );

  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPlugin(pluginRss);

  return {
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dataTemplateEngine: "njk",
    pathPrefix: "/",
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
};
