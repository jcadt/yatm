import { FileData, FileArray, FileAction } from "@samuelncui/chonky";
import { ChonkyActions, defineFileAction } from "@samuelncui/chonky";

type RenameFileState = {
  contextMenuTriggerFile: FileData;
  instanceId: string;
  selectedFiles: FileArray;
  selectedFilesForAction: FileArray;
};

export const CreateFolder = defineFileAction({
  ...ChonkyActions.CreateFolder,
  button: {
    ...ChonkyActions.CreateFolder.button,
    // iconOnly: true,
  },
} as FileAction);

export const RenameFileAction = defineFileAction({
  id: "rename_file",
  requiresSelection: true,
  button: {
    name: "Renombrar Archivo",
    toolbar: true,
    contextMenu: true,
    group: "Acciones",
    icon: "mui-rename",
  },
  __extraStateType: {} as RenameFileState,
} as FileAction);

export const GetDataUsageAction = defineFileAction({
  id: "get_data_usage",
  button: {
    name: "Uso de Datos",
    toolbar: true,
    icon: "mui-data-usage",
    // iconOnly: true,
  },
  __extraStateType: {} as RenameFileState,
} as FileAction);

export const RefreshListAction = defineFileAction({
  id: "refresh_list",
} as FileAction);

export const AddFileAction = defineFileAction({
  id: "add_file",
  __payloadType: ChonkyActions.EndDragNDrop.__payloadType,
} as FileAction);

export const CreateBackupJobAction = defineFileAction({
  id: "create_backup_job",
  button: {
    name: "Crear Backup",
    toolbar: true,
    icon: "mui-fiber-new",
  },
} as FileAction);

export const CreateRestoreJobAction = defineFileAction({
  id: "create_restore_job",
  button: {
    name: "Crear Restauración",
    toolbar: true,
    icon: "mui-fiber-new",
  },
} as FileAction);

export const TrimLibraryAction = defineFileAction({
  id: "trim_library",
  button: {
    name: "Limpiar Librería",
    toolbar: true,
    icon: "mui-cleaning",
  },
} as FileAction);
