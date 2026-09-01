/**
 * flatTreeParser.js
 *
 * Parses a flat array of Firestore file objects (with filePath strings like "src/components/main.rs")
 * into a structured tree hierarchy suitable for rendering directory explorer UIs with rich folder actions.
 */
export function parseFlatArrayToTreeNodes(filesArray = []) {
  const root = {
    name: 'root',
    folderPath: '',
    parentPath: '',
    isFolder: true,
    children: {},
    files: []
  };

  (filesArray || []).forEach((fileObj) => {
    if (!fileObj) return;
    const rawPath = fileObj.filePath || fileObj.fileName || '';
    if (!rawPath) return;
    const cleanPath = String(rawPath).replace(/\\/g, '/').replace(/^\/+/, '');
    const parts = cleanPath.split('/').filter(Boolean);
    if (parts.length === 0) return;
    let current = root;
    let accumulatedPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.files.push({
          name: part,
          fileObj: {
            ...fileObj,
            filePath: fileObj.filePath || cleanPath,
            fileName: fileObj.fileName || part
          }
        });
      } else {
        const parentPath = accumulatedPath;
        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part;

        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            folderPath: accumulatedPath,
            parentPath: parentPath,
            isFolder: true,
            children: {},
            files: []
          };
        }
        current = current.children[part];
      }
    }
  });

  return root;
}
