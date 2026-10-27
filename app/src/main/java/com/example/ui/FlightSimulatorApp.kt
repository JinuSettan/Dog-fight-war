package com.example.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.example.data.MultiplayerPlayerData
import com.example.data.MultiplayerRepository
import com.example.data.PilotRepository
import com.example.map.GeoFlightController
import com.example.map.GlobalAirportDatabase
import com.example.map.RealWorldLocation
import com.example.map.toRealWorldLocation
import com.example.physics.AerodynamicsEngine
import com.example.physics.AircraftConfig
import com.example.render3d.Camera3D
import com.example.render3d.Renderer3D
import com.example.render3d.World3D
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.maps.android.compose.MapType
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.launch

@Composable
fun FlightSimulatorApp(
    isGuest: Boolean = false,
    onSignOut: () -> Unit = {}
) {
    val context = LocalContext.current
    val currentUserId = Firebase.auth.currentUser?.uid ?: ""
    val userDisplayName = Firebase.auth.currentUser?.displayName ?: "Maverick"
    val daysRemaining = remember(context) { com.example.data.GuestSessionManager.getGuestDaysRemaining(context) }
    val guestCallsign = remember(context) { com.example.data.GuestSessionManager.getGuestCallsign(context) }

    // Repositories
    val multiplayerRepo = remember { MultiplayerRepository(context) }
    val pilotRepo = remember { PilotRepository(context) }

    // 1. Core Physics & Render & Map Engines
    val physics = remember { AerodynamicsEngine(AircraftConfig.F16_FIGHTER) }
    val camera = remember { Camera3D() }
    val renderer = remember { Renderer3D() }
    val world = remember { World3D() }
    val geoController = remember { GeoFlightController(RealWorldLocation.SAN_FRANCISCO_COAST) }

    // 2. Map & State Toggles & UI Dialogs
    var isRealWorldMapMode by remember { mutableStateOf(true) }
    var isLowLightMode by remember { mutableStateOf(false) }
    var isIlsActive by remember { mutableStateOf(true) }
    var showMinimap by remember { mutableStateOf(true) }
    var currentMapType by remember { mutableStateOf(MapType.SATELLITE) }
    var showPhysicsPanel by remember { mutableStateOf(false) }
    var showAircraftDialog by remember { mutableStateOf(false) }
    var showLocationDialog by remember { mutableStateOf(false) }
    var showAirportDialog by remember { mutableStateOf(false) }
    var showMultiplayerDialog by remember { mutableStateOf(false) }
    var showLinkGoogleDialog by remember { mutableStateOf(false) }

    // Multiplayer State
    var isMultiplayerActive by remember { mutableStateOf(!isGuest) }
    var currentRoomId by remember { mutableStateOf("global_airspace") }
    var currentCallsign by remember { mutableStateOf(if (isGuest) guestCallsign else userDisplayName.ifBlank { "Viper-1" }) }
    var remotePlayers by remember { mutableStateOf<List<MultiplayerPlayerData>>(emptyList()) }

    var selectedDepartureAirport by remember { mutableStateOf(com.example.map.GlobalAirportDatabase.airports.first { it.iata == "DXB" }) }
    var selectedArrivalAirport by remember { mutableStateOf(com.example.map.GlobalAirportDatabase.airports.first { it.iata == "LHR" }) }

    // Frame counter tick trigger to invalidate Compose Canvas at 60 FPS
    val frameTickState = remember { mutableLongStateOf(0L) }

    // Create Pilot Profile on initial launch
    LaunchedEffect(currentUserId) {
        if (currentUserId.isNotBlank()) {
            try {
                pilotRepo.createOrUpdatePilotProfile(
                    displayName = currentCallsign,
                    email = Firebase.auth.currentUser?.email ?: ""
                )
            } catch (_: Exception) {}
        }
    }

    // 3. Game Simulation Loop (Physics, 3D Camera, and GPS telemetry at 60 FPS)
    LaunchedEffect(Unit) {
        var lastTimeNanos = System.nanoTime()

        while (true) {
            withFrameNanos { nowNanos ->
                val dtSec = ((nowNanos - lastTimeNanos) / 1_000_000_000f).coerceIn(0.001f, 0.05f)
                lastTimeNanos = nowNanos

                // Update Flight Aerodynamics Physics
                physics.update(dtSec)

                // Update Real-World Map Coordinates & Telemetry
                geoController.update(physics, dtSec)

                // Update 3D Chase / Cockpit Camera
                camera.update(physics, dtSec)

                // Check Ring Waypoint Pass
                world.updateRingProgress(physics.position)

                frameTickState.longValue = nowNanos
            }
        }
    }

    // 4. REAL-TIME ONLINE MULTIPLAYER BROADCAST & OBSERVER COROUTINE
    LaunchedEffect(isMultiplayerActive, currentRoomId, currentUserId) {
        if (!isMultiplayerActive || currentUserId.isBlank()) {
            remotePlayers = emptyList()
            return@LaunchedEffect
        }

        // Sub-coroutine 1: Observe remote pilots in room
        launch {
            multiplayerRepo.observeRoomPlayers(currentRoomId)
                .catch { emit(emptyList()) }
                .collect { players ->
                    remotePlayers = players.filter { it.uid != currentUserId }
                }
        }

        // Sub-coroutine 2: Broadcast own position at 4 Hz (every 250ms)
        launch {
            while (true) {
                try {
                    multiplayerRepo.updatePlayerPosition(
                        roomId = currentRoomId,
                        callsign = currentCallsign,
                        aircraftName = physics.config.name,
                        lat = geoController.latitude,
                        lon = geoController.longitude,
                        altFeet = physics.altitudeFeet.toDouble(),
                        headingDeg = Math.toDegrees(physics.yawRad.toDouble()),
                        pitchDeg = Math.toDegrees(physics.pitchRad.toDouble()),
                        rollDeg = Math.toDegrees(physics.rollRad.toDouble()),
                        airspeedKnots = physics.airspeedKnots.toDouble()
                    )
                } catch (_: Exception) {}
                delay(250L)
            }
        }
    }

    // Clean up room presence when leaving app or toggling off
    DisposableEffect(currentRoomId, currentUserId) {
        onDispose {
            if (currentUserId.isNotBlank()) {
                kotlinx.coroutines.GlobalScope.launch {
                    try {
                        multiplayerRepo.leaveRoom(currentRoomId)
                    } catch (_: Exception) {}
                }
            }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF87CEEB)) // Sky Blue Background
            .testTag("flight_simulator_root")
    ) {
        // 5. GOOGLE MAPS REAL-WORLD TERRAIN BACKGROUND (Isolated, non-recomposing 60 FPS)
        if (isRealWorldMapMode) {
            RealWorldMapLayer(
                geoController = geoController,
                mapType = currentMapType,
                modifier = Modifier.fillMaxSize()
            )
        }

        // 6. 3D FLIGHT SIMULATION CANVAS (Aircraft Model, Runway, Clouds, Waypoints, Effects, Remote Jets)
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .testTag("render_3d_canvas")
        ) {
            @Suppress("UNUSED_VARIABLE")
            val tick = frameTickState.longValue

            renderer.drawWorld(
                drawScope = this,
                physics = physics,
                camera = camera,
                world = world,
                geoController = geoController,
                isMapBackground = isRealWorldMapMode,
                isLowLightMode = isLowLightMode,
                isIlsActive = isIlsActive,
                remotePlayers = remotePlayers,
                currentUserId = currentUserId
            )
        }

        // 7. TACTICAL HEADS-UP DISPLAY (HUD) WITH REAL GPS READOUT
        HudOverlay(
            physics = physics,
            world = world,
            geoController = geoController,
            onRestartMission = {
                physics.resetToCarrier()
                geoController.resetToLocation(geoController.currentLocation)
                world.generateRingCourse()
            },
            frameTickState = frameTickState,
            isIlsActive = isIlsActive,
            modifier = Modifier.fillMaxSize()
        )

        // 8. TACTICAL REAL-WORLD MINIMAP HUD WIDGET
        if (showMinimap) {
            MinimapView(
                physics = physics,
                geoController = geoController,
                currentMapType = currentMapType,
                frameTickState = frameTickState,
                remotePlayers = remotePlayers,
                currentUserId = currentUserId,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 70.dp, end = 16.dp)
            )
        }

        // 9. TOUCH CONTROLS & MAP NAVIGATION OVERLAY
        FlightControlsOverlay(
            physics = physics,
            camera = camera,
            onResetFlight = {
                if (physics.isOnGround) {
                    physics.reset(startAltitudeMeters = 1000f, startAirspeedKnots = 250f)
                } else {
                    physics.resetToCarrier()
                }
                geoController.resetToLocation(geoController.currentLocation)
            },
            onTogglePhysicsPanel = {
                showPhysicsPanel = !showPhysicsPanel
                if (showPhysicsPanel) {
                    physics.showForceVectors = true
                }
            },
            onToggleAircraftDialog = {
                showAircraftDialog = true
            },
            onToggleLocationDialog = {
                showLocationDialog = true
            },
            onToggleAirportDialog = {
                showAirportDialog = true
            },
            onToggleMultiplayerDialog = {
                if (isGuest) {
                    showLinkGoogleDialog = true
                } else {
                    showMultiplayerDialog = true
                }
            },
            isMultiplayerActive = isMultiplayerActive,
            onlinePlayerCount = remotePlayers.size,
            onToggleMapType = {
                currentMapType = when (currentMapType) {
                    MapType.SATELLITE -> MapType.TERRAIN
                    MapType.TERRAIN -> MapType.HYBRID
                    else -> MapType.SATELLITE
                }
            },
            onToggleRealWorldMap = {
                isRealWorldMapMode = !isRealWorldMapMode
            },
            onToggleMinimap = {
                showMinimap = !showMinimap
            },
            onToggleLowLightMode = {
                isLowLightMode = !isLowLightMode
            },
            isIlsActive = isIlsActive,
            onToggleIls = {
                isIlsActive = !isIlsActive
            },
            showMinimap = showMinimap,
            isRealWorldMapMode = isRealWorldMapMode,
            isLowLightMode = isLowLightMode,
            currentLocationName = geoController.currentLocation.name,
            mapTypeLabel = when (currentMapType) {
                MapType.SATELLITE -> "Satellite"
                MapType.TERRAIN -> "3D Terrain"
                MapType.HYBRID -> "Hybrid"
                else -> "Map"
            },
            frameTickState = frameTickState,
            isGuest = isGuest,
            guestDaysRemaining = daysRemaining,
            onLinkGoogleAccount = { showLinkGoogleDialog = true },
            modifier = Modifier.fillMaxSize()
        )

        // 10. AERODYNAMICS PHYSICS INSPECTOR PANEL (PHASE 1 DEBUG OVERLAY)
        if (showPhysicsPanel) {
            PhysicsSandboxPanel(
                physics = physics,
                onClose = { showPhysicsPanel = false },
                frameTickState = frameTickState,
                modifier = Modifier.align(Alignment.TopEnd)
            )
        }

        // 11. MULTIPLAYER LOBBY DIALOG
        if (showMultiplayerDialog) {
            MultiplayerLobbyDialog(
                isMultiplayerActive = isMultiplayerActive,
                currentRoomId = currentRoomId,
                currentCallsign = currentCallsign,
                onlinePlayers = remotePlayers,
                currentUserId = currentUserId,
                onToggleMultiplayer = { isMultiplayerActive = it },
                onChangeRoom = { currentRoomId = it },
                onChangeCallsign = { currentCallsign = it },
                onDismiss = { showMultiplayerDialog = false },
                isGuest = isGuest,
                guestDaysRemaining = daysRemaining,
                onLinkGoogleAccount = {
                    showMultiplayerDialog = false
                    showLinkGoogleDialog = true
                }
            )
        }

        // 12. GOOGLE ACCOUNT LINK DIALOG
        if (showLinkGoogleDialog) {
            GoogleAccountLinkDialog(
                daysRemaining = daysRemaining,
                onLinkSuccess = {
                    showLinkGoogleDialog = false
                },
                onDismiss = { showLinkGoogleDialog = false }
            )
        }

        // 13. AIRCRAFT SELECTOR DIALOG
        if (showAircraftDialog) {
            AircraftSelectorDialog(
                currentConfig = physics.config,
                onSelectAircraft = { newConfig ->
                    physics.config = newConfig
                    physics.reset(startAltitudeMeters = 1000f, startAirspeedKnots = 250f)
                },
                onDismiss = { showAircraftDialog = false }
            )
        }

        // 14. 3D REAL-WORLD LOCATION SELECTOR DIALOG
        if (showLocationDialog) {
            LocationSelectorDialog(
                currentLocation = geoController.currentLocation,
                onSelectLocation = { newLocation ->
                    geoController.resetToLocation(newLocation)
                    val recAltMeters = newLocation.recommendedAltitudeFeet / 3.28084f
                    physics.reset(startAltitudeMeters = recAltMeters, startAirspeedKnots = 320f)
                },
                onDismiss = { showLocationDialog = false }
            )
        }

        // 15. GLOBAL AIRPORT & ROUTE SELECTION DIALOG
        if (showAirportDialog) {
            AirportSelectionDialog(
                initialDeparture = selectedDepartureAirport,
                initialArrival = selectedArrivalAirport,
                onStartFlight = { dep, arr ->
                    selectedDepartureAirport = dep
                    selectedArrivalAirport = arr
                    geoController.resetToLocation(dep.toRealWorldLocation(), startAltitudeMeters = dep.elevationMeters + 10f)
                    physics.reset(startAltitudeMeters = dep.elevationMeters + 5f, startAirspeedKnots = 0f)
                    physics.currentPhase = com.example.physics.FlightPhase.PARKED_ON_RUNWAY
                },
                onDismiss = { showAirportDialog = false }
            )
        }
    }
}
