import express from 'express';
import { adminDb } from '../config/firebaseAdmin.js';
import { verifyToken } from '../middleware/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Multi-file template seeder for rich initial project trees
const seedMultiFileTemplates = (languageEnv, projectId, userEmail) => {
  const timestamp = new Date().toISOString();
  let files = [];

  if (languageEnv && languageEnv.includes('RUST')) {
    files = [
      {
        fileId: uuidv4(),
        projectId,
        filePath: 'src/main.rs',
        content: `// ObsidianIDE Rust Workspace Entry\nuse std::io;\n\nfn main() {\n    println!("Initializing Neural Interface...");\n    let mut buffer = String::new();\n    // Awaiting telemetry stream...\n}`,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      },
      {
        fileId: uuidv4(),
        projectId,
        filePath: 'src/router.rs',
        content: `// Message Routing Broker Module\npub struct Router {\n    pub route_id: String,\n}\n\nimpl Router {\n    pub fn new(id: &str) -> Self {\n        Self { route_id: id.to_string() }\n    }\n}`,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      },
      {
        fileId: uuidv4(),
        projectId,
        filePath: 'Cargo.toml',
        content: `[package]\nname = "quantum_router"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\ntokio = { version = "1.0", features = ["full"] }\nserde = "1.0"`,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      },
      {
        fileId: uuidv4(),
        projectId,
        filePath: 'README.md',
        content: `# Quantum Router\nHigh-throughput message routing broker leveraging Firestore flat structural collections.`,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      }
    ];
  } else if (languageEnv && languageEnv.includes('PYTHON')) {
    files = [
      {
        fileId: uuidv4(),
        projectId,
        filePath: 'neural_core.py',
        content: `# Neural Core Engine\nimport sys\nimport time\n\ndef main():\n    print("Starting PyTorch Neural Engine...")\n\nif __name__ == "__main__":\n    main()`,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      },
      {
        fileId: uuidv4(),
        projectId,
        filePath: 'requirements.txt',
        content: `torch>=2.0.0\ntransformers>=4.30.0\nnumpy>=1.24.0`,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      },
      {
        fileId: uuidv4(),
        projectId,
        filePath: 'README.md',
        content: `# Neural Engine\nAutomated task orchestration for distributed GPU clusters.`,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      }
    ];
  } else {
    // Default HTML/JS/CSS Web Template for instant Live Sandbox Preview
    files = [
      {
        fileId: uuidv4(),
        projectId,
        filePath: 'index.html',
        content: `<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { background: #0A0A0B; color: #00dce5; font-family: monospace; text-align: center; padding-top: 50px; }\n    .glow { text-shadow: 0 0 10px #00f5ff; }\n  </style>\n</head>\n<body>\n  <h1 class="glow">Obsidian Live Sandbox</h1>\n  <p>Status: Neural Stream Synced</p>\n  <script>\n    console.log("Live Sandbox Active");\n  </script>\n</body>\n</html>`,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      },
      {
        fileId: uuidv4(),
        projectId,
        filePath: 'src/app.js',
        content: `// Client-Side App Logic\nconsole.log("Obsidian App Core Initialized");`,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      },
      {
        fileId: uuidv4(),
        projectId,
        filePath: 'README.md',
        content: `# Web Application\nClient-side compiled web app instance.`,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      }
    ];
  }

  return files;
};

// GET /api/files/:projectId: Fetch flat array of files for a project
router.get('/:projectId', verifyToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { userEmail = req.user?.email || 'admin@bubt.edu.bd' } = req.query;

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

    if (filesList.length === 0) {
      filesList = seedMultiFileTemplates('PYTHON_3.11', projectId, userEmail);
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
    const { content, userEmail = req.user?.email || 'admin@bubt.edu.bd' } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'File content payload is required.' });
    }

    const timestamp = new Date().toISOString();

    if (adminDb) {
      await adminDb.collection('files').doc(fileId).update({
        content,
        lastModifiedBy: userEmail,
        updatedAt: timestamp
      });
    }

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
    const { projectId, filePath, content = '', userEmail = req.user?.email || 'admin@bubt.edu.bd' } = req.body;

    if (!projectId || !filePath) {
      return res.status(400).json({ error: 'projectId and filePath are required fields.' });
    }

    const fileId = uuidv4();
    const timestamp = new Date().toISOString();

    const newFile = {
      fileId,
      projectId,
      filePath: filePath.trim(),
      content,
      lastModifiedBy: userEmail,
      updatedAt: timestamp
    };

    if (adminDb) {
      await adminDb.collection('files').doc(fileId).set(newFile);
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
    if (adminDb) {
      await adminDb.collection('files').doc(fileId).delete();
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
