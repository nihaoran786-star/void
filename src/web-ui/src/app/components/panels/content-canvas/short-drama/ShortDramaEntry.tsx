import React from 'react';
import { Clapperboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './ShortDramaEntry.scss';

export interface ShortDramaEntryProps {
  onOpen?: () => void;
}

export const ShortDramaEntry: React.FC<ShortDramaEntryProps> = ({ onOpen }) => {
  const { t } = useTranslation('components');

  return (
    <button
      type="button"
      className="short-drama-entry"
      aria-label={t('shortDrama.entry')}
      title={t('shortDrama.entry')}
      onClick={(event) => {
        event.stopPropagation();
        onOpen?.();
      }}
    >
      <Clapperboard size={14} />
    </button>
  );
};

export default ShortDramaEntry;
