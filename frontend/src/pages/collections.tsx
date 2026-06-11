import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
  Chip,
  Breadcrumbs,
  Link,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { convertFiles, Root } from "../api";
import { FileBrowser, FileNavbar, FileList, FileContextMenu, FileArray, FileBrowserHandle } from "@samuelncui/chonky";
import { chonkyI18n } from "../tools";
import { useRef } from "react";

const apiBase = (window as any).apiBase?.replace("/services", "") || "http://192.168.1.70:8080";

interface Collection {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

interface Tape {
  id: number;
  barcode: string;
  name: string;
}

export const CollectionsType = "collections";

const CollectionFileBrowser = ({ collectionId, collectionName, onBack }: { collectionId: number; collectionName: string; onBack: () => void }) => {
  const [currentFolderId, setCurrentFolderId] = useState(0);
  const [folderChain, setFolderChain] = useState<FileArray>([Root]);
  const [files, setFiles] = useState<FileArray>([]);
  const [loading, setLoading] = useState(true);
  const browserRef = useRef<FileBrowserHandle>(null);

  const loadFiles = useCallback(async (parentId: number) => {
    setLoading(true);
    try {
      const url = `${apiBase}/api/collections/${collectionId}/files?parent_id=${parentId}`;
      const res = await fetch(url);
      const data = await res.json();
      const converted = convertFiles(data.map((f: any) => ({
        id: f.id,
        name: f.name,
        mode: BigInt(f.mode),
        size: BigInt(f.size || 0),
        modTime: 0n,
      })));
      setFiles(converted);
    } catch (e) {
      console.error("load collection files fail", e);
      setFiles([]);
    }
    setLoading(false);
  }, [collectionId]);

  useEffect(() => {
    loadFiles(currentFolderId);
  }, [currentFolderId, loadFiles]);

  const handleOpenFolder = useCallback((fileId: string) => {
    const id = parseInt(fileId);
    setCurrentFolderId(id);
    setFolderChain((prev) => {
      // Only add to chain if not already navigating back
      if (prev.length > 0 && prev[prev.length - 1].id === fileId) return prev;
      const newChain = [...prev];
      const file = files.find(f => f.id === fileId);
      if (file) newChain.push(file);
      return newChain;
    });
  }, [files]);

  const handleNavigateUp = useCallback(() => {
    if (folderChain.length > 1) {
      const newChain = folderChain.slice(0, -1);
      const parent = newChain[newChain.length - 1];
      setCurrentFolderId(parseInt(parent.id));
      setFolderChain(newChain);
    }
  }, [folderChain]);

  const fileActions = useMemo(() => [], []);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", mb: 1, gap: 1 }}>
        <Button size="small" startIcon={<ArrowBackIcon />} onClick={onBack}>Volver a Colecciones</Button>
        <Typography variant="subtitle1" sx={{ ml: 1 }}>
          {collectionName}
        </Typography>
        <Box sx={{ flex: 1 }} />
      </Box>
      <Breadcrumbs sx={{ mb: 1 }}>
        {folderChain.map((f, i) => (
          i === folderChain.length - 1
            ? <Typography key={f.id} variant="body2" color="text.primary">{f.name}</Typography>
            : <Link key={f.id} variant="body2" href="#" onClick={(e) => { e.preventDefault(); handleNavigateUp(); }}>{f.name}</Link>
        ))}
      </Breadcrumbs>
      <FileBrowser
        instanceId="collection-files"
        ref={browserRef}
        files={files}
        folderChain={folderChain}
        onFileAction={(action: any) => {
          if (action.id === "open_files" && action.payload && action.payload.targetFile) {
            const file = action.payload.targetFile;
            // Check if it's a directory by looking at the mode (BigInt)
            const f = files.find(f => f.id === file.id);
            if (f) {
              handleOpenFolder(file.id);
            }
          }
        }}
        fileActions={fileActions}
        i18n={chonkyI18n}
      >
        <FileNavbar />
        <FileList />
        <FileContextMenu />
      </FileBrowser>
      {loading && <Typography sx={{ textAlign: "center", mt: 2 }}>Cargando...</Typography>}
      {!loading && files.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: "center", mt: 4 }}>
          No hay nada que mostrar
        </Typography>
      )}
    </Box>
  );
};

export const CollectionsBrowser = () => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [tapeMap, setTapeMap] = useState<Record<number, Tape[]>>({});
  const [tapeDialog, setTapeDialog] = useState<{ open: boolean; collectionId: number; tapeIdInput: string }>({
    open: false,
    collectionId: 0,
    tapeIdInput: "",
  });
  const [browsing, setBrowsing] = useState<{ id: number; name: string } | null>(null);

  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/collections`);
      const data = await res.json();
      setCollections(data);
      const tapes: Record<number, Tape[]> = {};
      for (const c of data) {
        const tres = await fetch(`${apiBase}/api/collections/${c.id}/tapes`);
        tapes[c.id] = await tres.json();
      }
      setTapeMap(tapes);
    } catch (e) {
      console.error("load collections fail", e);
    }
  }, []);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await fetch(`${apiBase}/api/collections`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
    });
    setCreateOpen(false);
    setNewName("");
    setNewDesc("");
    loadCollections();
  };

  const handleDelete = async (id: number) => {
    if (!confirm(`¿Eliminar la colección?`)) return;
    await fetch(`${apiBase}/api/collections/${id}`, { method: "DELETE" });
    loadCollections();
  };

  const handleAddTape = async () => {
    const tapeId = parseInt(tapeDialog.tapeIdInput);
    if (isNaN(tapeId)) return;
    await fetch(`${apiBase}/api/collections/${tapeDialog.collectionId}/tapes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tape_id: tapeId }),
    });
    setTapeDialog({ open: false, collectionId: 0, tapeIdInput: "" });
    loadCollections();
  };

  const handleRemoveTape = async (collectionId: number, tapeId: number) => {
    await fetch(`${apiBase}/api/collections/${collectionId}/tapes/${tapeId}`, { method: "DELETE" });
    loadCollections();
  };

  if (browsing) {
    return (
      <CollectionFileBrowser
        collectionId={browsing.id}
        collectionName={browsing.name}
        onBack={() => setBrowsing(null)}
      />
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h5">Colecciones</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Nueva Colección
        </Button>
      </Box>

      {collections.length === 0 && (
        <Typography color="text.secondary" sx={{ mt: 4, textAlign: "center" }}>
          No hay colecciones. Crea una para agrupar tus cintas.
        </Typography>
      )}

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {collections.map((col) => (
          <Card key={col.id} sx={{ width: 320 }}>
            <CardContent>
              <Typography variant="h6">{col.name}</Typography>
              {col.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {col.description}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                {tapeMap[col.id]?.length || 0} cintas
              </Typography>
              {tapeMap[col.id]?.length > 0 && (
                <Box sx={{ mt: 1, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {tapeMap[col.id].map((tape) => (
                    <Chip
                      key={tape.id}
                      label={tape.name || tape.barcode || `#${tape.id}`}
                      size="small"
                      onDelete={() => handleRemoveTape(col.id, tape.id)}
                    />
                  ))}
                </Box>
              )}
            </CardContent>
            <CardActions>
              <Button size="small" startIcon={<FolderOpenIcon />} onClick={() => setBrowsing({ id: col.id, name: col.name })}>
                Explorar
              </Button>
              <Button
                size="small"
                onClick={() => setTapeDialog({ open: true, collectionId: col.id, tapeIdInput: "" })}
              >
                + Añadir cinta
              </Button>
              <IconButton size="small" color="error" onClick={() => handleDelete(col.id)} sx={{ ml: "auto" }}>
                <DeleteIcon />
              </IconButton>
            </CardActions>
          </Card>
        ))}
      </Box>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogTitle>Nueva Colección</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nombre"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <TextField
            margin="dense"
            label="Descripción (opcional)"
            fullWidth
            multiline
            rows={2}
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreate} variant="contained">Crear</Button>
        </DialogActions>
      </Dialog>

      {/* Add Tape Dialog */}
      <Dialog open={tapeDialog.open} onClose={() => setTapeDialog({ ...tapeDialog, open: false })}>
        <DialogTitle>Añadir Cinta a Colección</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="ID de la cinta"
            fullWidth
            value={tapeDialog.tapeIdInput}
            onChange={(e) => setTapeDialog({ ...tapeDialog, tapeIdInput: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTapeDialog({ ...tapeDialog, open: false })}>Cancelar</Button>
          <Button onClick={handleAddTape} variant="contained">Añadir</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
