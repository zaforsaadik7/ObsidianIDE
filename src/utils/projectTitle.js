// Project IDs are internal routing keys. They must never become the visible
// project name when a partial record is loaded from a secondary data source.
export const getProjectDisplayTitle = (projectOrTitle, fallbackProjectId = '') => {
  const project = typeof projectOrTitle === 'object' && projectOrTitle !== null
    ? projectOrTitle
    : { title: projectOrTitle, projectId: fallbackProjectId };
  const projectId = String(project.projectId || project.id || fallbackProjectId || '').trim();
  const title = String(project.title || '').trim();

  // A real title always wins, including titles that happen to contain "proj_".
  if (title && title !== projectId) return title;

  // IDs created by CreateProjectModal use proj_<slug>_<four digits>. Recover
  // the original readable title for legacy/incomplete records only.
  const generatedIdMatch = projectId.match(/^proj_(.+)_\d{4}$/i);
  if (generatedIdMatch) {
    return generatedIdMatch[1].replace(/_+/g, ' ').trim() || 'Untitled project';
  }

  return title || projectId || 'Untitled project';
};
