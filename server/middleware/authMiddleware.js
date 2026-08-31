import { adminAuth } from '../config/firebaseAdmin.js';

const extractDevEmail = (req) =>
  req.headers['x-user-email'] || req.body?.userEmail || req.body?.ownerEmail ||
  req.query?.userEmail || req.query?.email || req.body?.email || '';

export const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split('Bearer ')[1]?.trim()
    : '';

  // No service account configured (local dev): derive identity from email hints.
  if (!adminAuth) {
    const email = extractDevEmail(req) || 'dev@bubt.edu.bd';
    req.user = { email, uid: `uid_${email.split('@')[0]}` };
    return next();
  }

  if (!token || token === 'undefined' || token === 'null' || token.startsWith('dev-')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in again.' });
  }

  try {
    req.user = await adminAuth.verifyIdToken(token);
    return next();
  } catch (verifyErr) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
};

// Verifies the Bearer token when present but never rejects the request.
// Handlers inspect req.user and decide what unverified callers may see.
export const verifyTokenOptional = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (token && token !== 'undefined' && token !== 'null' && !token.startsWith('dev-') && adminAuth) {
      try {
        req.user = await adminAuth.verifyIdToken(token);
      } catch {
        req.user = null;
      }
    }
  }
  // No service account (local dev): fall back to email hints when supplied,
  // but leave genuinely anonymous callers (e.g. invite previews) anonymous.
  if (!req.user && !adminAuth) {
    const email = extractDevEmail(req);
    if (email) {
      req.user = { email, uid: `uid_${String(email).split('@')[0]}` };
    }
  }
  next();
};
