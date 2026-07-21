/**
 * Parses a flat array of Firestore file objects (with filePath strings like "src/components/main.rs")
 * into a structured tree hierarchy suitable for rendering directory explorer UIs.
 */
export function parseFlatArrayToTreeNodes(filesArray = []) {
  const root = { name: 'root', isFolder: true, children: {}, files: [] };

  filesArray.forEach((fileObj) => {
    const parts = fileObj.filePath.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.files.push({
          name: part,
          fileObj
        });
      } else {
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
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
