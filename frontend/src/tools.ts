import { IntlShape } from "react-intl";
import { Nullable } from "tsdef";

import { filesize } from "filesize";
import { I18nConfig, FileData, defaultFormatters } from "@samuelncui/chonky";

export const hexEncode = (buf: string) => {
  var str = "";
  for (var i = 0; i < buf.length; i++) {
    str += buf[i].charCodeAt(0).toString(16);
  }
  return str;
};

export const formatFilesize = (size: number | bigint): string =>
  filesize(size as any as number, {
    base: 2,
    standard: "jedec",
  }) as string;

export const download = (buf: Uint8Array, filename: string, contentType: string) => {
  const blob = new Blob([buf.slice().buffer], { type: contentType });

  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  link.click();
};

export const sleep = (ms: number): Promise<null> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const chonkyI18n: I18nConfig = {
  locale: "es",
  messages: {
    "chonky.actions.open_selection.button.name": "Abrir selección",
    "chonky.actions.select_all_files.button.name": "Seleccionar todo",
    "chonky.actions.clear_selection.button.name": "Limpiar selección",
    "chonky.actions.switch_to_list.button.name": "Vista lista",
    "chonky.actions.switch_to_compact.button.name": "Vista compacta",
    "chonky.actions.switch_to_grid.button.name": "Vista cuadrícula",
    "chonky.actions.sort_by_name.button.name": "Ordenar por nombre",
    "chonky.actions.sort_by_size.button.name": "Ordenar por tamaño",
    "chonky.actions.sort_by_date.button.name": "Ordenar por fecha",
    "chonky.actions.toggle_hidden_files.button.name": "Mostrar archivos ocultos",
    "chonky.actions.toggle_folders_first.button.name": "Carpetas primero",
    "chonky.actions.toggle_dark_mode.button.name": "Modo oscuro",
    "chonky.actions.copy_selection.button.name": "Copiar selección",
    "chonky.actions.create_folder.button.name": "Crear carpeta",
    "chonky.actions.upload_files.button.name": "Subir archivos",
    "chonky.actions.download_files.button.name": "Descargar archivos",
    "chonky.actions.delete_files.button.name": "Eliminar archivos",
    "chonky.fileList.nothingToShow": "No hay nada que mostrar",
    "chonky.toolbar.searchPlaceholder": "Buscar",
    "chonky.actionGroups.Actions": "Acciones",
  },
  formatters: {
    ...defaultFormatters,
    formatFileSize: (_intl: IntlShape, file: Nullable<FileData>): Nullable<string> => {
      if (!file || typeof file.size !== "number") return null;
      return filesize(file.size, {
        base: 2,
        standard: "jedec",
      }) as string;
    },
  },
};
