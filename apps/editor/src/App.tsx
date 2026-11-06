import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { ProjectRepository } from './core/contracts/repository';
import { IndexedDBProjectRepository } from './core/repositories/IndexedDBProjectRepository';
import { ProjectHubView } from './components/hub/ProjectHubView';
import { StudioWorkspacePage } from './components/studio/StudioWorkspacePage';

export type AppRoute =
  { view: 'hub'; projectId?: undefined } | { view: 'studio'; projectId: string };

export function parseHashRoute(hash: string): AppRoute {
  const cleanHash = hash.replace(/^#\/?/, '');
  if (cleanHash.startsWith('editor/') || cleanHash.startsWith('studio/')) {
    const parts = cleanHash.split('/');
    const projectId = parts[1]?.trim();
    if (projectId) {
      return { view: 'studio', projectId };
    }
  }
  return { view: 'hub' };
}

export interface AppProps {
  repository?: ProjectRepository;
  initialRoute?: AppRoute;
}

export const App: React.FC<AppProps> = ({ repository: customRepo, initialRoute }) => {
  const repo = useMemo(() => customRepo ?? new IndexedDBProjectRepository(), [customRepo]);

  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => {
    if (initialRoute) {
      return initialRoute;
    }
    if (typeof window !== 'undefined' && window.location.hash) {
      return parseHashRoute(window.location.hash);
    }
    return { view: 'hub' };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleLocationChange = () => {
      const parsed = parseHashRoute(window.location.hash);
      setCurrentRoute(parsed);
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);

    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const navigateToStudio = useCallback((projectId: string) => {
    setCurrentRoute({ view: 'studio', projectId });
    if (typeof window !== 'undefined' && window.location.hash !== `#/editor/${projectId}`) {
      window.location.hash = `#/editor/${projectId}`;
    }
  }, []);

  const navigateToHub = useCallback(() => {
    setCurrentRoute({ view: 'hub' });
    if (typeof window !== 'undefined' && window.location.hash !== '#/projects') {
      window.location.hash = '#/projects';
    }
  }, []);

  return (
    <div className="w-full h-full min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {currentRoute.view === 'studio' && currentRoute.projectId ? (
        <StudioWorkspacePage
          projectId={currentRoute.projectId}
          repository={repo}
          onBackToHub={navigateToHub}
        />
      ) : (
        <ProjectHubView repository={repo} onOpenProject={navigateToStudio} />
      )}
    </div>
  );
};

export default App;
