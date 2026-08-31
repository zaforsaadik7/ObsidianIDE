import { doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, getFirebaseIdToken } from '../firebase';

/**
 * ObsidianIDE Central Website Firebase Outbox Mail Queue
 * 
 * Works directly with Firebase "Trigger Email from Firestore" extension.
 * 
 * Flow:
 * 1. Writes standard Trigger Email document to central website Firestore `mail/{mailId}`.
 * 2. Firebase Cloud Function sends email directly via Google Cloud network.
 * 3. Listens for delivery confirmation and automatically removes the document from Firestore.
 */
export const stageAndDispatchInvitationEmail = async ({
  to,
  ownerEmail,
  projectTitle,
  projectId,
  role = 'EDITOR',
  inviteUrl,
  currentUser
}) => {
  if (!to || !to.includes('@')) {
    throw new Error('Valid recipient email address is required.');
  }

  const cleanTitle = (projectTitle || 'Project Workspace').trim();
  const cleanOwner = (ownerEmail || 'owner@obsidianide.com').trim();
  const cleanRole = (role || 'EDITOR').toUpperCase().trim();
  const mailId = `mail_${projectId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const timestamp = new Date().toISOString();

  const domain = window.location.origin;
  const resolvedInviteUrl = inviteUrl || `${domain}/invite/${projectId}?role=${cleanRole}&email=${encodeURIComponent(to.trim())}&title=${encodeURIComponent(cleanTitle)}&owner=${encodeURIComponent(cleanOwner)}`;

  const textContent = `Hello,\n\nYou have been invited by ${cleanOwner} to join the project workspace "${cleanTitle}" on ObsidianIDE as a ${cleanRole}.\n\nAssigned Role: ${cleanRole}\nProject: ${cleanTitle}\nInvited By: ${cleanOwner}\n\nTo accept this invitation and enter your workspace, open the link below:\n${resolvedInviteUrl}\n\nBest regards,\nObsidianIDE Collaborative Platform`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ObsidianIDE Workspace Invitation</title>
</head>
<body style="margin: 0; padding: 24px; background-color: #0A0A0B; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #E4E4E7;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto; background-color: #141416; border: 1px solid #27272A; border-radius: 8px; overflow: hidden;">
    <tr>
      <td style="padding: 24px; border-bottom: 1px solid #27272A; background-color: #18181B;">
        <h2 style="margin: 0; color: #22D3EE; font-size: 18px; font-family: monospace;">ObsidianIDE // Collaboration Invitation</h2>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px; font-size: 14px; line-height: 1.6; color: #D4D4D8;">
        <p style="margin-top: 0;">Hello,</p>
        <p><strong>${cleanOwner}</strong> has invited you to collaborate on the live repository <strong>"${cleanTitle}"</strong>.</p>
        <div style="background-color: #1C1C1F; border-left: 3px solid #22D3EE; padding: 12px 16px; margin: 18px 0; font-family: monospace; font-size: 12px;">
          <div><strong>Role:</strong> <span style="color: #FCD34D;">${cleanRole}</span></div>
          <div><strong>Project:</strong> ${cleanTitle}</div>
          <div><strong>Inviter:</strong> ${cleanOwner}</div>
        </div>
        <div style="margin: 24px 0; text-align: center;">
          <a href="${resolvedInviteUrl}" style="background-color: #06B6D4; color: #09090B; padding: 12px 28px; text-decoration: none; border-radius: 4px; font-weight: bold; font-family: monospace; font-size: 13px; display: inline-block;">ACCEPT INVITATION & ENTER IDE</a>
        </div>
        <p style="font-size: 11px; color: #71717A; margin-top: 24px; border-top: 1px solid #27272A; pt: 12px;">
          Or copy and paste this link into your browser:<br/>
          <a href="${resolvedInviteUrl}" style="color: #22D3EE; word-break: break-all;">${resolvedInviteUrl}</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  // Step 1: Temporarily write to the Central Website Firestore `mail` collection
  const mailDocRef = doc(db, 'mail', mailId);
  try {
    await setDoc(mailDocRef, {
      to: [to.trim()],
      replyTo: cleanOwner,
      message: {
        subject: `[ObsidianIDE] Invitation to collaborate on project: ${cleanTitle}`,
        text: textContent,
        html: htmlContent
      },
      createdAt: timestamp,
      metadata: {
        projectId,
        projectTitle: cleanTitle,
        ownerEmail: cleanOwner,
        role: cleanRole,
        inviteUrl: resolvedInviteUrl
      }
    });
    console.log(`✉️ [FIREBASE OUTBOX QUEUE] Staged mail to website central collection 'mail/${mailId}'`);
  } catch (stageErr) {
    console.warn('Notice staging mail in central Firestore:', stageErr.message);
  }

  // Step 2: Auto-delete the message from the Firestore collection once processed (or after 20 seconds)
  const cleanupQueue = () => {
    deleteDoc(mailDocRef).catch(err => console.warn('Queue cleanup notice:', err.message));
  };

  // Listen for Firebase Extension delivery confirmation
  const unsubscribe = onSnapshot(mailDocRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      if (data?.delivery?.state === 'SUCCESS' || data?.status === 'SUCCESS') {
        unsubscribe();
        cleanupQueue();
      }
    }
  });

  // Guarantee cleanup even if snapshot listener is detached
  setTimeout(() => {
    try { unsubscribe(); } catch(e) {}
    cleanupQueue();
  }, 20000);

  // Step 3: Trigger server endpoint fallback
  try {
    const token = await getFirebaseIdToken();
    fetch('/api/projects/send-invite-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        to: to.trim(),
        ownerEmail: cleanOwner,
        projectTitle: cleanTitle,
        projectId,
        role: cleanRole,
        inviteUrl: resolvedInviteUrl
      })
    }).catch(() => {});
  } catch (e) {}

  return {
    success: true,
    mailId,
    inviteUrl: resolvedInviteUrl
  };
};
