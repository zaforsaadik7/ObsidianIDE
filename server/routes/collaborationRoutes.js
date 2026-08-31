import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { inMemoryProjectStore } from './projectRoutes.js';
import { adminDb, adminAuth } from '../config/firebaseAdmin.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// In-process cache: Map<projectId, { ownerEmail, collaborators }> — avoids repeated Firestore lookups
const projectRoleCache = new Map();

// Helper to resolve authoritative user role from repository baseline.
// Checks in-memory store first (fast path), then cache, then Firestore Admin (cold path).
// Returns null when membership cannot be established (authoritative mode); the caller
// decides whether to reject. Without adminDb (local dev) the client claim is accepted.
const resolveAuthoritativeRole = async (projectId, email, providedRole) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  const devFallback = () => (providedRole || 'EDITOR').toUpperCase();
  if (!cleanEmail) return adminDb ? null : devFallback();

  // 1. Check in-memory project store (populated by REST /api/projects calls)
  const memProj = inMemoryProjectStore.get(projectId);
  if (memProj) {
    const owner = (memProj.ownerEmail || '').trim().toLowerCase();
    if (owner && owner === cleanEmail) {
      // Cache it for WebSocket use
      projectRoleCache.set(projectId, { ownerEmail: owner, collaborators: memProj.collaborators || {} });
      return 'OWNER';
    }
    if (memProj.collaborators) {
      const matched = Object.entries(memProj.collaborators).find(([k]) => k.trim().toLowerCase() === cleanEmail);
      if (matched) {
        const v = matched[1];
        return (typeof v === 'string' ? v : (v?.role || 'EDITOR')).toUpperCase();
      }
    }
  }

  // 2. Check local cache (set by previous Firestore lookups)
  const cached = projectRoleCache.get(projectId);
  if (cached) {
    const cachedOwner = (cached.ownerEmail || '').trim().toLowerCase();
    if (cachedOwner && cachedOwner === cleanEmail) return 'OWNER';
    if (cached.collaborators) {
      const matched = Object.entries(cached.collaborators).find(([k]) => k.trim().toLowerCase() === cleanEmail);
      if (matched) {
        const v = matched[1];
        return (typeof v === 'string' ? v : (v?.role || 'EDITOR')).toUpperCase();
      }
    }
  }

  // 3. Cold path: query Firestore Admin to get authoritative ownerEmail
  if (adminDb) {
    try {
      const doc = await adminDb.collection('projects').doc(projectId).get();
      if (doc.exists) {
        const data = doc.data();
        const firestoreOwner = (data.ownerEmail || '').trim().toLowerCase();
        const collabs = data.collaborators || {};
        // Cache the result
        projectRoleCache.set(projectId, { ownerEmail: firestoreOwner, collaborators: collabs });
        // Also populate in-memory store so subsequent requests are fast
        if (!inMemoryProjectStore.has(projectId)) {
          inMemoryProjectStore.set(projectId, { ...data, projectId });
        }
        if (firestoreOwner && firestoreOwner === cleanEmail) return 'OWNER';
        const matched = Object.entries(collabs).find(([k]) => k.trim().toLowerCase() === cleanEmail);
        if (matched) {
          const v = matched[1];
          return (typeof v === 'string' ? v : (v?.role || 'EDITOR')).toUpperCase();
        }
      }
    } catch (e) {
      // Silent fallback — don't crash presence heartbeat
    }
  }

  return adminDb ? null : devFallback();
};

// Preset Distinct High-Contrast Collaborator Color Palette
const COLLABORATOR_COLORS = [
  '#00DCE5', // Cyan Neon
  '#34D399', // Emerald Green
  '#A855F7', // Vivid Purple
  '#F43F5E', // Coral Rose
  '#FBBF24', // Amber Yellow
  '#38BDF8', // Sky Blue
  '#EC4899', // Fuchsia Pink
  '#6366F1'  // Indigo Electric
];

// Room State: Map<projectId, Map<userEmail, CollaboratorPresence>>
const projectRooms = new Map();

// Project Change Attribution Log: Map<projectId, Map<filePath, FileAttribution>>
const projectChangeAttributions = new Map();

// Helper to assign stable color to an email
const getColorForEmail = (email = '') => {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLLABORATOR_COLORS.length;
  return COLLABORATOR_COLORS[index];
};

// Clean up stale users (> 25 seconds inactive)
const cleanupInactiveUsers = (projectId) => {
  const room = projectRooms.get(projectId);
  if (!room) return;

  const now = Date.now();
  for (const [email, user] of room.entries()) {
    if (now - user.lastActiveAt > 25000) {
      room.delete(email);
    }
  }
  if (room.size === 0) {
    projectRooms.delete(projectId);
  }
};

// ── REST API Endpoints ───────────────────────────────────────────────────────

// 1. POST /api/collaboration/:projectId/presence (Heartbeat & Cursor Position)
router.post('/:projectId/presence', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { 
      displayName, 
      username, 
      avatarUrl, 
      role = 'EDITOR', 
      activeFilePath, 
      cursor = { lineNumber: 1, column: 1 },
      selection = null
    } = req.body;

    const email = (req.user?.email || '').trim().toLowerCase();
    if (!projectId || !email) {
      return res.status(400).json({ error: 'projectId and a signed-in identity are required.' });
    }

    const effectiveRole = await resolveAuthoritativeRole(projectId, email, role);
    if (effectiveRole === null) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    if (!projectRooms.has(projectId)) {
      projectRooms.set(projectId, new Map());
    }

    const room = projectRooms.get(projectId);
    const userColor = getColorForEmail(email);

    const presenceData = {
      email,
      displayName: displayName || email.split('@')[0],
      username: username || `@${email.split('@')[0]}`,
      avatarUrl: avatarUrl || '',
      role: effectiveRole,
      color: userColor,
      activeFilePath: activeFilePath || '',
      cursor: {
        lineNumber: Number(cursor.lineNumber) || 1,
        column: Number(cursor.column) || 1
      },
      selection,
      lastActiveAt: Date.now(),
      status: 'active'
    };

    room.set(presenceData.email, presenceData);
    cleanupInactiveUsers(projectId);

    // Return current active peer list
    const activePeers = Array.from(room.values());
    res.json({
      status: 'SUCCESS',
      projectId,
      self: presenceData,
      activeCollaborators: activePeers,
      collaborators: activePeers
    });
  } catch (err) {
    console.error('Collaboration presence heartbeat error:', err);
    res.status(500).json({ error: 'Failed to update presence', details: err.message });
  }
});

// 2. GET /api/collaboration/:projectId/presence (List active collaborators)
router.get('/:projectId/presence', verifyToken, (req, res) => {
  try {
    const { projectId } = req.params;
    cleanupInactiveUsers(projectId);

    const room = projectRooms.get(projectId);
    const activeCollaborators = room ? Array.from(room.values()) : [];

    res.json({
      status: 'SUCCESS',
      projectId,
      count: activeCollaborators.length,
      activeCollaborators
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list active collaborators', details: err.message });
  }
});

// 3. POST /api/collaboration/:projectId/attribution (Record author of changes)
router.post('/:projectId/attribution', verifyToken, (req, res) => {
  try {
    const { projectId } = req.params;
    const { 
      filePath, 
      authorName, 
      authorRole = 'EDITOR', 
      authorAvatar = '',
      changeSummary = 'Updated file contents',
      linesAdded = 0,
      linesModified = 0
    } = req.body;

    const authorEmail = (req.user?.email || '').trim().toLowerCase();
    if (!projectId || !filePath || !authorEmail) {
      return res.status(400).json({ error: 'projectId, filePath, and a signed-in identity are required.' });
    }

    if (!projectChangeAttributions.has(projectId)) {
      projectChangeAttributions.set(projectId, new Map());
    }

    const projectMap = projectChangeAttributions.get(projectId);
    const userColor = getColorForEmail(authorEmail);

    const existingAttribution = projectMap.get(filePath) || {
      filePath,
      contributors: [],
      history: []
    };

    const newRecord = {
      authorEmail: authorEmail.trim().toLowerCase(),
      authorName: authorName || authorEmail.split('@')[0],
      authorRole: authorRole.toUpperCase(),
      authorAvatar,
      color: userColor,
      changeSummary,
      linesAdded,
      linesModified,
      timestamp: new Date().toISOString()
    };

    // Update contributor list without duplicates
    if (!existingAttribution.contributors.some(c => c.email === newRecord.authorEmail)) {
      existingAttribution.contributors.push({
        email: newRecord.authorEmail,
        name: newRecord.authorName,
        role: newRecord.authorRole,
        avatar: newRecord.authorAvatar,
        color: userColor
      });
    }

    existingAttribution.lastModifiedBy = newRecord;
    existingAttribution.history.unshift(newRecord);
    if (existingAttribution.history.length > 50) {
      existingAttribution.history.pop();
    }

    projectMap.set(filePath, existingAttribution);

    res.json({
      status: 'SUCCESS',
      attribution: existingAttribution
    });
  } catch (err) {
    console.error('Record attribution error:', err);
    res.status(500).json({ error: 'Failed to record attribution', details: err.message });
  }
});

// 4. GET /api/collaboration/:projectId/attribution (Get project attribution map)
router.get('/:projectId/attribution', verifyToken, (req, res) => {
  try {
    const { projectId } = req.params;
    const projectMap = projectChangeAttributions.get(projectId);
    const attributions = {};

    if (projectMap) {
      for (const [filePath, data] of projectMap.entries()) {
        attributions[filePath] = data;
      }
    }

    res.json({
      status: 'SUCCESS',
      projectId,
      attributions
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attributions', details: err.message });
  }
});

// ── WebSocket Collaboration Engine ──────────────────────────────────────────
export const createCollaborationWebSocket = () => {
  const wss = new WebSocketServer({ noServer: true });

  // Map of client WebSocket -> { projectId, email, ... }
  const clientSockets = new Map();

  const broadcastToRoom = (projectId, payload, excludeWs = null) => {
    const messageStr = JSON.stringify(payload);
    for (const [ws, meta] of clientSockets.entries()) {
      if (meta.projectId === projectId && ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(messageStr);
        } catch (e) {}
      }
    }
  };

  wss.on('connection', (ws) => {
    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { type, projectId, user, cursor, activeFilePath } = msg;

        if (!projectId || !type) return;

        const meta = clientSockets.get(ws);
        const isJoin = type === 'JOIN_ROOM' || type === 'JOIN_PROJECT';
        const isPresence = isJoin || type === 'HEARTBEAT' || type === 'CURSOR_MOVE';

        // Identity resolution: JOIN authenticates; all later messages reuse the
        // verified identity stored on the socket (client claims never trusted).
        let email = meta?.email || '';

        if (isPresence) {
          if (!email) {
            if (!isJoin) return; // presence update before joining — ignore
            email = (user?.email || '').trim().toLowerCase();
            if (adminAuth) {
              if (!msg.token) {
                ws.close(4401, 'Authentication required');
                return;
              }
              try {
                const decoded = await adminAuth.verifyIdToken(msg.token);
                email = (decoded.email || decoded.uid || '').trim().toLowerCase();
              } catch {
                ws.close(4401, 'Invalid or expired session');
                return;
              }
            }
            if (!email) {
              ws.close(4401, 'Identity required');
              return;
            }
          }

          const effectiveRole = await resolveAuthoritativeRole(projectId, email, user?.role);
          if (effectiveRole === null) {
            if (isJoin) {
              ws.close(4403, 'Not a member of this project');
            }
            return;
          }

          if (!projectRooms.has(projectId)) {
            projectRooms.set(projectId, new Map());
          }
          const room = projectRooms.get(projectId);
          const userColor = getColorForEmail(email);
          const presenceData = {
            email,
            displayName: user?.displayName || email.split('@')[0],
            username: user?.username || `@${email.split('@')[0]}`,
            avatarUrl: user?.avatarUrl || '',
            role: effectiveRole,
            color: userColor,
            activeFilePath: activeFilePath || '',
            cursor: cursor || { lineNumber: 1, column: 1 },
            lastActiveAt: Date.now(),
            status: 'active'
          };

          room.set(email, presenceData);
          clientSockets.set(ws, { projectId, email });

          const activeList = Array.from(room.values());
          // Broadcast to everyone else in this project
          broadcastToRoom(projectId, {
            type: 'PEER_PRESENCE_UPDATE',
            projectId,
            user: presenceData,
            activeCollaborators: activeList,
            collaborators: activeList
          });
          return;
        }

        // Non-presence messages require an established (joined) identity
        if (!email) return;
        const userColor = getColorForEmail(email);

        if (type === 'FILE_MODIFIED') {
          // Log attribution
          broadcastToRoom(projectId, {
            type: 'PEER_FILE_MODIFIED',
            projectId,
            filePath: msg.filePath,
            author: {
              email,
              name: user?.displayName || email.split('@')[0],
              avatar: user?.avatarUrl || '',
              color: userColor
            },
            timestamp: new Date().toISOString()
          });
        } else if (type === 'FORK_REQUESTED') {
          broadcastToRoom(projectId, {
            type: 'FORK_REQUESTED',
            projectId,
            requestedBy: email,
            working_files: msg.working_files,
            timestamp: new Date().toISOString()
          });
        } else if (type === 'FORK_REJECTED') {
          broadcastToRoom(projectId, {
            type: 'FORK_REJECTED',
            projectId,
            rejectedBy: email,
            timestamp: new Date().toISOString()
          });
        } else if (type === 'FORK_ACCEPTED') {
          broadcastToRoom(projectId, {
            type: 'FORK_ACCEPTED',
            projectId,
            acceptedBy: email,
            master_project_files: msg.master_project_files,
            working_files: msg.working_files,
            timestamp: new Date().toISOString()
          });
        } else if (type === 'FILES_UPDATED') {
          broadcastToRoom(projectId, {
            type: 'FILES_UPDATED',
            projectId,
            updatedBy: email,
            files: msg.files,
            master_project_files: msg.master_project_files,
            working_files: msg.working_files,
            timestamp: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn('Collaboration WS message error:', err);
      }
    });

    ws.on('close', () => {
      const meta = clientSockets.get(ws);
      if (meta) {
        const { projectId, email } = meta;
        clientSockets.delete(ws);

        const room = projectRooms.get(projectId);
        if (room) {
          room.delete(email);
          const activeList = Array.from(room.values());
          broadcastToRoom(projectId, {
            type: 'PEER_DISCONNECTED',
            projectId,
            email,
            activeCollaborators: activeList,
            collaborators: activeList
          });
        }
      }
    });
  });

  console.log('🔌 WebSocket Collaboration Server mounted on /ws/collaboration');
  return wss;
};

export default router;
