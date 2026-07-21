import express from 'express';
import { db } from '../../src/firebase.js';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where,
  updateDoc 
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Mock default project template files for initial repository seeding
const getDefaultFileContent = (languageEnv, title) => {
  if (languageEnv.includes('RUST')) {
    return {
      filePath: 'src/main.rs',
      content: `// ${title} - Rust Entry Point\nfn main() {\n    println!("Initializing ${title}...");\n}`
    };
  } else if (languageEnv.includes('PYTHON')) {
    return {
      filePath: 'main.py',
      content: `# ${title} - Python Entry Point\ndef main():\n    print("Initializing ${title}...")\n\nif __name__ == "__main__":\n    main()`
    };
  } else if (languageEnv.includes('TYPESCRIPT') || languageEnv.includes('JS')) {
    return {
      filePath: 'src/index.ts',
      content: `// ${title} - TypeScript Entry Point\nconsole.log("Initializing ${title}...");`
    };
  } else {
    return {
      filePath: 'main.go',
      content: `// ${title} - Go Entry Point\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Initializing ${title}...")\n}`
    };
  }
};

// POST /api/projects: Create new project instance
router.post('/', async (req, res) => {
  try {
    const { title, languageEnv, ownerEmail, collaborators = {} } = req.body;

    if (!title || !ownerEmail) {
      return res.status(400).json({ error: 'Title and ownerEmail are required fields.' });
    }

    const projectId = uuidv4();
    const timestamp = new Date().toISOString();

    // Map collaborators (creator is always OWNER)
    const updatedCollaborators = {
      [ownerEmail]: 'OWNER',
      ...collaborators
    };

    const newProject = {
      projectId,
      ownerEmail,
      title,
      languageEnv: languageEnv || 'RUST_1.75',
      collaborators: updatedCollaborators,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Save project document to Firestore
    await setDoc(doc(db, 'projects', projectId), newProject);

    // Seed default starter file in flat 'files' collection
    const fileId = uuidv4();
    const defaultFile = getDefaultFileContent(newProject.languageEnv, title);
    await setDoc(doc(db, 'files', fileId), {
      fileId,
      projectId,
      filePath: defaultFile.filePath,
      content: defaultFile.content,
      lastModifiedBy: ownerEmail,
      updatedAt: timestamp
    });

    res.status(201).json({
      status: 'SUCCESS',
      message: 'Project repository initialized successfully.',
      project: newProject
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to initialize project', details: error.message });
  }
});

// GET /api/projects: List projects accessible by user email
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'User email query parameter is required.' });
    }

    const projectsRef = collection(db, 'projects');
    const querySnapshot = await getDocs(projectsRef);

    const userProjects = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.collaborators && data.collaborators[email]) {
        userProjects.push({
          ...data,
          userRole: data.collaborators[email]
        });
      }
    });

    res.json({
      status: 'SUCCESS',
      count: userProjects.length,
      projects: userProjects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch user projects', details: error.message });
  }
});

// POST /api/projects/:id/invite: Add collaborator to project
router.post('/:id/invite', async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { email, role = 'EDITOR' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Collaborator email is required.' });
    }

    const projectDocRef = doc(db, 'projects', projectId);
    const projectSnap = await getDoc(projectDocRef);

    if (!projectSnap.exists()) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const projectData = projectSnap.data();
    const updatedCollaborators = {
      ...projectData.collaborators,
      [email]: role.toUpperCase()
    };

    await updateDoc(projectDocRef, {
      collaborators: updatedCollaborators,
      updatedAt: new Date().toISOString()
    });

    res.json({
      status: 'SUCCESS',
      message: `Collaborator ${email} added as ${role.toUpperCase()}.`,
      collaborators: updatedCollaborators
    });
  } catch (error) {
    console.error('Error inviting collaborator:', error);
    res.status(500).json({ error: 'Failed to send invitation', details: error.message });
  }
});

export default router;
