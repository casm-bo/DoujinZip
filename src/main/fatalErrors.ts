import { app, dialog } from "electron";

let exiting = false;

function exitOnFatalError(error: unknown) {
  if (exiting) return;
  exiting = true;
  try {
    dialog.showErrorBox(
      "동인집 오류",
      error instanceof Error ? error.stack || error.message : String(error),
    );
  } finally {
    // Bypass tray and shutdown hooks: startup may have failed before they were initialized.
    app.exit(1);
  }
}

process.on("uncaughtException", exitOnFatalError);
process.on("unhandledRejection", exitOnFatalError);
