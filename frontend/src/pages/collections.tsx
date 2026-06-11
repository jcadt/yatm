import { useCallback, useEffect, useState } from "react";
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
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import AddIcon from "@mui/icons-material/Add";

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

export const CollectionsBrowser = ({ onBrowseCollection }: { onBrowseCollection?: (id: number, name: string) => void }) => {
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

  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/collections`);
      const data = await res.json();
      setCollections(data);
      // Load tapes for each collection
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
              {onBrowseCollection && (
                <Button size="small" startIcon={<FolderOpenIcon />} onClick={() => onBrowseCollection(col.id, col.name)}>
                  Explorar
                </Button>
              )}
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
