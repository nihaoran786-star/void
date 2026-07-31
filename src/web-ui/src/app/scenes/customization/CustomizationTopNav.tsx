import React, { useCallback } from 'react';
import { useSceneManager } from '@/app/hooks/useSceneManager';
import { useI18n } from '@/infrastructure/i18n';
import {
  CUSTOMIZATION_NAV_ITEMS,
  openCustomizationNavItem,
  type CustomizationTopNavItem,
} from './customizationNavigation';
import './CustomizationTopNav.scss';

interface CustomizationTopNavProps {
  active: Exclude<CustomizationTopNavItem, 'connectors'>;
}

const CustomizationTopNav: React.FC<CustomizationTopNavProps> = ({ active }) => {
  const { t } = useI18n('common');
  const { openScene } = useSceneManager();

  const openItem = useCallback((item: CustomizationTopNavItem) => {
    openCustomizationNavItem(item, openScene);
  }, [openScene]);

  return (
    <nav className="customization-top-nav" aria-label={t('customization.nav.ariaLabel')}>
      {CUSTOMIZATION_NAV_ITEMS.map(({ id, labelKey, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={[
            'customization-top-nav__item',
            active === id && 'is-active',
          ].filter(Boolean).join(' ')}
          aria-current={active === id ? 'page' : undefined}
          onClick={() => openItem(id)}
        >
          <Icon size={17} strokeWidth={1.8} />
          <span>{t(labelKey)}</span>
        </button>
      ))}
    </nav>
  );
};

export default CustomizationTopNav;
