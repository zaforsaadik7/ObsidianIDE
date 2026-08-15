import express from 'express';
import { adminDb } from '../config/firebaseAdmin.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Mock initial patch seeds for demonstration if no pending patches exist
const seedDemoPatches = (projectId, fileId) => {
  const timestamp = new Date().toISOString();
  return [
    {
      patchId: 'patch-402',
      projectId,
      fileId,
      authorName: 'Felix Vance',
      authorEmail: 'felix@bubt.edu.bd',
      diffPayload: {
        removed: '"neural-7b-v2"',
        added: '"neural-8b-ultra-stable"'
      },
      comment: 'Updating to the latest stable release for better inference.',
      status: 'PENDING',
      submittedAt: timestamp
    },
    {
      patchId: 'patch-399',
      projectId,
      fileId,
      authorName: 'Sarah Chen',
      authorEmail: 'sarah@bubt.edu.bd',
      diffPayload: {
        removed: 'process_stream = torch.tensor(input_data)',
        added: 'process_stream = torch.as_tensor(input_data).to(device)'
      },
      comment: 'Optimizing tensor allocation to hardware accelerator device.',
      status: 'PENDING',
      submittedAt: timestamp
    }
  ];
};

// GET /api/patches/:projectId: Fetch pending patches for a project
router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    let patchesList = [];

    if (adminDb) {
      const querySnapshot = await adminDb.collection('pending_patches').where('projectId', '==', projectId).get();
      querySnapshot.forEach((docSnap) => {
        patchesList.push(docSnap.data());
      });
    }

    if (patchesList.length === 0) {
      patchesList = seedDemoPatches(projectId, 'default-file-01');
    }

    res.json({
      status: 'SUCCESS',
      count: patchesList.length,
      patches: patchesList
    });
  } catch (error) {
    console.error('Error fetching patches:', error);
    res.status(500).json({ error: 'Failed to fetch pending patches', details: error.message });
  }
});

// POST /api/patches: Submit a new reviewer patch
router.post('/', verifyToken, async (req, res) => {
  try {
    const { projectId, fileId, authorName, authorEmail, diffPayload, comment } = req.body;

    if (!projectId || !fileId || !diffPayload) {
      return res.status(400).json({ error: 'projectId, fileId, and diffPayload are required.' });
    }

    const patchId = uuidv4();
    const timestamp = new Date().toISOString();

    const newPatch = {
      patchId,
      projectId,
      fileId,
      authorName: authorName || 'Collaborator Reviewer',
      authorEmail: authorEmail || req.user?.email || 'reviewer@bubt.edu.bd',
      diffPayload,
      comment: comment || 'Reviewer code patch submitted.',
      status: 'PENDING',
      submittedAt: timestamp
    };

    if (adminDb) {
      await adminDb.collection('pending_patches').doc(patchId).set(newPatch);
    }

    res.status(201).json({
      status: 'SUCCESS',
      message: 'Code patch request submitted to validation queue!',
      patch: newPatch
    });
  } catch (error) {
    console.error('Error submitting patch:', error);
    res.status(500).json({ error: 'Failed to submit patch', details: error.message });
  }
});

// POST /api/patches/:patchId/resolve: Approve or Reject a patch
router.post('/:patchId/resolve', verifyToken, async (req, res) => {
  try {
    const { patchId } = req.params;
    const { action, fileId, newContent } = req.body;

    if (!action || !['APPROVE', 'REJECT'].includes(action.toUpperCase())) {
      return res.status(400).json({ error: 'Valid action (APPROVE or REJECT) is required.' });
    }

    const isApproved = action.toUpperCase() === 'APPROVE';

    if (adminDb) {
      if (isApproved && fileId && newContent !== undefined) {
        await adminDb.collection('files').doc(fileId).update({
          content: newContent,
          updatedAt: new Date().toISOString()
        });
      }

      try {
        await adminDb.collection('pending_patches').doc(patchId).delete();
      } catch (e) {
        console.warn("Patch doc delete notice:", e);
      }
    }

    res.json({
      status: 'SUCCESS',
      message: isApproved 
        ? 'Patch code changes committed to primary Firestore tree payload!'
        : 'Patch change request cleared from validation array queue.',
      action: action.toUpperCase()
    });
  } catch (error) {
    console.error('Error resolving patch:', error);
    res.status(500).json({ error: 'Failed to resolve patch', details: error.message });
  }
});

export default router;
