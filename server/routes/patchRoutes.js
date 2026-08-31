import express from 'express';
import { adminDb } from '../config/firebaseAdmin.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';
import { requireProjectRole } from '../utils/projectMembership.js';

const router = express.Router();

// GET /api/patches/:projectId: Fetch pending patches for a project
router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;

    const membership = await requireProjectRole(req, res, projectId, 'VIEWER');
    if (!membership) return;

    let patchesList = [];

    if (adminDb) {
      const querySnapshot = await adminDb.collection('pending_patches').where('projectId', '==', projectId).get();
      querySnapshot.forEach((docSnap) => {
        patchesList.push(docSnap.data());
      });
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
    const { projectId, fileId, authorName, diffPayload, comment } = req.body;

    if (!projectId || !fileId || !diffPayload) {
      return res.status(400).json({ error: 'projectId, fileId, and diffPayload are required.' });
    }

    const membership = await requireProjectRole(req, res, projectId, 'EDITOR');
    if (!membership) return;

    const patchId = uuidv4();
    const timestamp = new Date().toISOString();

    const newPatch = {
      patchId,
      projectId,
      fileId,
      authorName: authorName || req.user?.email?.split('@')[0] || 'Collaborator Reviewer',
      authorEmail: req.user?.email || '',
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

// POST /api/patches/:patchId/resolve: Approve or Reject a patch (project Owner only)
router.post('/:patchId/resolve', verifyToken, async (req, res) => {
  try {
    const { patchId } = req.params;
    const { action, fileId, newContent } = req.body;

    if (!action || !['APPROVE', 'REJECT'].includes(action.toUpperCase())) {
      return res.status(400).json({ error: 'Valid action (APPROVE or REJECT) is required.' });
    }

    const isApproved = action.toUpperCase() === 'APPROVE';

    if (adminDb) {
      const patchSnap = await adminDb.collection('pending_patches').doc(patchId).get();
      if (!patchSnap.exists) {
        return res.status(404).json({ error: 'Patch not found.' });
      }
      const patchData = patchSnap.data() || {};

      // Only the owner of the patch's project may resolve it.
      const membership = await requireProjectRole(req, res, patchData.projectId, 'OWNER');
      if (!membership) return;

      if (isApproved && fileId && newContent !== undefined) {
        // The target file must belong to the same project as the patch.
        const fileSnap = await adminDb.collection('files').doc(fileId).get();
        if (!fileSnap.exists || (fileSnap.data() || {}).projectId !== patchData.projectId) {
          return res.status(400).json({ error: 'Target file does not belong to this project.' });
        }
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
