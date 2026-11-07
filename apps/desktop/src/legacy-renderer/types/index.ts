import type { ComponentType, ReactNode } from 'react';

export interface Module {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  icon?: ReactNode;
}

export interface Category {
  id: string;
  name: string;
  icon: ReactNode;
  modules: Module[];
}

export interface ModuleConfig {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  component: ComponentType;
  icon?: ReactNode;
}
