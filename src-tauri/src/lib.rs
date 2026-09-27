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
//! No commands of our own, and no permissions beyond the four in
//! `capabilities/default.json`. A Tauri command is an IPC surface the frontend
//! can call; an unused command is an attack surface with no upside. If one is
//! ever added it should arrive with the reason written down here.
//!
//! ## The two plugins, and why they are the exception
//!
//! `tauri-plugin-updater` and `tauri-plugin-process` are here for one feature:
//! the desktop app can update itself. That is a remote-code-execution path by
//! design — it downloads a binary and runs it — and it is safe for exactly one
//! reason: the download is verified against a public key compiled into this
//! binary (`plugins.updater.pubkey` in `tauri.conf.json`), and a package that
//! does not match is refused. The private key never leaves the build machine and
//! GitHub Secrets.
//!
//! The alternative was no update channel at all, which sounds safer and is not:
//! a user who has to re-download an installer to get a fix is a user who does
//! not get the fix. The web build has always updated itself by being reloaded;
//! this is what makes the desktop build do the same thing.
//!
//! `process` is needed only for `relaunch()` after an install. It is scoped to
//! `allow-restart` — not `process:default` — because killing the process is the
//! only thing the frontend should be able to ask for.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    /*
     * Registered unconditionally, including on mobile.
     *
     * The mobile build has no updater (the app stores do that job), but
     * `tauri-plugin-updater` compiles to a no-op there rather than failing, and
     * a `cfg` split here would mean the desktop path is the one that never gets
     * exercised by a mobile-only build. The frontend decides whether to show the
     * control; the plugin being present costs nothing.
     */
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
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
