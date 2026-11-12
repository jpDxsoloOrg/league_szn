export interface WikiArticleEntry {
  slug: string;
  titleKey: string;
  file: string;
  adminOnly?: boolean;
  /** Slug of the article this one sits under in the article lists. */
  parent?: string;
  /** Shorter label for the article lists, where the parent already gives the context. */
  navTitleKey?: string;
  /**
   * English fallback title. index.json is fetched at runtime but translations
   * ship in the JS bundle, so a tab on an older bundle can meet an article
   * whose titleKey it doesn't know yet.
   */
  title?: string;
}

type Translate = (key: string, options: { defaultValue: string }) => string;

/** "call-ups" -> "Call Ups": last-resort readable title. */
export function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Translated article title that never renders the raw i18n key: falls back
 * to the entry's English `title`, then to the humanized slug.
 */
export function wikiTitle(
  t: Translate,
  entry: Pick<WikiArticleEntry, 'slug' | 'titleKey' | 'title'>,
  key: string = entry.titleKey
): string {
  return t(key, { defaultValue: entry.title ?? humanizeSlug(entry.slug) });
}

export interface WikiNavItem {
  entry: WikiArticleEntry;
  children: WikiArticleEntry[];
}

/**
 * Nests articles under their parent, wherever they sit in the index. An article
 * whose parent is not in the list stays at the top level.
 */
export function buildWikiNav(articles: WikiArticleEntry[]): WikiNavItem[] {
  const slugs = new Set(articles.map((article) => article.slug));
  const isChild = (article: WikiArticleEntry) => article.parent !== undefined && slugs.has(article.parent);
  return articles
    .filter((article) => !isChild(article))
    .map((entry) => ({
      entry,
      children: articles.filter((article) => isChild(article) && article.parent === entry.slug),
    }));
}
