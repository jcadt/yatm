import { useState, useRef, useEffect, useMemo, useCallback } from "react";

import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { FileBrowser as ChonckFileBrowser, FileNavbar, FileToolbar, FileList, FileContextMenu, FileArray, FileBrowserHandle } from "@samuelncui/chonky";
import { ChonkyActions, ChonkyFileActionData, FileData } from "@samuelncui/chonky";

import { cli, convertFiles } from "../api";
import { Root } from "../api";
import { RenameFileAction, RefreshListAction, GetDataUsageAction, CreateFolder } from "../actions";
import { ToobarInfo } from "../components/toolbarInfo";

import { useDetailModal, DetailModal } from "./file-detail";
import { FileGetReply } from "../entity";
import { chonkyI18n } from "../tools";

type InputDialogState =
  | {
      mode: "create";
      open: true;
      initialValue: string;
      title: string;
      label: string;
    }
  | {
      mode: "rename";
      open: true;
      initialValue: string;
      title: string;
      label: string;
      file: FileData;
    }
  | {
      open: false;
    };

const useDualSide = () => {
  const left = useRef<FileBrowserHandle>(null);
  const right = useRef<FileBrowserHandle>(null);
  const instances = { left, right };

  const refreshAll = useCallback(async () => {
    await Promise.all(
      Object.values(instances).map((ref) => {
        if (!ref || !ref.current) {
          return;
        }
        return ref.current.requestFileAction(RefreshListAction, {});
      }),
    );
  }, [instances]);

  return { instances, refreshAll };
};

const useFileBrowser = (storageKey: string, refreshAll: () => Promise<void>, openDetailModel: (detail: FileGetReply) => void) => {
  const [files, setFiles] = useState<FileArray>(Array(1).fill(null));
  const [folderChain, setFolderChan] = useState<FileArray>([Root]);
  const [inputDialog, setInputDialog] = useState<InputDialogState>({ open: false });
  const currentID = useMemo(() => {
    if (folderChain.length === 0) {
      return "0";
    }

    const last = folderChain.slice(-1)[0];
    if (!last) {
      return "0";
    }

    return last.id;
  }, [folderChain]);

  const openFolder = useCallback(
    async (id: string, needSize: boolean = false) => {
      const [file, folderChain] = await Promise.all([cli.fileGet({ id: BigInt(id), needSize }).response, cli.fileListParents({ id: BigInt(id) }).response]);

      setFiles(convertFiles(file.children, needSize));
      setFolderChan([Root, ...convertFiles(folderChain.parents, needSize)]);
      localStorage.setItem(storageKey, id);
    },
    [setFiles, setFolderChan],
  );
  useEffect(() => {
    (async () => {
      const storagedID = localStorage.getItem(storageKey);
      if (storagedID) {
        try {
          await openFolder(storagedID);
          return;
        } catch (e) {
          console.log("open storaged id fail, err= ", e);
        }
      }

      openFolder(Root.id);
    })();
  }, []);

  const closeInputDialog = useCallback(() => {
    setInputDialog({ open: false });
  }, []);

  const submitInputDialog = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        closeInputDialog();
        return;
      }

      if (!inputDialog.open) {
        return;
      }

      switch (inputDialog.mode) {
        case "create":
          await cli.fileMkdir({ parentId: BigInt(currentID), path: trimmed }).response;
          break;
        case "rename":
          await cli.fileEdit({ id: BigInt(inputDialog.file.id), file: { name: trimmed } }).response;
          break;
      }

      closeInputDialog();
      await refreshAll();
    },
    [closeInputDialog, currentID, inputDialog, refreshAll],
  );

  const onFileAction = useCallback(
    (data: ChonkyFileActionData) => {
      switch (data.id) {
        case ChonkyActions.OpenFiles.id:
          (async () => {
            const { targetFile, files } = data.payload;

            const fileToOpen = targetFile ?? files[0];
            if (!fileToOpen) {
              return;
            }

            if (fileToOpen.isDir) {
              await openFolder(fileToOpen.id);
              return;
            }

            const file = await cli.fileGet({ id: BigInt(fileToOpen.id) }).response;
            await openDetailModel(file);
          })();

          return;
        case ChonkyActions.MoveFiles.id:
          (async () => {
            const { destination, files } = data.payload;
            for (const file of files) {
              await cli.fileEdit({
                id: BigInt(file.id),
                file: { parentId: BigInt(destination.id) },
              }).response;
            }
            await refreshAll();
          })();

          return;
        case RenameFileAction.id:
          (() => {
            const files = data.state.selectedFilesForAction;
            if (files.length === 0) {
              return;
            }

            setInputDialog({
              mode: "rename",
              open: true,
              title: "Renombrar Archivo",
              label: "Nuevo nombre",
              initialValue: files[0].name,
              file: files[0],
            });
          })();
          return;
        case CreateFolder.id:
          setInputDialog({
            mode: "create",
            open: true,
            title: "Crear Carpeta",
            label: "Nombre de la carpeta",
            initialValue: "",
          });
          return;
        case ChonkyActions.DeleteFiles.id:
          (async () => {
            const files = data.state.selectedFilesForAction;
            const fileids = files.map((file) => BigInt(file.id));
            await cli.fileDelete({ ids: fileids }).response;
            await refreshAll();
          })();

          return;
        case GetDataUsageAction.id:
          openFolder(currentID, true);
          return;
        case RefreshListAction.id:
          openFolder(currentID);
          return;
      }
    },
    [openFolder, openDetailModel, refreshAll, currentID],
  );

  const fileActions = useMemo(
    () => [CreateFolder, GetDataUsageAction, ChonkyActions.DeleteFiles, ChonkyActions.MoveFiles, RenameFileAction, RefreshListAction],
    [],
  );
  const totalSize = useMemo(() => {
    return files.reduce((total, file) => total + (file?.size ? file.size : 0), 0);
  }, [files]);

  return {
    files,
    folderChain,
    onFileAction,
    inputDialog,
    closeInputDialog,
    submitInputDialog,
    fileActions,
    defaultFileViewActionId: ChonkyActions.EnableListView.id,
    doubleClickDelay: 300,
    totalSize,
    i18n: chonkyI18n,
  };
};

export const FileBrowserType = "file";

export const FileBrowser = () => {
  const { instances, refreshAll } = useDualSide();
  const { detail, openDetailModel, closeDetailModel } = useDetailModal();

  const leftProps = useFileBrowser("file_browser:left:current_id", refreshAll, openDetailModel);
  const rightProps = useFileBrowser("file_browser:right:current_id", refreshAll, openDetailModel);

  useEffect(() => {
    Object.values(instances).map((inst) => inst.current?.requestFileAction(ChonkyActions.ToggleHiddenFiles, {}));
    const interval = setInterval(() => {
      Object.values(instances).map((inst) => inst.current && inst.current.requestFileAction(RefreshListAction, {}));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box className="browser-box">
      <Grid className="browser-container" container>
        <Grid className="browser" item xs={6}>
          <ChonckFileBrowser instanceId="left" ref={instances.left} {...leftProps}>
            <FileNavbar />
            <FileToolbar>
              <ToobarInfo files={leftProps.files} />
            </FileToolbar>
            <FileList />
            <FileContextMenu />
          </ChonckFileBrowser>
        </Grid>
        <Grid className="browser" item xs={6}>
          <ChonckFileBrowser instanceId="right" ref={instances.right} {...rightProps}>
            <FileNavbar />
            <FileToolbar>
              <ToobarInfo files={rightProps.files} />
            </FileToolbar>
            <FileList />
            <FileContextMenu />
          </ChonckFileBrowser>
        </Grid>
      </Grid>
      <DetailModal detail={detail} onClose={closeDetailModel} />
      <InputDialog
        state={leftProps.inputDialog.open ? leftProps.inputDialog : rightProps.inputDialog}
        onClose={leftProps.inputDialog.open ? leftProps.closeInputDialog : rightProps.closeInputDialog}
        onSubmit={leftProps.inputDialog.open ? leftProps.submitInputDialog : rightProps.submitInputDialog}
      />
    </Box>
  );
};

const InputDialog = ({
  state,
  onClose,
  onSubmit,
}: {
  state: InputDialogState;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
}) => {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(state.open ? state.initialValue : "");
  }, [state]);

  return (
    <Dialog
      open={state.open}
      onClose={onClose}
      maxWidth={"sm"}
      fullWidth
      PaperProps={{
        component: "form",
        onSubmit: async (event: React.FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          await onSubmit(value);
        },
      }}
    >
      <DialogTitle>{state.open ? state.title : ""}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label={state.open ? state.label : ""}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained">
          Submit
        </Button>
      </DialogActions>
    </Dialog>
  );
};