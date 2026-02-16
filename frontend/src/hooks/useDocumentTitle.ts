import { useEffect } from 'react';

const BASE_TITLE = 'League SZN';

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (title) {
      document.title = `${title} | ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
