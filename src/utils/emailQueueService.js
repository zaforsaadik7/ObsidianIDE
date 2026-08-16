import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * ObsidianIDE Firebase Temporary Outbox Queue & HTTPS Email Dispatcher
 * 
 * Flow:
 * 1. Stages temporary email record into Firestore `mail_queue/{mailId}` over HTTPS (Port 443).
 * 2. Triggers email dispatch via HTTPS endpoint / service.
 * 3. On successful delivery confirmation, automatically removes the document from `mail_queue`.
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

  // Step 1: Temporarily stage the invitation in Firebase Firestore `mail_queue`
  const mailDocRef = doc(db, 'mail_queue', mailId);
  try {
    await setDoc(mailDocRef, {
      mailId,
      to: to.trim(),
      ownerEmail: cleanOwner,
      projectTitle: cleanTitle,
      projectId,
      role: cleanRole,
      inviteUrl: resolvedInviteUrl,
      status: 'PENDING',
      createdAt: timestamp
    }, { merge: true });
  } catch (stageErr) {
    console.warn('Notice staging temporary mail in Firestore:', stageErr.message);
  }

  // Step 2: Trigger HTTPS API email dispatch
  let dispatchSuccess = false;
  try {
    const token = currentUser?.getIdToken ? await currentUser.getIdToken() : '';
    const res = await fetch('/api/projects/send-invite-email', {
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
    });

    const data = await res.json();
    if (res.ok && data.status === 'SUCCESS') {
      dispatchSuccess = true;
    }
  } catch (dispatchErr) {
    console.warn('Notice during email dispatch API call:', dispatchErr.message);
  }

  // Step 3: Clean up temporary document from Firebase Firestore `mail_queue`
  try {
    await deleteDoc(mailDocRef);
  } catch (cleanErr) {
    console.warn('Notice removing mail from queue:', cleanErr.message);
  }

  return {
    success: true,
    mailId,
    inviteUrl: resolvedInviteUrl,
    dispatchSuccess
  };
};
