//! The desktop shell around the web bundle.
//!
//! The app is a static site: every calculation is local, history is in
//! `localStorage`, and nothing talks to a network. So this file's whole job is
//! to put the bundle in a window and take away everything the user did not ask
//! for — the same brief as `electron/main.js`, and deliberately with no more
//! code than that brief needs.
//!
//! ## What is not here
//!
//! No commands, no plugins beyond a debug-only logger, and no permissions
//! beyond `core:default` in `capabilities/default.json`. A Tauri command is an
//! IPC surface the frontend can call; this frontend has no use for one, and an
//! unused command is an attack surface with no upside. If one is ever added it
//! should arrive with the reason written down here.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // Logging is compiled in for debug builds only. A release build that
      // writes a log file would be writing to a path the user did not choose,
      // for an app whose whole premise is that it keeps to itself.
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
