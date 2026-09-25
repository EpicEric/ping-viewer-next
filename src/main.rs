use futures_util::future::join;
use std::{sync::Arc, time::Duration};
use tokio::{sync::RwLock, time::timeout};
use tracing::info;

use ping_viewer_next::{cli, device, logger, server, vehicle::zenoh_client_bridge};

#[tokio::main]
async fn main() -> std::io::Result<()> {
    // CLI should be started before logger to allow control over verbosity
    cli::manager::init();
    // Logger should start before everything else to register any log information
    logger::manager::init();

    let vehicle_data = Arc::new(RwLock::new(None));

    // Start the Zenoh-client with shared data
    tokio::spawn(zenoh_client_bridge(vehicle_data.clone()));

    let (mut manager, handler) = device::manager::DeviceManager::new(10);

    //Todo: Load previous devices
    if cli::manager::is_enable_auto_create() {
        match manager.auto_create().await {
            Ok(answer) => info!("DeviceManager initialized with following devices: {answer:?}"),
            Err(err) => info!("DeviceManager unable to initialize with devices, details {err:?}"),
        }
    }

    let (recordings_manager, recordings_manager_handler) =
        device::recording::RecordingManager::new_with_pose(
            10,
            "recordings",
            handler.clone(),
            vehicle_data,
        );
    tokio::spawn(async move { recordings_manager.run().await });

    tokio::spawn(async move { manager.run().await });

    let server_address = cli::manager::server_address();

    let result = server::manager::run(
        &server_address,
        handler.clone(),
        recordings_manager_handler.clone(),
    )
    .await;

    let _ = timeout(
        Duration::from_secs(8),
        join(
            handler.send(device::manager::Request::Shutdown),
            recordings_manager_handler.send(device::recording::RecordingManagerCommand::Shutdown),
        ),
    )
    .await;

    result
}
