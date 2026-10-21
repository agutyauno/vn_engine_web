// ================================================================
// VN ENGINE STUDIO - MAIN APPLICATION ENTRY POINT
// ================================================================

import { SupabaseProjectRepository } from './repository/supabaseProjectRepository';
import { StudioApp } from './studioApp';
import { AppRouter } from './router';

export { StudioApp };

// Initialize Studio & AppRouter when DOM is ready
window.addEventListener('DOMContentLoaded', async () => {
  const repository = new SupabaseProjectRepository();
  const app = new StudioApp(repository);
  (window as unknown as { studioApp?: StudioApp }).studioApp = app;
  await app.init();

  const router = new AppRouter(repository);
  router.init(async (projectId: string) => {
    await app.loadProjectById(projectId);
  });
});
