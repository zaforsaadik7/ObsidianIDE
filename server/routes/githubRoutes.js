import express from 'express';
import { adminDb } from '../config/firebaseAdmin.js';
import { inMemoryProjectStore } from './projectRoutes.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Helpers to dynamically resolve client and server domains for online and local environments
export const resolveClientDomain = (req) => {
  if (process.env.APP_DOMAIN) return process.env.APP_DOMAIN.replace(/\/+$/, '');
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (req?.headers?.origin) return req.headers.origin.replace(/\/+$/, '');
  if (req?.headers?.referer) {
    try {
      const u = new URL(req.headers.referer);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }
  return 'http://localhost:3000';
};

export const resolveServerDomain = (req) => {
  if (process.env.SERVER_DOMAIN) return process.env.SERVER_DOMAIN.replace(/\/+$/, '');
  if (process.env.SERVER_URL) return process.env.SERVER_URL.replace(/\/+$/, '');
  const forwardedHost = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (forwardedHost) {
    const proto = req?.headers?.['x-forwarded-proto'] || (req?.secure ? 'https' : 'http');
    return `${proto}://${forwardedHost}`;
  }
  return 'http://localhost:5000';
};

const getUserDocIdFromEmail = (email) =>
  (email?.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '_');

// Helper: Parse GitHub Repository URL or "owner/repo" string
export const parseGitHubRepoUrl = (urlOrSlug = '') => {
  if (!urlOrSlug || typeof urlOrSlug !== 'string') return null;
  const clean = urlOrSlug.trim();
  
  // Format: https://github.com/owner/repo or https://github.com/owner/repo.git
  const httpMatch = clean.match(/github\.com\/([^\/]+)\/([^\/\.]+)(\.git)?/i);
  if (httpMatch && httpMatch[1] && httpMatch[2]) {
    return { owner: httpMatch[1], repo: httpMatch[2], fullUrl: `https://github.com/${httpMatch[1]}/${httpMatch[2]}` };
  }

  // Format: git@github.com:owner/repo.git
  const sshMatch = clean.match(/git@github\.com:([^\/]+)\/([^\/\.]+)(\.git)?/i);
  if (sshMatch && sshMatch[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2], fullUrl: `https://github.com/${sshMatch[1]}/${sshMatch[2]}` };
  }

  // Format: owner/repo
  const slugMatch = clean.match(/^([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+)$/);
  if (slugMatch && slugMatch[1] && slugMatch[2]) {
    return { owner: slugMatch[1], repo: slugMatch[2], fullUrl: `https://github.com/${slugMatch[1]}/${slugMatch[2]}` };
  }

  return null;
};

// In-Memory GitHub credentials store for development fallback
export const inMemoryGitHubStore = new Map();
const GITHUB_DEVICE_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Iv1.b507a08c87ecfe98';
let customOAuthAppConfig = {
  clientId: process.env.GITHUB_CLIENT_ID || '',
  clientSecret: process.env.GITHUB_CLIENT_SECRET || ''
};

// Server-side state store for manifest flow (avoids query params in redirect_url)
const manifestStateStore = new Map(); // key -> { email, returnUrl, createdAt }

// ── 0.0 GitHub Device Authorization Flow (VS Code Extension Style) ──────────
router.post('/device/start', async (req, res) => {
  try {
    const clientId = customOAuthAppConfig.clientId || GITHUB_DEVICE_CLIENT_ID;
    const ghRes = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'ObsidianIDE-App'
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: 'repo read:user user:email'
      })
    });

    const data = await ghRes.json();
    if (!ghRes.ok || data.error) {
      return res.status(400).json({ error: data.error_description || data.error || 'Failed to start GitHub device flow' });
    }

    res.json({
      status: 'SUCCESS',
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri || 'https://github.com/login/device',
      expiresIn: data.expires_in || 900,
      interval: data.interval || 5
    });
  } catch (err) {
    console.error('Device Flow Start Error:', err);
    res.status(500).json({ error: 'Device authorization failed', details: err.message });
  }
});

router.post('/device/poll', async (req, res) => {
  try {
    const { deviceCode, userEmail } = req.body;
    if (!deviceCode) {
      return res.status(400).json({ error: 'deviceCode is required' });
    }

    const clientId = customOAuthAppConfig.clientId || GITHUB_DEVICE_CLIENT_ID;
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'ObsidianIDE-App'
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    });

    const tokenData = await tokenRes.json();
    console.log('[DEBUG Device Poll]', JSON.stringify(tokenData));
    if (tokenData.access_token) {
      const accessToken = tokenData.access_token;
      // Fetch GitHub User Profile
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ObsidianIDE-App'
        }
      });
      const ghUser = await userRes.json();
      const username = ghUser.login || 'github_user';
      const avatarUrl = ghUser.avatar_url || '';
      const profileUrl = ghUser.html_url || `https://github.com/${username}`;

      const githubData = {
        connected: true,
        username,
        avatarUrl,
        profileUrl,
        accessToken,
        connectedAt: new Date().toISOString(),
        permissions: ['repo', 'read:user', 'user:email']
      };

      const targetEmail = (userEmail || '').trim().toLowerCase();
      if (targetEmail) {
        inMemoryGitHubStore.set(targetEmail, githubData);
        if (adminDb) {
          const cleanDocId = getUserDocIdFromEmail(targetEmail);
          await adminDb.collection('users').doc(cleanDocId).set({
            info: { github: githubData },
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      }

      return res.json({
        status: 'SUCCESS',
        github: githubData
      });
    }

    if (tokenData.error === 'authorization_pending') {
      return res.json({ status: 'PENDING', message: 'Waiting for user to enter code on GitHub...' });
    }

    if (tokenData.error === 'slow_down') {
      return res.json({ status: 'SLOW_DOWN', interval: tokenData.interval || 5 });
    }

    return res.json({ status: 'ERROR', error: tokenData.error_description || tokenData.error });
  } catch (err) {
    console.error('Device Flow Poll Error:', err);
    res.status(500).json({ error: 'Polling error', details: err.message });
  }
});

// ── 0. OAuth 2.0 Configuration & Credentials Management ─────────────────────
router.get('/oauth/config', (req, res) => {
  const clientId = customOAuthAppConfig.clientId || process.env.GITHUB_CLIENT_ID || '';
  const serverDomain = resolveServerDomain(req);
  res.json({
    status: 'SUCCESS',
    configured: Boolean(clientId),
    clientId: clientId || null,
    callbackUrl: `${serverDomain}/api/github/oauth/callback`
  });
});

router.post('/oauth/save-app-credentials', async (req, res) => {
  try {
    const { clientId, clientSecret } = req.body;
    if (!clientId || !clientId.trim()) {
      return res.status(400).json({ error: 'Client ID is required' });
    }

    customOAuthAppConfig.clientId = clientId.trim();
    if (clientSecret) customOAuthAppConfig.clientSecret = clientSecret.trim();

    res.json({
      status: 'SUCCESS',
      message: 'GitHub OAuth App credentials saved successfully!'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save OAuth credentials', details: err.message });
  }
});

// ── 0.1 GitHub App Manifest 1-Click Setup ──────────────────────────────────
// GitHub does NOT allow query params in redirect_url — so we store state server-side.
router.get('/manifest/start', (req, res) => {
  const { email, returnUrl } = req.query;
  const userEmail = (email || '').trim().toLowerCase();
  const clientDomain = resolveClientDomain(req);
  const serverDomain = resolveServerDomain(req);

  // Generate a random key and store state server-side (no query params in redirect_url)
  const stateKey = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  manifestStateStore.set(stateKey, {
    email: userEmail,
    returnUrl: returnUrl || `${clientDomain}/profile?github_connected=true`,
    createdAt: Date.now()
  });
  // Auto-expire after 10 minutes
  setTimeout(() => manifestStateStore.delete(stateKey), 10 * 60 * 1000);

  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const manifest = {
    name: `ObsidianIDE-${randSuffix}`,
    url: clientDomain,
    // redirect_url: where GitHub redirects after the app is CREATED (no query params allowed)
    redirect_url: `${serverDomain}/api/github/manifest/callback/${stateKey}`,
    // callback_urls: where GitHub redirects after user AUTHORIZES the app via OAuth
    callback_urls: [`${serverDomain}/api/github/manifest/oauth-callback`],
    // setup_url: where GitHub redirects after the user INSTALLS the app on their repos
    setup_url: `${serverDomain}/api/github/manifest/installed`,
    setup_on_update: true,
    public: false,
    default_permissions: {
      contents: 'write',
      metadata: 'read'
    },
    default_events: []
  };

  const manifestStr = JSON.stringify(manifest);

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Redirecting to GitHub...</title>
      <style>
        body { background: #0c0c12; color: #38bdf8; font-family: -apple-system, sans-serif;
               display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .spinner { width: 36px; height: 36px; border: 3px solid #38bdf8; border-top-color: transparent;
                   border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div style="text-align:center;">
        <div class="spinner"></div>
        <div style="font-size:18px;font-weight:bold;margin-bottom:8px;">Connecting to GitHub...</div>
        <div style="font-size:13px;color:#94a3b8;">Opening GitHub authorization screen...</div>
        <form id="manifestForm" action="https://github.com/settings/apps/new" method="post" style="display:none;">
          <input type="hidden" name="manifest" value='${manifestStr.replace(/'/g, "&#39;")}' />
        </form>
      </div>
      <script>document.getElementById('manifestForm').submit();</script>
    </body>
    </html>
  `);
});

// Callback uses the stateKey as a path segment — no query params
router.get('/manifest/callback/:stateKey', async (req, res) => {
  try {
    const { stateKey } = req.params;
    const { code } = req.query;

    if (!code) {
      return res.status(400).send('GitHub did not return an authorization code.');
    }

    // Look up state from server-side store
    const stateData = manifestStateStore.get(stateKey) || {};
    manifestStateStore.delete(stateKey); // consume immediately
    const userEmail = stateData.email || '';
    const clientDomain = resolveClientDomain(req);
    const returnUrl = stateData.returnUrl || `${clientDomain}/profile?github_connected=true`;

    console.log(`[Manifest] Callback for email=${userEmail}, stateKey=${stateKey}`);

    // Exchange the code for app credentials
    const convRes = await fetch(`https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'ObsidianIDE-App'
      }
    });

    const appData = await convRes.json();
    if (!convRes.ok || appData.message) {
      console.error('[Manifest] Conversion error:', appData);
      return res.send(`
        <!DOCTYPE html><html><head><title>Error</title>
        <style>body{background:#0c0c12;color:#f87171;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}</style>
        </head><body><div><h2>⚠️ GitHub App Setup Failed</h2><p>${appData.message || 'Unknown error'}</p>
        <p style="font-size:12px;color:#94a3b8;">You can try the Personal Access Token method instead.</p>
        <script>setTimeout(()=>{window.location.href='${returnUrl}';},3000);</script></div></body></html>
      `);
    }

    const owner = appData.owner || {};
    const username = owner.login || 'github_user';
    const avatarUrl = owner.avatar_url || '';
    const profileUrl = owner.html_url || `https://github.com/${username}`;

    const githubData = {
      connected: true,
      username,
      avatarUrl,
      profileUrl,
      appId: appData.id,
      clientId: appData.client_id,
      clientSecret: appData.client_secret,
      connectedAt: new Date().toISOString(),
      method: 'github_app_manifest',
      permissions: ['contents:write', 'metadata:read']
    };

    if (userEmail) {
      inMemoryGitHubStore.set(userEmail.toLowerCase(), githubData);
    }

    // Step 2: Use the newly created app's clientId to do a real OAuth authorization.
    // This gives us an actual access_token the user can use to push code.
    const oauthStateObj = {
      email: userEmail,
      returnUrl,
      appClientId: appData.client_id,
      appClientSecret: appData.client_secret,
      appSlug: appData.slug || '',
      username,
      avatarUrl,
      profileUrl,
      appId: appData.id
    };
    const oauthState = Buffer.from(JSON.stringify(oauthStateObj)).toString('base64');
    const oauthCallbackUrl = 'http://localhost:5000/api/github/manifest/oauth-callback';
    const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(appData.client_id)}&scope=repo,read:user,user:email&state=${encodeURIComponent(oauthState)}&redirect_uri=${encodeURIComponent(oauthCallbackUrl)}`;

    console.log(`[Manifest] Redirecting to OAuth with new app clientId=${appData.client_id} slug=${appData.slug}`);
    res.redirect(oauthUrl);
  } catch (err) {
    console.error('[Manifest] Callback error:', err);
    res.status(500).send(`Server error: ${err.message}`);
  }
});

// OAuth callback for the newly created GitHub App — exchanges code for access_token
router.get('/manifest/oauth-callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.send(`<html><body style="background:#0c0c12;color:#f87171;font-family:sans-serif;padding:30px;text-align:center;"><h3>Authorization Cancelled</h3><p>${error}</p><script>setTimeout(()=>window.history.back(),2000);</script></body></html>`);
    }
    if (!code || !state) return res.status(400).send('Missing code or state');

    const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    const { email: userEmail, returnUrl, appClientId, appClientSecret, appSlug, username, avatarUrl, profileUrl, appId } = stateData;

    // Exchange code for user access_token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'ObsidianIDE-App' },
      body: JSON.stringify({ client_id: appClientId, client_secret: appClientSecret, code })
    });
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('[Manifest OAuth] No access_token returned:', tokenData);
      return res.redirect(`${(returnUrl || 'http://localhost:3000/profile').split('?')[0]}?github_connected=true&gh_user=${encodeURIComponent(username)}&gh_avatar=${encodeURIComponent(avatarUrl)}&gh_profile=${encodeURIComponent(profileUrl)}&gh_connected_at=${encodeURIComponent(new Date().toISOString())}`);
    }

    const githubData = {
      connected: true,
      username,
      avatarUrl,
      profileUrl,
      accessToken,
      appId,
      appClientId,
      appSlug,
      connectedAt: new Date().toISOString(),
      method: 'github_app_manifest'
    };

    if (userEmail) {
      inMemoryGitHubStore.set(userEmail.toLowerCase(), githubData);
      if (adminDb) {
        const cleanDocId = getUserDocIdFromEmail(userEmail);
        await adminDb.collection('users').doc(cleanDocId).set(
          { info: { github: githubData }, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      }
    }
    console.log(`[Manifest OAuth] Got access_token for ${username}, saving for ${userEmail}`);

    // Step 3: Redirect to GitHub App installation page so user installs it on their repos.
    // This is REQUIRED for the token to have write access to repositories.
    if (appSlug) {
      // Store the install state so we can redirect back after installation
      const installState = Buffer.from(JSON.stringify({ email: userEmail, returnUrl, username, avatarUrl, profileUrl })).toString('base64');
      const installUrl = `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(installState)}`;
      console.log(`[Manifest OAuth] Redirecting to app installation: ${installUrl}`);

      // Show an intermediate page explaining what's happening
      return res.send(`<!DOCTYPE html>
<html>
<head><title>Almost Done! - ObsidianIDE</title>
<style>
body{font-family:-apple-system,sans-serif;background:#0c0c12;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
.card{background:#161622;border:1px solid #0e7490;border-radius:16px;padding:36px;max-width:400px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.6);}
h2{margin:0 0 8px;color:#fff;font-size:20px;} p{color:#94a3b8;font-size:13px;margin:8px 0;}
.icon{font-size:40px;margin-bottom:12px;}
.btn{display:inline-block;margin-top:20px;padding:12px 28px;background:linear-gradient(135deg,#06b6d4,#0891b2);color:#000;font-weight:700;font-size:14px;border-radius:10px;text-decoration:none;}
</style></head>
<body><div class="card">
<div class="icon">🔑</div>
<h2>One Last Step!</h2>
<p>Your GitHub App was created successfully.</p>
<p>Now <strong>install it</strong> on your repositories so ObsidianIDE can push your code.</p>
<a class="btn" href="${installUrl}">Install on My Repositories →</a>
<p style="font-size:11px;color:#475569;margin-top:16px;">Select "All repositories" for the easiest setup.</p>
</div></body></html>`);
    }

    // Fallback if no slug: redirect directly to profile
    const redirectParams = new URLSearchParams({
      github_connected: 'true',
      gh_user: username,
      gh_avatar: avatarUrl,
      gh_profile: profileUrl,
      gh_connected_at: githubData.connectedAt,
      gh_has_token: 'true'
    });
    const clientDomain = resolveClientDomain(req);
    const baseUrl = (returnUrl || `${clientDomain}/profile`).split('?')[0];
    res.redirect(`${baseUrl}?${redirectParams.toString()}`);
  } catch (err) {
    console.error('[Manifest OAuth Callback] Error:', err);
    res.status(500).send(`OAuth callback error: ${err.message}`);
  }
});

// Installation callback — GitHub redirects here after user installs the app on their repos
router.get('/manifest/installed', async (req, res) => {
  try {
    const { installation_id, setup_action, state } = req.query;
    console.log(`[Manifest Install] installation_id=${installation_id} action=${setup_action}`);

    const clientDomain = resolveClientDomain(req);
    let email = '', returnUrl = `${clientDomain}/profile`, username = '', avatarUrl = '', profileUrl = '';
    if (state) {
      try {
        const s = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        email = s.email || '';
        returnUrl = s.returnUrl || returnUrl;
        username = s.username || '';
        avatarUrl = s.avatarUrl || '';
        profileUrl = s.profileUrl || '';
      } catch (e) { /* ignore */ }
    }

    // Save installation_id to the user's GitHub data (allows future installation token use)
    if (email && installation_id) {
      const existing = inMemoryGitHubStore.get(email.toLowerCase()) || {};
      const updated = { ...existing, installationId: installation_id, fullyInstalled: true };
      inMemoryGitHubStore.set(email.toLowerCase(), updated);
    }

    // Redirect back to profile with connection confirmed
    const redirectParams = new URLSearchParams({
      github_connected: 'true',
      gh_user: username,
      gh_avatar: avatarUrl,
      gh_profile: profileUrl,
      gh_connected_at: new Date().toISOString(),
      gh_has_token: 'true'
    });
    const baseUrl = returnUrl.split('?')[0];
    res.redirect(`${baseUrl}?${redirectParams.toString()}`);
  } catch (err) {
    console.error('[Manifest Install Callback] Error:', err);
    res.redirect(`${resolveClientDomain(req)}/profile?github_connected=true`);
  }
});


// ── 0.2 Start OAuth 2.0 Flow ────────────────────────────────────────────────
router.get('/oauth/start', (req, res) => {
  const { email, returnUrl } = req.query;
  const userEmail = (email || '').trim().toLowerCase();
  const clientId = customOAuthAppConfig.clientId || process.env.GITHUB_CLIENT_ID;
  const clientDomain = resolveClientDomain(req);
  const serverDomain = resolveServerDomain(req);

  const callbackUrl = `${serverDomain}/api/github/oauth/callback`;
  const stateObj = { email: userEmail, returnUrl: returnUrl || `${clientDomain}/dashboard` };
  const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');

  if (clientId) {
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=repo,read:user,user:email&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(callbackUrl)}`;
    return res.redirect(authUrl);
  }

  // If OAuth App is not configured, redirect to manifest flow for seamless 1-click
  return res.redirect(`/api/github/manifest/start?email=${encodeURIComponent(userEmail)}&returnUrl=${encodeURIComponent(returnUrl || '')}`);
});

// ── 0.2 OAuth 2.0 Callback Handler ──────────────────────────────────────────
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.send(`
        <html><body style="background:#0c0c12;color:#f87171;font-family:sans-serif;padding:30px;text-align:center;">
          <h3>⚠️ GitHub Authorization Cancelled</h3>
          <p>${error_description || error}</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body></html>
      `);
    }

    if (!code) {
      return res.status(400).send('Authorization code missing');
    }

    const clientDomain = resolveClientDomain(req);
    let userEmail = '';
    let returnUrl = `${clientDomain}/profile?github_connected=true`;
    try {
      if (state) {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
        userEmail = decoded.email || '';
        if (decoded.returnUrl) returnUrl = decoded.returnUrl;
      }
    } catch (e) {}

    const clientId = customOAuthAppConfig.clientId || process.env.GITHUB_CLIENT_ID;
    const clientSecret = customOAuthAppConfig.clientSecret || process.env.GITHUB_CLIENT_SECRET;

    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'ObsidianIDE-App'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return res.send(`
        <html><body style="background:#0c0c12;color:#f87171;font-family:sans-serif;padding:30px;text-align:center;">
          <h3>⚠️ GitHub Token Exchange Failed</h3>
          <p>${tokenData.error_description || tokenData.error || 'Failed to exchange OAuth token'}</p>
          <script>setTimeout(() => window.location.href = '${returnUrl}', 3000);</script>
        </body></html>
      `);
    }

    const accessToken = tokenData.access_token;

    // Fetch GitHub User Profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ObsidianIDE-App'
      }
    });

    const ghUser = await userRes.json();
    const username = ghUser.login || 'github_user';
    const avatarUrl = ghUser.avatar_url || '';
    const profileUrl = ghUser.html_url || `https://github.com/${username}`;

    const githubData = {
      connected: true,
      username,
      avatarUrl,
      profileUrl,
      accessToken,
      connectedAt: new Date().toISOString(),
      permissions: ['repo', 'read:user', 'user:email']
    };

    if (userEmail) {
      inMemoryGitHubStore.set(userEmail.toLowerCase(), githubData);
      if (adminDb) {
        const cleanDocId = getUserDocIdFromEmail(userEmail);
        await adminDb.collection('users').doc(cleanDocId).set({
          info: { github: githubData },
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    }

    // Return postMessage script and redirect
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>GitHub Authorized - ObsidianIDE</title>
        <style>
          body { font-family: -apple-system, sans-serif; background: #0c0c12; color: #4ade80; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: #161622; border: 1px solid #15803d; border-radius: 16px; padding: 32px; max-width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          img { width: 64px; height: 64px; border-radius: 50%; border: 2px solid #4ade80; margin-bottom: 12px; }
          h2 { margin: 8px 0; color: #fff; font-size: 18px; }
          p { color: #86efac; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="card">
          <img src="${avatarUrl || 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'}" />
          <h2>🎉 Connected as @${username}!</h2>
          <p>Redirecting back to your profile...</p>
        </div>
        <script>
          const payload = ${JSON.stringify(githubData)};
          if (window.opener) {
            try {
              window.opener.postMessage({ type: 'GITHUB_OAUTH_SUCCESS', github: payload }, '*');
            } catch (e) {}
            setTimeout(() => window.close(), 1000);
          } else {
            setTimeout(() => { window.location.href = '${returnUrl}'; }, 800);
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('OAuth Callback Error:', err);
    res.status(500).send(`OAuth callback error: ${err.message}`);
  }
});

// ── 1. Verify GitHub Access Token / OAuth Credential ────────────────────────
router.post('/verify-token', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken || !accessToken.trim()) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    const token = accessToken.trim();
    const ghRes = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ObsidianIDE-App'
      }
    });

    if (!ghRes.ok) {
      const errBody = await ghRes.json().catch(() => ({}));
      return res.status(ghRes.status).json({
        error: 'Invalid GitHub Token',
        details: errBody.message || `GitHub returned HTTP ${ghRes.status}`
      });
    }

    const ghUser = await ghRes.json();
    const scopesHeader = ghRes.headers.get('x-oauth-scopes') || '';
    const scopes = scopesHeader.split(',').map(s => s.trim()).filter(Boolean);

    res.json({
      status: 'SUCCESS',
      user: {
        id: ghUser.id,
        login: ghUser.login,
        name: ghUser.name || ghUser.login,
        avatarUrl: ghUser.avatar_url,
        htmlUrl: ghUser.html_url,
        email: ghUser.email,
        publicRepos: ghUser.public_repos,
        scopes
      }
    });
  } catch (err) {
    console.error('GitHub token verification error:', err);
    res.status(500).json({ error: 'Failed to verify GitHub token', details: err.message });
  }
});

// ── 2. Connect GitHub Account to User Profile ───────────────────────────────
router.post('/connect-user', verifyToken, async (req, res) => {
  try {
    const { userEmail, accessToken, githubUsername, githubAvatarUrl, githubProfileUrl } = req.body;
    const targetEmail = (userEmail || req.user?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return res.status(400).json({ error: 'User email is required' });
    }

    const cleanDocId = getUserDocIdFromEmail(targetEmail);
    const githubData = {
      connected: true,
      username: githubUsername || 'github_user',
      avatarUrl: githubAvatarUrl || '',
      profileUrl: githubProfileUrl || `https://github.com/${githubUsername}`,
      accessToken: accessToken || '',
      connectedAt: new Date().toISOString(),
      permissions: ['repo', 'read:user', 'user:email']
    };

    inMemoryGitHubStore.set(targetEmail, githubData);

    if (adminDb) {
      const userDocRef = adminDb.collection('users').doc(cleanDocId);
      await userDocRef.set({
        info: {
          github: githubData
        },
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    res.json({
      status: 'SUCCESS',
      message: `GitHub account @${githubUsername} successfully connected to ${targetEmail}`,
      github: githubData
    });
  } catch (err) {
    console.error('Error connecting GitHub account:', err);
    res.status(500).json({ error: 'Failed to connect GitHub account', details: err.message });
  }
});

// ── 3. Disconnect GitHub Account ────────────────────────────────────────────
router.post('/disconnect-user', verifyToken, async (req, res) => {
  try {
    const { userEmail } = req.body;
    const targetEmail = (userEmail || req.user?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return res.status(400).json({ error: 'User email is required' });
    }

    const cleanDocId = getUserDocIdFromEmail(targetEmail);
    inMemoryGitHubStore.delete(targetEmail);

    if (adminDb) {
      const userDocRef = adminDb.collection('users').doc(cleanDocId);
      await userDocRef.set({
        info: {
          github: {
            connected: false,
            username: '',
            avatarUrl: '',
            profileUrl: '',
            accessToken: '',
            disconnectedAt: new Date().toISOString()
          }
        },
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }

    res.json({
      status: 'SUCCESS',
      message: 'GitHub account disconnected successfully'
    });
  } catch (err) {
    console.error('Error disconnecting GitHub account:', err);
    res.status(500).json({ error: 'Failed to disconnect GitHub account', details: err.message });
  }
});

// ── 4. Get User GitHub Connection Status ────────────────────────────────────
router.get('/connection-status', verifyToken, async (req, res) => {
  try {
    const { email } = req.query;
    const targetEmail = (email || req.user?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    let githubInfo = inMemoryGitHubStore.get(targetEmail) || null;

    if (!githubInfo && adminDb) {
      const cleanDocId = getUserDocIdFromEmail(targetEmail);
      const userDoc = await adminDb.collection('users').doc(cleanDocId).get();
      if (userDoc.exists) {
        const uData = userDoc.data();
        if (uData?.info?.github?.connected) {
          githubInfo = uData.info.github;
          inMemoryGitHubStore.set(targetEmail, githubInfo);
        }
      }
    }

    res.json({
      status: 'SUCCESS',
      connected: Boolean(githubInfo && githubInfo.connected),
      github: githubInfo ? {
        connected: true,
        username: githubInfo.username,
        avatarUrl: githubInfo.avatarUrl,
        profileUrl: githubInfo.profileUrl,
        connectedAt: githubInfo.connectedAt,
        accessToken: githubInfo.accessToken || null,
        hasToken: Boolean(githubInfo.accessToken),
        method: githubInfo.method || 'unknown'
      } : null
    });
  } catch (err) {
    console.error('Error retrieving GitHub connection status:', err);
    res.status(500).json({ error: 'Failed to get connection status', details: err.message });
  }
});

// ── 5. Push Project Files to GitHub Repository ──────────────────────────────
router.post('/push-project', verifyToken, async (req, res) => {
  try {
    const { 
      projectId, 
      userEmail, 
      accessToken: directToken, 
      repoUrl, 
      commitMessage, 
      branch = 'main',
      files: incomingFiles
    } = req.body;

    const targetEmail = (userEmail || req.user?.email || '').trim().toLowerCase();
    
    // Resolve Access Token
    let token = directToken ? directToken.trim() : null;
    if (!token && inMemoryGitHubStore.has(targetEmail)) {
      token = inMemoryGitHubStore.get(targetEmail).accessToken;
    }
    if (!token && adminDb && targetEmail) {
      const cleanDocId = getUserDocIdFromEmail(targetEmail);
      const uDoc = await adminDb.collection('users').doc(cleanDocId).get();
      if (uDoc.exists && uDoc.data()?.info?.github?.accessToken) {
        token = uDoc.data().info.github.accessToken;
      }
    }

    if (!token) {
      return res.status(401).json({
        error: 'GITHUB_NOT_CONNECTED',
        message: 'No GitHub account or Personal Access Token connected. Please connect your GitHub account in Profile settings.'
      });
    }

    // Resolve Target Repository
    const parsedRepo = parseGitHubRepoUrl(repoUrl);
    if (!parsedRepo) {
      return res.status(400).json({
        error: 'INVALID_REPO_URL',
        message: 'Invalid GitHub repository link. Expected format: https://github.com/owner/repository or owner/repository'
      });
    }

    const { owner, repo, fullUrl } = parsedRepo;

    // Resolve Project Files
    let projectFiles = incomingFiles && incomingFiles.length > 0 ? incomingFiles : null;
    let projectTitle = 'Project';

    if (!projectFiles && projectId) {
      if (inMemoryProjectStore.has(projectId)) {
        const mem = inMemoryProjectStore.get(projectId);
        projectFiles = mem.working_files || mem.master_project_files || mem.project_files;
        projectTitle = mem.title || projectTitle;
      } else if (adminDb) {
        const pDoc = await adminDb.collection('projects').doc(projectId).get();
        if (pDoc.exists) {
          const pData = pDoc.data();
          projectFiles = pData.working_files || pData.master_project_files || pData.project_files;
          projectTitle = pData.title || projectTitle;
        }
      }
    }

    if (!projectFiles || projectFiles.length === 0) {
      return res.status(400).json({
        error: 'NO_FILES',
        message: 'No project files found to push to GitHub.'
      });
    }

    // Filter out dummy/empty files
    const validFiles = projectFiles.filter(f => f && (f.filePath || f.fileName));
    if (validFiles.length === 0) {
      return res.status(400).json({
        error: 'NO_FILES',
        message: 'Project has no valid files to commit.'
      });
    }

    const authHeaders = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ObsidianIDE-App',
      'Content-Type': 'application/json'
    };

    // 1. Verify Repository Exists
    const repoCheckRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: authHeaders
    });

    if (!repoCheckRes.ok) {
      const errData = await repoCheckRes.json().catch(() => ({}));
      return res.status(repoCheckRes.status).json({
        error: 'REPOSITORY_NOT_FOUND',
        message: `GitHub repository '${owner}/${repo}' was not found or access was denied. Please make sure the repository exists and your token has 'repo' permissions.`,
        details: errData.message
      });
    }

    const repoInfo = await repoCheckRes.json();
    const defaultBranch = repoInfo.default_branch || branch || 'main';

    // 2. Detect if repo is empty (no commits yet) — empty repos need the Contents API
    let parentCommitSha = null;
    let baseTreeSha = null;
    let isEmptyRepo = false;

    const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, {
      headers: authHeaders
    });

    if (refRes.ok) {
      const refData = await refRes.json();
      parentCommitSha = refData.object.sha;
      const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${parentCommitSha}`, {
        headers: authHeaders
      });
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        baseTreeSha = commitData.tree.sha;
      }
    } else {
      const refErrData = await refRes.json().catch(() => ({}));
      // 409 = "Git Repository is empty" — need to use Contents API for first push
      if (refRes.status === 409 || (refErrData.message || '').toLowerCase().includes('empty')) {
        isEmptyRepo = true;
        console.log(`[Push] Repo ${owner}/${repo} is empty — will use Contents API for initial push`);
      }
    }

    // ── PATH A: Empty repo — use Contents API (works on uninitialized repos) ──
    if (isEmptyRepo) {
      const pushedFiles = [];
      for (const file of validFiles) {
        const path = (file.filePath || file.fileName || '').replace(/^\/+/, '');
        if (!path) continue;

        const content = file.content !== undefined ? file.content : '';
        const isBinary = file.isBinary || path.match(/\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|tar|exe|bin)$/i);
        let base64Content = '';

        if (isBinary && typeof content === 'string' && content.startsWith('data:')) {
          base64Content = content.split(',')[1] || content;
        } else {
          base64Content = Buffer.from(String(content), 'utf-8').toString('base64');
        }

        const encodedPath = path.split('/').map(seg => encodeURIComponent(seg)).join('/');
        
        let putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({
            message: commitMessage || `ObsidianIDE: Add ${path}`,
            content: base64Content,
            branch: defaultBranch
          })
        });

        if (!putRes.ok) {
          const putErr = await putRes.json().catch(() => ({}));
          console.error(`[Push] Contents API error for ${path}:`, putErr);
          // If branch doesn't exist yet on an uninitialized repo, try without branch param
          if (putErr.message && putErr.message.toLowerCase().includes('branch')) {
            putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`, {
              method: 'PUT',
              headers: authHeaders,
              body: JSON.stringify({
                message: commitMessage || `ObsidianIDE: Add ${path}`,
                content: base64Content
              })
            });
          }

          if (!putRes.ok) {
            const finalErr = await putRes.json().catch(() => ({}));
            return res.status(putRes.status).json({
              error: 'PUSH_FAILED',
              message: `Failed to push file ${path}: ${finalErr.message || putErr.message || 'Unknown error'}`
            });
          }
        }
        pushedFiles.push(path);
      }

      const syncTimestamp = new Date().toISOString();
      if (projectId) {
        if (inMemoryProjectStore.has(projectId)) {
          const mem = inMemoryProjectStore.get(projectId);
          mem.githubRepoUrl = fullUrl;
          mem.githubLastSyncedAt = syncTimestamp;
        }
        if (adminDb) {
          try {
            await adminDb.collection('projects').doc(projectId).set({
              githubRepoUrl: fullUrl,
              githubLastSyncedAt: syncTimestamp,
              updatedAt: syncTimestamp
            }, { merge: true });
          } catch (e) {}
        }
      }

      return res.json({
        status: 'SUCCESS',
        message: `Successfully pushed ${pushedFiles.length} files to ${owner}/${repo}`,
        pushedFilesCount: pushedFiles.length,
        repoUrl: `https://github.com/${owner}/${repo}`,
        branch: defaultBranch,
        syncedAt: syncTimestamp
      });
    }


    // 3. Create Blobs and Tree Objects for All Project Files
    const treeItems = [];
    let blobError = null;

    for (const file of validFiles) {
      const path = (file.filePath || file.fileName || '').replace(/^\/+/, '');
      if (!path) continue;

      const content = file.content !== undefined ? file.content : '';
      const isBinary = file.isBinary || path.match(/\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|tar|exe|bin)$/i);

      let blobSha = null;

      if (isBinary && content.startsWith('data:')) {
        // Base64 Binary File
        const base64Data = content.split(',')[1] || content;
        const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({
            content: base64Data,
            encoding: 'base64'
          })
        });
        const blobData = await blobRes.json();
        if (blobRes.ok) {
          blobSha = blobData.sha;
        } else {
          blobError = blobData.message || `Blob creation failed for ${path} (HTTP ${blobRes.status})`;
          console.error(`[Push] Blob error for ${path}:`, blobData);
          break;
        }
      } else {
        // UTF-8 Text File
        const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ content: String(content), encoding: 'utf-8' })
        });
        const blobData = await blobRes.json();
        if (blobRes.ok) {
          blobSha = blobData.sha;
        } else {
          blobError = blobData.message || `Blob creation failed for ${path} (HTTP ${blobRes.status})`;
          console.error(`[Push] Blob error for ${path}: status=${blobRes.status}`, blobData);
          break;
        }
      }

      if (blobSha) {
        treeItems.push({
          path,
          mode: '100644',
          type: 'blob',
          sha: blobSha
        });
      }
    }

    if (blobError) {
      return res.status(403).json({
        error: 'BLOB_CREATION_FAILED',
        message: `GitHub rejected the push: ${blobError}. This usually means the token doesn't have write access to this repository.`
      });
    }

    if (treeItems.length === 0) {
      return res.status(500).json({ error: 'No valid files found to push to GitHub.' });
    }

    // 4. Create Git Tree
    const treePayload = {
      tree: treeItems,
      ...(baseTreeSha ? { base_tree: baseTreeSha } : {})
    };

    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(treePayload)
    });

    if (!treeRes.ok) {
      const treeErr = await treeRes.json().catch(() => ({}));
      return res.status(treeRes.status).json({
        error: 'TREE_CREATION_FAILED',
        message: 'Failed to create Git tree on GitHub repository',
        details: treeErr.message
      });
    }

    const treeData = await treeRes.json();
    const newTreeSha = treeData.sha;

    // 5. Create Git Commit
    const finalCommitMsg = commitMessage || `ObsidianIDE Sync: ${projectTitle} (${new Date().toLocaleString()})`;
    const commitPayload = {
      message: finalCommitMsg,
      tree: newTreeSha,
      ...(parentCommitSha ? { parents: [parentCommitSha] } : { parents: [] })
    };

    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(commitPayload)
    });

    if (!commitRes.ok) {
      const commitErr = await commitRes.json().catch(() => ({}));
      return res.status(commitRes.status).json({
        error: 'COMMIT_CREATION_FAILED',
        message: 'Failed to create Git commit on GitHub repository',
        details: commitErr.message
      });
    }

    const newCommit = await commitRes.json();
    const newCommitSha = newCommit.sha;

    // 6. Update or Create Branch Reference
    if (parentCommitSha) {
      // Update existing branch ref
      await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({
          sha: newCommitSha,
          force: true
        })
      });
    } else {
      // Create new branch ref for empty repository
      await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          ref: `refs/heads/${defaultBranch}`,
          sha: newCommitSha
        })
      });
    }

    // 7. Save githubRepoUrl to Project Metadata for Automatic Future Pushes
    const timestamp = new Date().toISOString();
    if (projectId) {
      if (inMemoryProjectStore.has(projectId)) {
        const mem = inMemoryProjectStore.get(projectId);
        mem.githubRepoUrl = fullUrl;
        mem.githubLastSyncedAt = timestamp;
        mem.githubLastCommitSha = newCommitSha;
      }
      if (adminDb) {
        try {
          await adminDb.collection('projects').doc(projectId).set({
            githubRepoUrl: fullUrl,
            githubLastSyncedAt: timestamp,
            githubLastCommitSha: newCommitSha,
            updatedAt: timestamp
          }, { merge: true });
        } catch (dbErr) {
          console.warn('Save githubRepoUrl to Firestore notice:', dbErr.message);
        }
      }
    }

    res.json({
      status: 'SUCCESS',
      message: `Project successfully pushed to GitHub repository '${owner}/${repo}'!`,
      commitSha: newCommitSha,
      commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
      repoUrl: fullUrl,
      branch: defaultBranch,
      pushedFilesCount: treeItems.length,
      syncedAt: timestamp
    });
  } catch (err) {
    console.error('Error pushing project to GitHub:', err);
    res.status(500).json({ error: 'Failed to push project to GitHub', details: err.message });
  }
});

export default router;
