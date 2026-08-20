import React from 'react';
import { useNurseryStore } from '../nurseryStore';
import NurseryGallery from './NurseryGallery';
import TemplateConfigPage from './TemplateConfigPage';
import AssistantConfigPage from './AssistantConfigPage';
import './AssistantHq.scss';

interface NurseryViewProps {
  isActive?: boolean;
}

const NurseryView: React.FC<NurseryViewProps> = ({ isActive = true }) => {
  const { page } = useNurseryStore();

  if (page === 'template') {
    return <TemplateConfigPage />;
  }

  if (page === 'assistant') {
    return <AssistantConfigPage isActive={isActive} />;
  }

  return <NurseryGallery />;
};

export default NurseryView;
