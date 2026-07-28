<?xml version="1.0" encoding="UTF-8"?>
<!--
  Makes feed.xml readable when a person opens it in a browser.

  Feed readers parse the XML and ignore this entirely, so styling the feed
  costs subscribers nothing. Browsers apply the transform and render the page
  below instead of dumping raw XML at someone who clicked "RSS feed" without
  knowing what that meant.

  XSLT 1.0, which is all browsers support. CSS is inlined because the
  transform output isn't served from the same document as styles.css.
-->
<xsl:stylesheet version="1.0"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
                xmlns:atom="http://www.w3.org/2005/Atom">

  <xsl:output method="html" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title><xsl:value-of select="/rss/channel/title"/> (RSS feed)</title>
        <meta name="robots" content="noindex"/>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="crossorigin"/>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap"/>
        <style>
          :root {
            --paper: #f4f1ea; --surface: #faf8f3; --ink: #15140f;
            --ink-muted: #5d5a51; --rule: #ddd6c7; --accent: #b23c17;
            --accent-wash: rgba(178, 60, 23, 0.07);
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --paper: #14130f; --surface: #1c1a15; --ink: #f0ece2;
              --ink-muted: #a19c8f; --rule: #322e26; --accent: #e0673b;
              --accent-wash: rgba(224, 103, 59, 0.10);
            }
          }
          * { box-sizing: border-box; margin: 0; }
          body {
            background: var(--paper); color: var(--ink);
            font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.65; -webkit-font-smoothing: antialiased;
          }
          .wrap {
            width: 100%; max-width: 46rem; margin-inline: auto;
            padding: clamp(3rem, 10vh, 6rem) clamp(1.25rem, 5vw, 3rem);
          }
          .eyebrow {
            font-family: 'IBM Plex Mono', ui-monospace, monospace;
            font-size: 0.75rem; letter-spacing: 0.11em; text-transform: uppercase;
            color: var(--accent); margin-bottom: 1.5rem;
          }
          h1 {
            font-family: 'Fraunces', Georgia, serif; font-weight: 600;
            font-size: clamp(2rem, 1.4rem + 2.4vw, 3rem); line-height: 1.08;
            letter-spacing: -0.02em;
          }
          .lede { margin-top: 1.25rem; color: var(--ink-muted); max-width: 44ch; }
          .note {
            margin-top: 2rem; padding: 1.25rem 1.5rem;
            background: var(--accent-wash); border: 1px solid var(--rule);
            border-radius: 6px; font-size: 0.9375rem; color: var(--ink-muted);
          }
          .note code {
            display: inline-block; font-family: 'IBM Plex Mono', ui-monospace, monospace;
            font-size: 0.8125rem; color: var(--ink); word-break: break-all;
          }
          .items { margin-top: 3.5rem; border-top: 1px solid var(--rule); }
          .item { padding: 1.75rem 0; border-bottom: 1px solid var(--rule); }
          .item time {
            font-family: 'IBM Plex Mono', ui-monospace, monospace;
            font-size: 0.75rem; letter-spacing: 0.11em; text-transform: uppercase;
            color: var(--ink-muted);
          }
          .item h2 {
            margin-top: 0.5rem;
            font-family: 'Fraunces', Georgia, serif; font-weight: 600;
            font-size: clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem); line-height: 1.2;
          }
          .item h2 a { color: inherit; text-decoration: none; }
          .item h2 a:hover { color: var(--accent); }
          .item p { margin-top: 0.5rem; color: var(--ink-muted); font-size: 0.9375rem; }
          .back {
            display: inline-block; margin-top: 3rem;
            font-family: 'IBM Plex Mono', ui-monospace, monospace;
            font-size: 0.8125rem; color: var(--ink-muted); text-decoration: none;
          }
          .back:hover { color: var(--accent); }
          a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
        </style>
      </head>

      <body>
        <div class="wrap">
          <p class="eyebrow">RSS feed</p>

          <h1><xsl:value-of select="/rss/channel/title"/></h1>

          <p class="lede"><xsl:value-of select="/rss/channel/description"/></p>

          <div class="note">
            You're looking at an RSS feed. Paste this address into a feed reader
            and new posts will show up there on their own.
            <br/>
            <code><xsl:value-of select="/rss/channel/atom:link/@href"/></code>
          </div>

          <div class="items">
            <xsl:for-each select="/rss/channel/item">
              <div class="item">
                <time><xsl:value-of select="substring(pubDate, 1, 16)"/></time>
                <h2>
                  <a>
                    <xsl:attribute name="href"><xsl:value-of select="link"/></xsl:attribute>
                    <xsl:value-of select="title"/>
                  </a>
                </h2>
                <p><xsl:value-of select="description"/></p>
              </div>
            </xsl:for-each>
          </div>

          <a class="back">
            <xsl:attribute name="href"><xsl:value-of select="/rss/channel/link"/></xsl:attribute>
            <xsl:text>&#8592; Back to the writing</xsl:text>
          </a>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
