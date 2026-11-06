export interface WikiArticleEntry {
  slug: string;
  titleKey: string;
  file: string;
  adminOnly?: boolean;
  /** Slug of the article this one sits under in the article lists. */
  parent?: string;
  /** Shorter label for the article lists, where the parent already gives the context. */
  navTitleKey?: string;
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
