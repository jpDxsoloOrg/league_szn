import { useEffect } from 'react';

const BASE_TITLE = 'League SZN';

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}
