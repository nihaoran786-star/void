import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './CatalogPagination.scss';

/**
 * The one pager shared by the catalog surfaces: prev · current/total · next.
 * Presentation only — every page keeps its own paging state and hands it in.
 */

interface CatalogPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const CatalogPagination: React.FC<CatalogPaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  const { t } = useTranslation('components');

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      className="catalog-pagination"
      aria-label={`${t('pagination.page', { page: currentPage + 1 })}, ${t('pagination.of', { total: totalPages })}`}
    >
      <button
        type="button"
        className="catalog-pagination__button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 0}
        aria-label={t('pagination.previous')}
        title={t('pagination.previous')}
      >
        <ChevronLeft size={15} aria-hidden />
      </button>
      <span className="catalog-pagination__status" aria-live="polite">
        <strong>{currentPage + 1}</strong>
        <span aria-hidden>/</span>
        <span>{totalPages}</span>
      </span>
      <button
        type="button"
        className="catalog-pagination__button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages - 1}
        aria-label={t('pagination.next')}
        title={t('pagination.next')}
      >
        <ChevronRight size={15} aria-hidden />
      </button>
    </nav>
  );
};

export default CatalogPagination;
export type { CatalogPaginationProps };
