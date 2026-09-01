import express from 'express';
import { adminDb } from '../config/firebaseAdmin.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';
import { requireProjectRole } from '../utils/projectMembership.js';
import { inMemoryProjectStore, persistStoreToDisk } from './projectRoutes.js';

const router = express.Router();

// Resolves the projectId stored on a flat file document (or via inMemoryProjectStore).
const getFileProjectId = async (fileId) => {
  if (adminDb) {
    try {
      const snap = await adminDb.collection('files').doc(fileId).get();
      if (snap.exists) {
        return { data: snap.data() || {}, projectId: (snap.data() || {}).projectId || '' };
      }
    } catch (e) {}
  }
  for (const [pid, proj] of inMemoryProjectStore.entries()) {
    const allFiles = [...(proj.working_files || []), ...(proj.project_files || []), ...(proj.master_project_files || [])];
    const found = allFiles.find(f => f.fileId === fileId);
    if (found) return { data: found, projectId: pid };
  }
  return null;
};

// GET /api/files/:projectId: Fetch flat array of files for a project
router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const membership = await requireProjectRole(req, res, projectId, 'VIEWER');
    if (!membership) return;

    let filesList = [];

    if (adminDb) {
      try {
        const projectDoc = await adminDb.collection('projects').doc(projectId).get();
        if (projectDoc.exists) {
          const pData = projectDoc.data();
          filesList = pData.working_files || pData.project_files || pData.master_project_files || [];
        }
      } catch (e) {
        console.warn("Project Admin fetch notice:", e);
      }

      if (filesList.length === 0) {
        try {
          const querySnapshot = await adminDb.collection('files').where('projectId', '==', projectId).get();
          querySnapshot.forEach((docSnap) => {
            filesList.push(docSnap.data());
          });
        } catch (e) {}
      }
    }

    // Fallback to in-memory store
    if (filesList.length === 0 && inMemoryProjectStore.has(projectId)) {
      const p = inMemoryProjectStore.get(projectId);
      filesList = p.working_files || p.project_files || p.master_project_files || [];
    }

    res.json({
      status: 'SUCCESS',
      count: filesList.length,
      files: filesList
    });
  } catch (error) {
    console.error('Error fetching project files:', error);
    res.status(500).json({ error: 'Failed to fetch project files', details: error.message });
  }
});

// PUT /api/files/:fileId: Atomic Save Trigger (Overwrite content string)
router.put('/:fileId', verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'File content payload is required.' });
    }

    const fileDoc = await getFileProjectId(fileId);
    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const membership = await requireProjectRole(req, res, fileDoc.projectId, 'EDITOR');
    if (!membership) return;

    const timestamp = new Date().toISOString();
    const userEmail = req.user?.email || '';

    // Update in-memory store
    const proj = inMemoryProjectStore.get(fileDoc.projectId);
    if (proj) {
      const updateFileList = (list = []) => list.map(f => f.fileId === fileId ? { ...f, content, lastModifiedBy: userEmail, updatedAt: timestamp } : f);
      proj.working_files = updateFileList(proj.working_files || []);
      proj.project_files = updateFileList(proj.project_files || []);
      proj.master_project_files = updateFileList(proj.master_project_files || []);
      proj.updatedAt = timestamp;
      persistStoreToDisk();
    }

    if (adminDb) {
      try {
        await adminDb.collection('files').doc(fileId).update({
          content,
          lastModifiedBy: userEmail,
          updatedAt: timestamp
        });
      } catch (e) {}
    }

    res.json({
      status: 'SUCCESS',
      message: 'Atomic Write Committed Successfully!',
      updatedAt: timestamp
    });
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).json({ error: 'Failed to save file changes', details: error.message });
  }
});

// POST /api/files: Create new flat file record
router.post('/', verifyToken, async (req, res) => {
  try {
    const { projectId, filePath, content = '' } = req.body;

    if (!projectId || !filePath) {
      return res.status(400).json({ error: 'projectId and filePath are required fields.' });
    }

    const membership = await requireProjectRole(req, res, projectId, 'EDITOR');
    if (!membership) return;

    const fileId = uuidv4();
    const timestamp = new Date().toISOString();
    const userEmail = req.user?.email || '';

    const newFile = {
      fileId,
      projectId,
      filePath: filePath.trim(),
      content,
      lastModifiedBy: userEmail,
      updatedAt: timestamp
    };

    // Update in-memory store
    const proj = inMemoryProjectStore.get(projectId);
    if (proj) {
      proj.working_files = [...(proj.working_files || []), newFile];
      proj.project_files = [...(proj.project_files || []), newFile];
      proj.master_project_files = [...(proj.master_project_files || []), newFile];
      proj.updatedAt = timestamp;
      persistStoreToDisk();
    }

    if (adminDb) {
      try {
        await adminDb.collection('files').doc(fileId).set(newFile);
      } catch (e) {}
    }

    res.status(201).json({
      status: 'SUCCESS',
      message: 'New flat file created successfully.',
      file: newFile
    });
  } catch (error) {
    console.error('Error creating file:', error);
    res.status(500).json({ error: 'Failed to create file', details: error.message });
  }
});

// DELETE /api/files/:fileId: Delete flat file record
router.delete('/:fileId', verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    const fileDoc = await getFileProjectId(fileId);
    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const membership = await requireProjectRole(req, res, fileDoc.projectId, 'EDITOR');
    if (!membership) return;

    // Update in-memory store
    const proj = inMemoryProjectStore.get(fileDoc.projectId);
    if (proj) {
      const filterOut = (list = []) => list.filter(f => f.fileId !== fileId);
      proj.working_files = filterOut(proj.working_files || []);
      proj.project_files = filterOut(proj.project_files || []);
      proj.master_project_files = filterOut(proj.master_project_files || []);
      proj.updatedAt = new Date().toISOString();
      persistStoreToDisk();
    }

    if (adminDb) {
      try {
        await adminDb.collection('files').doc(fileId).delete();
      } catch (e) {}
    }

    res.json({
      status: 'SUCCESS',
      message: 'File record deleted successfully.'
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file', details: error.message });
  }
});

export default router;
