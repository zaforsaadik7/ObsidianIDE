import express from 'express';
import { adminDb } from '../config/firebaseAdmin.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';
import { requireProjectRole } from '../utils/projectMembership.js';

const router = express.Router();

const requireStorage = (res) => {
  if (!adminDb) {
    res.status(503).json({ error: 'File storage backend is unavailable.' });
    return false;
  }
  return true;
};

// Resolves the projectId stored on a flat file document (or via its path convention).
const getFileProjectId = async (fileId) => {
  const snap = await adminDb.collection('files').doc(fileId).get();
  if (!snap.exists) return null;
  return { data: snap.data() || {}, projectId: (snap.data() || {}).projectId || '' };
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
        const querySnapshot = await adminDb.collection('files').where('projectId', '==', projectId).get();
        querySnapshot.forEach((docSnap) => {
          filesList.push(docSnap.data());
        });
      }
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
    if (!requireStorage(res)) return;

    const fileDoc = await getFileProjectId(fileId);
    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const membership = await requireProjectRole(req, res, fileDoc.projectId, 'EDITOR');
    if (!membership) return;

    const timestamp = new Date().toISOString();
    await adminDb.collection('files').doc(fileId).update({
      content,
      lastModifiedBy: req.user?.email || '',
      updatedAt: timestamp
    });

    res.json({
      status: 'SUCCESS',
      message: 'Atomic Firestore Write Committed Successfully!',
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
    if (!requireStorage(res)) return;

    const fileId = uuidv4();
    const timestamp = new Date().toISOString();

    const newFile = {
      fileId,
      projectId,
      filePath: filePath.trim(),
      content,
      lastModifiedBy: req.user?.email || '',
      updatedAt: timestamp
    };

    await adminDb.collection('files').doc(fileId).set(newFile);

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
    if (!requireStorage(res)) return;

    const fileDoc = await getFileProjectId(fileId);
    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const membership = await requireProjectRole(req, res, fileDoc.projectId, 'EDITOR');
    if (!membership) return;

    await adminDb.collection('files').doc(fileId).delete();

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
